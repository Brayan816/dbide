import re
import time
import uuid
import json
import threading
from typing import Dict, Any, List, Optional, Tuple, Set

import pymysql
from .db_manager import DatabaseSession, manager, serialize_value
from .procedure_runner import get_procedure_params

class ProcedureDebugger:
    """
    Motor de depuración de Stored Procedures para MySQL (Alternativa A - Shadow Instrumented Procedure).
    Inyecta checkpoints entre cada sentencia ejecutable y sincroniza el paso a paso
    utilizando dos conexiones MySQL y Named Locks (GET_LOCK/RELEASE_LOCK).
    """

    @staticmethod
    def parse_procedure_structure(ddl: str) -> Dict[str, Any]:
        """
        Analiza el DDL original del procedimiento para extraer:
        - Parámetros y tipos
        - Variables locales (DECLARE)
        - Mapeo de sentencias ejecutables con sus números de línea reales en el editor.
        """
        lines = ddl.splitlines()
        
        # 1. Localizar declaraciones locales (DECLARE var type [DEFAULT val];)
        local_vars: List[Dict[str, Any]] = []
        declare_pattern = re.compile(
            r'^\s*DECLARE\s+([a-zA-Z0-9_,\s]+)\s+([a-zA-Z0-9_\(\)]+)(?:\s+DEFAULT\s+([^;]+))?;',
            re.IGNORECASE
        )

        # 2. Sentencias ejecutables
        executable_statements: List[Dict[str, Any]] = []

        # Palabras clave que marcan el inicio de una sentencia ejecutable
        exec_start_pattern = re.compile(
            r'^\s*(SET|SELECT|UPDATE|INSERT|DELETE|IF|ELSEIF|ELSE|WHILE|LOOP|REPEAT|CALL|RETURN|OPEN|FETCH|CLOSE|LEAVE|ITERATE)\b',
            re.IGNORECASE
        )

        in_body = False
        body_start_line = 1

        for line_idx, line in enumerate(lines, start=1):
            trimmed = line.strip()
            
            # Detectar inicio del cuerpo
            if not in_body:
                if re.search(r'\bBEGIN\b', trimmed, re.IGNORECASE):
                    in_body = True
                    body_start_line = line_idx
                continue

            # Detectar fin del cuerpo
            if in_body and re.match(r'^\s*END(?:\s+[a-zA-Z0-9_`]+)?\s*;?\s*$', trimmed, re.IGNORECASE):
                # Línea final del procedimiento
                executable_statements.append({
                    "line": line_idx,
                    "code": trimmed,
                    "type": "END"
                })
                break

            # Buscar DECLARE
            decl_match = declare_pattern.match(trimmed)
            if decl_match:
                raw_names = decl_match.group(1).split(',')
                var_type = decl_match.group(2).strip().upper()
                default_val = decl_match.group(3).strip() if decl_match.group(3) else None
                for n in raw_names:
                    clean_name = n.strip().replace('`', '')
                    if clean_name:
                        local_vars.append({
                            "name": clean_name,
                            "type": var_type,
                            "default": default_val,
                            "line": line_idx
                        })
                continue

            # Detectar si es una sentencia ejecutable
            match_exec = exec_start_pattern.match(trimmed)
            if match_exec:
                stmt_type = match_exec.group(1).upper()
                executable_statements.append({
                    "line": line_idx,
                    "code": trimmed,
                    "type": stmt_type
                })

        return {
            "local_vars": local_vars,
            "executable_statements": executable_statements,
            "body_start_line": body_start_line,
            "total_lines": len(lines)
        }

    @staticmethod
    def generate_instrumented_ddl(
        original_ddl: str,
        session_id: str,
        target_db: str,
        proc_name: str,
        params_meta: List[Dict[str, Any]]
    ) -> Tuple[str, str, List[int]]:
        """
        Genera la versión instrumentada del procedimiento almacenado (__dbide_dbg_<proc>_<session_id>)
        inyectando checkpoints antes de cada sentencia ejecutable.
        Devuelve (shadow_proc_name, instrumented_sql, checkpoint_lines).
        """
        structure = ProcedureDebugger.parse_procedure_structure(original_ddl)
        local_vars = structure["local_vars"]
        exec_stmts = structure["executable_statements"]

        shadow_proc_name = f"__dbide_dbg_{proc_name[:20]}_{session_id}"
        lock_name = f"dbide_step_{session_id}"

        # Lista de nombres de todas las variables a monitorear (parámetros + locales)
        all_monitored_vars: List[str] = []
        for p in params_meta:
            p_name = p.get("name") or f"arg_{p.get('position', 1)}"
            clean = p_name.replace('`', '').strip()
            if clean and clean not in all_monitored_vars:
                all_monitored_vars.append(clean)

        for v in local_vars:
            v_name = v["name"]
            if v_name not in all_monitored_vars:
                all_monitored_vars.append(v_name)

        # Construir expresión JSON_OBJECT(...)
        if all_monitored_vars:
            json_args = []
            for var in all_monitored_vars:
                json_args.append(f"'{var}', `{var}`")
            vars_json_expr = f"JSON_OBJECT({', '.join(json_args)})"
        else:
            vars_json_expr = "JSON_OBJECT()"

        # Reemplazar nombre del procedimiento en la definición CREATE PROCEDURE
        # buscando: CREATE ... PROCEDURE `nombre` ...
        proc_pattern = re.compile(
            rf'(CREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?PROCEDURE\s+)(?:`{re.escape(proc_name)}`|{re.escape(proc_name)})',
            re.IGNORECASE
        )

        mod_ddl = proc_pattern.sub(rf'\1`{shadow_proc_name}`', original_ddl, count=1)
        lines = mod_ddl.splitlines()

        instrumented_lines = []
        checkpoint_lines: List[int] = []

        # Crear conjunto de números de línea de sentencias ejecutables
        stmt_by_line = {s["line"]: s for s in exec_stmts}

        for idx, line in enumerate(lines, start=1):
            if idx in stmt_by_line:
                stmt_info = stmt_by_line[idx]
                stmt_type = stmt_info["type"]
                checkpoint_lines.append(idx)

                # Inyectar checkpoint antes de la sentencia (excepto END que va al final)
                if stmt_type != "END":
                    instrumented_lines.append(f"        -- [DBIDE CHECKPOINT LINE {idx}]")
                    instrumented_lines.append(
                        f"        INSERT INTO `{target_db}`.`__dbide_debug_state` (`session_id`, `step_index`, `line_no`, `vars_json`) "
                        f"VALUES ('{session_id}', @__dbg_step_{session_id} := COALESCE(@__dbg_step_{session_id}, 0) + 1, {idx}, {vars_json_expr});"
                    )
                    instrumented_lines.append(f"        DO GET_LOCK('{lock_name}', 3600);")
                    instrumented_lines.append(f"        DO RELEASE_LOCK('{lock_name}');")
                    instrumented_lines.append(line)
                else:
                    # Antes de END, inyectar el checkpoint final
                    instrumented_lines.append(f"        -- [DBIDE FINAL CHECKPOINT LINE {idx}]")
                    instrumented_lines.append(
                        f"        INSERT INTO `{target_db}`.`__dbide_debug_state` (`session_id`, `step_index`, `line_no`, `vars_json`) "
                        f"VALUES ('{session_id}', @__dbg_step_{session_id} := COALESCE(@__dbg_step_{session_id}, 0) + 1, {idx}, {vars_json_expr});"
                    )
                    instrumented_lines.append(line)
            else:
                instrumented_lines.append(line)

        instrumented_ddl = "\n".join(instrumented_lines)
        return shadow_proc_name, instrumented_ddl, checkpoint_lines


class DebugSession:
    """
    Representa una sesión interactiva de depuración activa.
    Maneja el hilo del ejecutor y el controlador de pasos.
    """
    def __init__(self, session_id: str, db_config: Dict[str, Any], database: str, procedure_name: str):
        self.session_id = session_id
        self.db_config = db_config
        self.database = database
        self.procedure_name = procedure_name
        self.lock_name = f"dbide_step_{session_id}"
        self.shadow_proc_name = ""
        
        self.status = "IDLE"  # IDLE, RUNNING, PAUSED, FINISHED, ERROR, STOPPED
        self.current_line: Optional[int] = None
        self.current_variables: Dict[str, Any] = {}
        self.prev_variables: Dict[str, Any] = {}
        self.changed_variables: Set[str] = set()
        self.step_index = 0
        self.breakpoints: Set[int] = set()
        self.checkpoint_lines: List[int] = []
        
        self.output_result_sets: List[Dict[str, Any]] = []
        self.out_params: Dict[str, Any] = {}
        self.error_message: Optional[str] = None
        self.duration_ms: float = 0.0

        self.sess_ctrl: Optional[DatabaseSession] = None
        self.sess_exec: Optional[DatabaseSession] = None
        self.exec_thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.state_event = threading.Event()

    def start(self, param_values: Dict[str, Any], breakpoints: List[int]):
        """Inicializa e inicia la ejecución del procedimiento en modo depuración."""
        self.breakpoints = set(breakpoints or [])
        self.status = "STARTING"

        # 1. Crear sesiones MySQL independientes
        self.sess_ctrl = DatabaseSession(self.db_config)
        self.sess_exec = DatabaseSession(self.db_config)

        conn_ctrl = self.sess_ctrl.get_connection()

        with conn_ctrl.cursor() as cur:
            cur.execute(f"USE `{self.database}`;")

            # Crear tabla de estado de depuración si no existe
            cur.execute("""
                CREATE TABLE IF NOT EXISTS `__dbide_debug_state` (
                    `session_id` VARCHAR(32) NOT NULL,
                    `step_index` INT NOT NULL,
                    `line_no` INT NOT NULL,
                    `vars_json` LONGTEXT,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`session_id`, `step_index`)
                ) ENGINE=InnoDB;
            """)
            cur.execute(f"DELETE FROM `__dbide_debug_state` WHERE `session_id` = '{self.session_id}';")

            # Adquirir el bloqueo inicial en el controlador para que el ejecutor quede pausado en el primer checkpoint
            cur.execute(f"SELECT GET_LOCK('{self.lock_name}', 0);")

            # Obtener DDL original del procedimiento
            cur.execute(f"SHOW CREATE PROCEDURE `{self.database}`.`{self.procedure_name}`;")
            row = cur.fetchone()
            if not row or len(row) < 3:
                raise ValueError(f"No se pudo obtener la definición del procedimiento '{self.procedure_name}'")
            original_ddl = row[2]

            # Obtener parámetros
            params_meta = get_procedure_params(self.database, self.procedure_name)

            # Generar procedimiento instrumentado
            self.shadow_proc_name, inst_ddl, self.checkpoint_lines = ProcedureDebugger.generate_instrumented_ddl(
                original_ddl, self.session_id, self.database, self.procedure_name, params_meta
            )

            # Crear procedimiento sombra en la base de datos
            cur.execute(f"DROP PROCEDURE IF EXISTS `{self.database}`.`{self.shadow_proc_name}`;")
            cur.execute(inst_ddl)

        # 2. Iniciar el ejecutor en hilo de fondo
        self.status = "RUNNING"
        self.exec_thread = threading.Thread(
            target=self._executor_worker,
            args=(param_values, params_meta),
            daemon=True
        )
        self.exec_thread.start()

        # 3. Esperar al primer checkpoint
        self._wait_for_next_checkpoint(timeout=5.0)

    def _executor_worker(self, param_values: Dict[str, Any], params_meta: List[Dict[str, Any]]):
        """Hilo que ejecuta el procedimiento sombra."""
        conn_exec = self.sess_exec.get_connection()
        start_time = time.perf_counter()

        try:
            with conn_exec.cursor() as cur:
                cur.execute(f"USE `{self.database}`;")

                # Preparar argumentos de invocación
                setup_stmts = []
                call_args = []
                select_out_vars = []

                for p in params_meta:
                    p_name = p.get("name") or f"arg_{p.get('position', 1)}"
                    mode = (p.get("mode") or "IN").upper()
                    val = param_values.get(p_name)

                    if mode == "IN":
                        if val is None or val == "":
                            call_args.append("NULL")
                        elif isinstance(val, (int, float)):
                            call_args.append(str(val))
                        else:
                            call_args.append(conn_exec.escape(str(val)))
                    elif mode in ("OUT", "INOUT"):
                        var_name = f"@_dbg_{p_name}_{self.session_id}"
                        if mode == "INOUT" and val is not None and val != "":
                            escaped_val = conn_exec.escape(str(val)) if not isinstance(val, (int, float)) else str(val)
                            setup_stmts.append(f"SET {var_name} = {escaped_val}")
                        else:
                            setup_stmts.append(f"SET {var_name} = NULL")
                        call_args.append(var_name)
                        select_out_vars.append(f"{var_name} AS `{p_name}`")

                for stmt in setup_stmts:
                    cur.execute(stmt)

                # Inicializar variable de contador de pasos
                cur.execute(f"SET @__dbg_step_{self.session_id} = 0;")

                # Llamar al procedimiento sombra
                call_sql = f"CALL `{self.database}`.`{self.shadow_proc_name}`({', '.join(call_args)});"
                cur.execute(call_sql)

                # Recoger conjuntos de resultados devueltos (si hay SELECT dentro)
                has_more = True
                set_idx = 1
                while has_more:
                    if cur.description:
                        cols = [d[0] for d in cur.description]
                        rows = cur.fetchall()
                        self.output_result_sets.append({
                            "name": f"Resultado {set_idx}",
                            "columns": cols,
                            "rows": [[serialize_value(c) for c in r] for r in rows],
                            "row_count": len(rows)
                        })
                        set_idx += 1
                    try:
                        has_more = cur.nextset()
                    except Exception:
                        has_more = False

                # Recoger parámetros OUT / INOUT finales
                if select_out_vars:
                    cur.execute(f"SELECT {', '.join(select_out_vars)};")
                    row = cur.fetchone()
                    if row:
                        for idx, p in enumerate(select_out_vars):
                            p_clean = p.split('AS')[-1].strip().replace('`', '')
                            self.out_params[p_clean] = serialize_value(row[idx])

            self.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            with self.lock:
                if self.status != "STOPPED":
                    self.status = "FINISHED"

        except Exception as e:
            self.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            with self.lock:
                if self.status != "STOPPED":
                    self.status = "ERROR"
                    self.error_message = str(e)
        finally:
            self.state_event.set()

    def _wait_for_next_checkpoint(self, timeout: float = 3.0) -> bool:
        """Sondea la tabla de estado hasta que el ejecutor reporte un nuevo paso o termine."""
        conn_ctrl = self.sess_ctrl.get_connection()
        deadline = time.time() + timeout

        while time.time() < deadline:
            if self.status in ("FINISHED", "ERROR", "STOPPED"):
                return True

            with conn_ctrl.cursor() as cur:
                cur.execute(
                    f"SELECT step_index, line_no, vars_json FROM `{self.database}`.`__dbide_debug_state` "
                    f"WHERE `session_id` = '{self.session_id}' AND step_index > {self.step_index} "
                    f"ORDER BY step_index ASC LIMIT 1;"
                )
                row = cur.fetchone()
                if row:
                    step_idx, line_no, raw_vars = row
                    with self.lock:
                        self.step_index = step_idx
                        self.current_line = line_no
                        self.prev_variables = dict(self.current_variables)
                        try:
                            self.current_variables = json.loads(raw_vars) if raw_vars else {}
                        except Exception:
                            self.current_variables = {}

                        # Calcular variables que cambiaron de valor
                        self.changed_variables = {
                            k for k, v in self.current_variables.items()
                            if self.prev_variables.get(k) != v
                        }
                        self.status = "PAUSED"
                    return True

            time.sleep(0.04)

        return False

    def step_over(self) -> Dict[str, Any]:
        """Avanza una instrucción (F10 / Step Over)."""
        if self.status != "PAUSED":
            return self.get_state()

        conn_ctrl = self.sess_ctrl.get_connection()
        with conn_ctrl.cursor() as cur:
            # Liberar el bloqueo brevemente para permitir que el ejecutor avance un paso y readquirirlo
            cur.execute(f"SELECT RELEASE_LOCK('{self.lock_name}');")
            time.sleep(0.03)
            cur.execute(f"SELECT GET_LOCK('{self.lock_name}', 0);")

        self.status = "RUNNING"
        self._wait_for_next_checkpoint(timeout=5.0)
        return self.get_state()

    def continue_execution(self) -> Dict[str, Any]:
        """Continúa la ejecución (F5 / Continue) hasta el siguiente breakpoint o el final."""
        if self.status != "PAUSED":
            return self.get_state()

        # Avanzar en bucle hasta que alcancemos un breakpoint o finalice
        while self.status == "PAUSED":
            conn_ctrl = self.sess_ctrl.get_connection()
            with conn_ctrl.cursor() as cur:
                cur.execute(f"SELECT RELEASE_LOCK('{self.lock_name}');")
                time.sleep(0.03)
                cur.execute(f"SELECT GET_LOCK('{self.lock_name}', 0);")

            self.status = "RUNNING"
            reached = self._wait_for_next_checkpoint(timeout=5.0)
            if not reached or self.status != "PAUSED":
                break

            # Si se detuvo en un breakpoint, pausar y devolver
            if self.current_line in self.breakpoints:
                break

        return self.get_state()

    def set_breakpoints(self, breakpoints: List[int]):
        """Actualiza la lista de puntos de interrupción en caliente."""
        with self.lock:
            self.breakpoints = set(breakpoints or [])

    def stop(self) -> Dict[str, Any]:
        """Detiene y limpia la sesión de depuración."""
        with self.lock:
            self.status = "STOPPED"

        if self.sess_ctrl:
            try:
                conn_ctrl = self.sess_ctrl.get_connection()
                with conn_ctrl.cursor() as cur:
                    # Liberar el bloqueo para desbloquear cualquier hilo esperando
                    cur.execute(f"SELECT RELEASE_LOCK('{self.lock_name}');")
                    # Eliminar procedimiento sombra
                    cur.execute(f"DROP PROCEDURE IF EXISTS `{self.database}`.`{self.shadow_proc_name}`;")
                    # Limpiar estado
                    cur.execute(f"DELETE FROM `{self.database}`.`__dbide_debug_state` WHERE `session_id` = '{self.session_id}';")
            except Exception:
                pass

        if self.sess_ctrl:
            self.sess_ctrl.close()
        if self.sess_exec:
            self.sess_exec.close()

        return self.get_state()

    def get_state(self) -> Dict[str, Any]:
        """Devuelve el estado completo actual de la depuración para la UI."""
        return {
            "session_id": self.session_id,
            "status": self.status,
            "procedure_name": self.procedure_name,
            "database": self.database,
            "current_line": self.current_line,
            "step_index": self.step_index,
            "variables": self.current_variables,
            "changed_variables": list(self.changed_variables),
            "breakpoints": list(self.breakpoints),
            "checkpoint_lines": self.checkpoint_lines,
            "call_stack": [self.procedure_name] if self.status != "FINISHED" else [],
            "out_params": self.out_params,
            "result_sets": self.output_result_sets,
            "error_message": self.error_message,
            "duration_ms": self.duration_ms
        }


class DebugManager:
    """Administrador centralizado de sesiones de depuración en la aplicación."""
    def __init__(self):
        self._sessions: Dict[str, DebugSession] = {}
        self._lock = threading.Lock()

    def create_session(self, db_config: Dict[str, Any], database: str, procedure_name: str) -> DebugSession:
        # Cerrar cualquier sesión previa para mantener un entorno limpio
        self.stop_all()
        session_id = uuid.uuid4().hex[:8]
        session = DebugSession(session_id, db_config, database, procedure_name)
        with self._lock:
            self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[DebugSession]:
        with self._lock:
            return self._sessions.get(session_id)

    def stop_all(self):
        with self._lock:
            for s in list(self._sessions.values()):
                try:
                    s.stop()
                except Exception:
                    pass
            self._sessions.clear()

debug_manager = DebugManager()
