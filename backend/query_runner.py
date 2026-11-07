import time
import re
from typing import Dict, Any, List, Optional
import pymysql
from .db_manager import manager, serialize_value
from .storage import add_history

def execute_query(sql: str, database: Optional[str] = None, limit: Optional[int] = 100) -> Dict[str, Any]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa a MySQL")

    conn = session.get_connection()
    target_db = database or session.database

    start_time = time.perf_counter()
    results = []
    total_affected = 0
    status = "SUCCESS"
    error_msg = None
    active_db = target_db

    try:
        with conn.cursor() as cursor:
            if target_db:
                cursor.execute(f"USE `{target_db}`")

            # Execute the SQL (may contain multiple statements)
            cursor.execute(sql)

            has_more = True
            stmt_idx = 1
            while has_more:
                if cursor.description:
                    cols = [d[0] for d in cursor.description]
                    rows = cursor.fetchall()
                    total_count = len(rows)
                    is_limited = False
                    if limit and limit > 0 and total_count > limit:
                        rows = rows[:limit]
                        is_limited = True
                    serialized_rows = [[serialize_value(c) for c in r] for r in rows]
                    msg = (
                        f"{len(serialized_rows)} de {total_count} filas (limitado a {limit})"
                        if is_limited
                        else f"{len(serialized_rows)} fila{'s' if len(serialized_rows) != 1 else ''} devuelta{'s' if len(serialized_rows) != 1 else ''}"
                    )
                    results.append({
                        "statement_index": stmt_idx,
                        "type": "SELECT",
                        "columns": cols,
                        "rows": serialized_rows,
                        "row_count": len(serialized_rows),
                        "total_count": total_count,
                        "is_limited": is_limited,
                        "limit": limit,
                        "message": msg
                    })
                else:
                    affected = cursor.rowcount if cursor.rowcount >= 0 else 0
                    total_affected += affected
                    is_unfiltered_mod = bool(
                        re.search(r'^\s*(UPDATE|DELETE)\b', sql, re.IGNORECASE) and
                        not re.search(r'\bWHERE\b', sql, re.IGNORECASE)
                    )
                    warn_note = " (⚠️ sin cláusula WHERE)" if is_unfiltered_mod else ""
                    results.append({
                        "statement_index": stmt_idx,
                        "type": "MUTATION",
                        "columns": [],
                        "rows": [],
                        "row_count": affected,
                        "message": f"Comando ejecutado{warn_note}. {affected} fila{'s' if affected != 1 else ''} afectada{'s' if affected != 1 else ''}"
                    })
                stmt_idx += 1

                try:
                    has_more = cursor.nextset()
                except Exception:
                    has_more = False

            # Check if active database changed (e.g. USE db;)
            try:
                cursor.execute("SELECT DATABASE()")
                db_row = cursor.fetchone()
                if db_row and db_row[0]:
                    active_db = db_row[0]
                    session.database = active_db
            except Exception:
                pass

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    except Exception as e:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        status = "ERROR"
        error_msg = str(e)
        # Record failed history
        add_history({
            "connection_id": session.conn_id,
            "connection_name": session.name,
            "database_name": target_db or "",
            "query_text": sql,
            "duration_ms": duration_ms,
            "status": status,
            "rows_affected": 0,
            "error_message": error_msg
        })
        return {
            "success": False,
            "error": error_msg,
            "duration_ms": duration_ms,
            "database": target_db,
            "results": []
        }

    # Record successful history
    add_history({
        "connection_id": session.conn_id,
        "connection_name": session.name,
        "database_name": target_db or "",
        "query_text": sql,
        "duration_ms": duration_ms,
        "status": status,
        "rows_affected": total_affected or (results[0]["row_count"] if results else 0),
        "error_message": None
    })

    schema_changed = bool(re.search(r'\b(create|alter|drop|truncate|rename|use)\b', sql, re.IGNORECASE))

    return {
        "success": True,
        "duration_ms": duration_ms,
        "database": active_db or target_db,
        "schema_changed": schema_changed,
        "results": results
    }

def explain_query(sql: str, database: Optional[str] = None) -> Dict[str, Any]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()
    target_db = database or session.database

    start_time = time.perf_counter()
    with conn.cursor() as cursor:
        if target_db:
            cursor.execute(f"USE `{target_db}`")
        cursor.execute(f"EXPLAIN {sql}")
        cols = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        serialized_rows = [[serialize_value(c) for c in r] for r in rows]
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "success": True,
        "duration_ms": duration_ms,
        "columns": cols,
        "rows": serialized_rows
    }
