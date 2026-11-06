from typing import List, Dict, Any
import time
import pymysql.cursors
from .db_manager import manager, serialize_value

def get_procedure_params(database: str, procedure_name: str) -> List[Dict[str, Any]]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()

    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("""
            SELECT 
                ORDINAL_POSITION as position,
                PARAMETER_MODE as mode,
                PARAMETER_NAME as name,
                DATA_TYPE as data_type,
                DTD_IDENTIFIER as full_type
            FROM information_schema.PARAMETERS
            WHERE SPECIFIC_SCHEMA = %s AND SPECIFIC_NAME = %s AND ROUTINE_TYPE = 'PROCEDURE'
            ORDER BY ORDINAL_POSITION
        """, (database, procedure_name))
        params = cursor.fetchall()

    return [{k: serialize_value(v) for k, v in p.items()} for p in params]

def execute_procedure(database: str, procedure_name: str, param_values: Dict[str, Any]) -> Dict[str, Any]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()

    # Get param metadata
    params_meta = get_procedure_params(database, procedure_name)
    
    start_time = time.perf_counter()
    result_sets = []
    out_params_result = {}
    total_affected_rows = 0

    with conn.cursor() as cursor:
        cursor.execute(f"USE `{database}`")

        # Build execution script
        setup_stmts = []
        call_args = []
        select_out_vars = []

        for p in params_meta:
            p_name = p.get("name") or f"arg_{p['position']}"
            mode = (p.get("mode") or "IN").upper()
            val = param_values.get(p_name)

            if mode == "IN":
                # Escape value
                if val is None or val == "":
                    call_args.append("NULL")
                elif isinstance(val, (int, float)):
                    call_args.append(str(val))
                else:
                    escaped_val = conn.escape(str(val))
                    call_args.append(escaped_val)
            elif mode in ("OUT", "INOUT"):
                var_name = f"@_dbg_{p_name}"
                if mode == "INOUT" and val is not None and val != "":
                    escaped_val = conn.escape(str(val)) if not isinstance(val, (int, float)) else str(val)
                    setup_stmts.append(f"SET {var_name} = {escaped_val}")
                else:
                    setup_stmts.append(f"SET {var_name} = NULL")
                call_args.append(var_name)
                select_out_vars.append(f"{var_name} AS `{p_name}`")

        # Execute setup statements if any
        for stmt in setup_stmts:
            cursor.execute(stmt)

        # Execute CALL
        call_query = f"CALL `{database}`.`{procedure_name}`({', '.join(call_args)})"
        cursor.execute(call_query)

        # Collect all result sets returned by the procedure
        has_more = True
        set_index = 1
        while has_more:
            if cursor.description:
                cols = [d[0] for d in cursor.description]
                rows = cursor.fetchall()
                serialized_rows = [[serialize_value(c) for c in r] for r in rows]
                result_sets.append({
                    "name": f"Resultado {set_index}",
                    "columns": cols,
                    "rows": serialized_rows,
                    "row_count": len(rows)
                })
                set_index += 1
            else:
                total_affected_rows += cursor.rowcount if cursor.rowcount > 0 else 0

            try:
                has_more = cursor.nextset()
            except Exception:
                has_more = False

        # If there are OUT parameters, fetch them
        if select_out_vars:
            out_query = f"SELECT {', '.join(select_out_vars)}"
            cursor.execute(out_query)
            if cursor.description:
                cols = [d[0] for d in cursor.description]
                row = cursor.fetchone()
                if row:
                    for i, col in enumerate(cols):
                        out_params_result[col] = serialize_value(row[i])

    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "success": True,
        "database": database,
        "procedure": procedure_name,
        "duration_ms": duration_ms,
        "result_sets": result_sets,
        "out_parameters": out_params_result,
        "affected_rows": total_affected_rows,
        "message": f"Procedimiento `{procedure_name}` ejecutado en {duration_ms} ms."
    }
