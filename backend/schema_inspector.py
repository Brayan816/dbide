from typing import List, Dict, Any, Optional
import pymysql.cursors
from .db_manager import manager, serialize_value
from .procedure_debugger import cleanup_all_shadow_procedures

def get_databases() -> List[str]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()
    with conn.cursor() as cursor:
        cursor.execute("SHOW DATABASES")
        dbs = [row[0] for row in cursor.fetchall()]
        return dbs

def get_database_objects(database: str) -> Dict[str, Any]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()

    if not database:
        database = session.database
    if not database:
        with conn.cursor() as cur:
            cur.execute("SELECT DATABASE()")
            row = cur.fetchone()
            if row and row[0]:
                database = row[0]
                session.database = database
            else:
                raise ValueError("No se ha seleccionado ninguna base de datos")

    # Limpiar automáticamente cualquier procedimiento sombra huérfano de depuración previa
    try:
        cleanup_all_shadow_procedures(database)
    except Exception:
        pass

    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        # Tables
        cursor.execute("""
            SELECT 
                TABLE_NAME as name, 
                ENGINE as engine, 
                TABLE_ROWS as approx_rows, 
                DATA_LENGTH as data_length,
                TABLE_COMMENT as comment
            FROM information_schema.TABLES 
            WHERE LOWER(TABLE_SCHEMA) = LOWER(%s) 
              AND TABLE_TYPE = 'BASE TABLE'
              AND TABLE_NAME NOT LIKE '__dbide_%%'
            ORDER BY TABLE_NAME
        """, (database,))
        tables = cursor.fetchall()

        # Views
        cursor.execute("""
            SELECT 
                TABLE_NAME as name,
                TABLE_COMMENT as comment
            FROM information_schema.TABLES 
            WHERE LOWER(TABLE_SCHEMA) = LOWER(%s) 
              AND TABLE_TYPE = 'VIEW'
              AND TABLE_NAME NOT LIKE '__dbide_%%'
            ORDER BY TABLE_NAME
        """, (database,))
        views = cursor.fetchall()

        # Stored Procedures
        cursor.execute("""
            SELECT 
                ROUTINE_NAME as name,
                ROUTINE_COMMENT as comment,
                CREATED as created,
                LAST_ALTERED as modified,
                DEFINER as definer
            FROM information_schema.ROUTINES
            WHERE LOWER(ROUTINE_SCHEMA) = LOWER(%s) 
              AND ROUTINE_TYPE = 'PROCEDURE'
              AND ROUTINE_NAME NOT LIKE '__dbide_%%'
            ORDER BY ROUTINE_NAME
        """, (database,))
        procedures = cursor.fetchall()

        # Functions
        cursor.execute("""
            SELECT 
                ROUTINE_NAME as name,
                DTD_IDENTIFIER as return_type,
                ROUTINE_COMMENT as comment,
                CREATED as created,
                LAST_ALTERED as modified,
                DEFINER as definer
            FROM information_schema.ROUTINES
            WHERE LOWER(ROUTINE_SCHEMA) = LOWER(%s) 
              AND ROUTINE_TYPE = 'FUNCTION'
              AND ROUTINE_NAME NOT LIKE '__dbide_%%'
            ORDER BY ROUTINE_NAME
        """, (database,))
        functions = cursor.fetchall()

        # Triggers
        cursor.execute("""
            SELECT 
                TRIGGER_NAME as name,
                EVENT_MANIPULATION as event,
                EVENT_OBJECT_TABLE as table_name,
                ACTION_TIMING as timing,
                CREATED as created
            FROM information_schema.TRIGGERS
            WHERE LOWER(TRIGGER_SCHEMA) = LOWER(%s)
              AND TRIGGER_NAME NOT LIKE '__dbide_%%'
            ORDER BY TRIGGER_NAME
        """, (database,))
        triggers = cursor.fetchall()

        # All columns across tables for intelligent autocompletion
        cursor.execute("""
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
            FROM information_schema.COLUMNS
            WHERE LOWER(TABLE_SCHEMA) = LOWER(%s)
              AND TABLE_NAME NOT LIKE '__dbide_%%'
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        """, (database,))
        raw_cols = cursor.fetchall()
        columns_by_table = {}
        for r in raw_cols:
            t_name = r["TABLE_NAME"]
            if t_name not in columns_by_table:
                columns_by_table[t_name] = []
            columns_by_table[t_name].append({
                "name": r["COLUMN_NAME"],
                "data_type": r["DATA_TYPE"],
                "full_type": r["COLUMN_TYPE"]
            })

        # All foreign keys in database for relational JOIN suggestions
        cursor.execute("""
            SELECT 
                TABLE_NAME as table_name,
                COLUMN_NAME as column_name,
                REFERENCED_TABLE_NAME as ref_table,
                REFERENCED_COLUMN_NAME as ref_column,
                CONSTRAINT_NAME as constraint_name
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE LOWER(TABLE_SCHEMA) = LOWER(%s)
              AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY TABLE_NAME, COLUMN_NAME
        """, (database,))
        foreign_keys = cursor.fetchall()

    return {
        "database": database,
        "tables": [{k: serialize_value(v) for k, v in t.items()} for t in tables],
        "views": [{k: serialize_value(v) for k, v in v.items()} for v in views],
        "procedures": [{k: serialize_value(v) for k, v in p.items()} for p in procedures],
        "functions": [{k: serialize_value(v) for k, v in f.items()} for f in functions],
        "triggers": [{k: serialize_value(v) for k, v in tr.items()} for tr in triggers],
        "columns_by_table": columns_by_table,
        "foreign_keys": [{k: serialize_value(v) for k, v in fk.items()} for fk in foreign_keys]
    }

def get_table_structure(database: str, table_name: str) -> Dict[str, Any]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()

    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        # Columns
        cursor.execute("""
            SELECT 
                COLUMN_NAME as name,
                COLUMN_TYPE as full_type,
                DATA_TYPE as data_type,
                IS_NULLABLE as is_nullable,
                COLUMN_KEY as key_type,
                COLUMN_DEFAULT as default_value,
                EXTRA as extra,
                COLUMN_COMMENT as comment
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """, (database, table_name))
        columns = cursor.fetchall()

        # Foreign keys
        cursor.execute("""
            SELECT 
                CONSTRAINT_NAME as constraint_name,
                COLUMN_NAME as column_name,
                REFERENCED_TABLE_SCHEMA as ref_schema,
                REFERENCED_TABLE_NAME as ref_table,
                REFERENCED_COLUMN_NAME as ref_column
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND REFERENCED_TABLE_NAME IS NOT NULL
        """, (database, table_name))
        foreign_keys = cursor.fetchall()

    # Indexes
    with conn.cursor() as cursor:
        indexes = []
        try:
            cursor.execute(f"SHOW INDEX FROM `{database}`.`{table_name}`")
            for row in cursor.fetchall():
                indexes.append({
                    "table": row[0],
                    "non_unique": row[1],
                    "key_name": row[2],
                    "seq_in_index": row[3],
                    "column_name": row[4],
                    "collation": row[5],
                    "cardinality": row[6],
                    "index_type": row[10] if len(row) > 10 else "BTREE"
                })
        except Exception:
            pass

    # DDL
    ddl = get_object_ddl(database, "TABLE", table_name)

    return {
        "database": database,
        "table": table_name,
        "columns": [{k: serialize_value(v) for k, v in c.items()} for c in columns],
        "foreign_keys": [{k: serialize_value(v) for k, v in fk.items()} for fk in foreign_keys],
        "indexes": indexes,
        "ddl": ddl
    }

def get_table_data(database: str, table_name: str, page: int = 1, page_size: int = 50,
                   sort_by: Optional[str] = None, sort_dir: str = "ASC",
                   search_filter: Optional[str] = None) -> Dict[str, Any]:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()

    offset = (page - 1) * page_size
    valid_sort_dir = "DESC" if sort_dir.upper() == "DESC" else "ASC"

    with conn.cursor() as cursor:
        # Total rows count
        count_query = f"SELECT COUNT(*) FROM `{database}`.`{table_name}`"
        where_clause = ""
        params = []

        if search_filter and search_filter.strip():
            # Get text columns to search
            cursor.execute("""
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            """, (database, table_name))
            all_cols = [r[0] for r in cursor.fetchall()]
            if all_cols:
                conditions = [f"`{col}` LIKE %s" for col in all_cols]
                where_clause = " WHERE " + " OR ".join(conditions)
                params = [f"%{search_filter.strip()}%" for _ in all_cols]
                count_query += where_clause

        cursor.execute(count_query, params)
        total_rows = cursor.fetchone()[0]

        # Query data
        order_clause = ""
        if sort_by:
            # Clean column name
            clean_sort_by = sort_by.replace("`", "")
            order_clause = f" ORDER BY `{clean_sort_by}` {valid_sort_dir}"

        query = f"SELECT * FROM `{database}`.`{table_name}`{where_clause}{order_clause} LIMIT %s OFFSET %s"
        query_params = list(params) + [page_size, offset]
        cursor.execute(query, query_params)

        columns = [d[0] for d in cursor.description] if cursor.description else []
        rows = cursor.fetchall()

        formatted_rows = []
        for row in rows:
            formatted_rows.append([serialize_value(val) for val in row])

    return {
        "database": database,
        "table": table_name,
        "columns": columns,
        "rows": formatted_rows,
        "page": page,
        "page_size": page_size,
        "total_rows": total_rows,
        "total_pages": (total_rows + page_size - 1) // page_size if page_size else 1
    }

def get_object_ddl(database: str, object_type: str, object_name: str) -> str:
    session = manager.get_active()
    if not session:
        raise ValueError("No hay una conexión activa")
    conn = session.get_connection()

    obj_type = object_type.upper()
    with conn.cursor() as cursor:
        try:
            if obj_type == "TABLE":
                cursor.execute(f"SHOW CREATE TABLE `{database}`.`{object_name}`")
                row = cursor.fetchone()
                return row[1] if row else ""
            elif obj_type == "VIEW":
                cursor.execute(f"SHOW CREATE VIEW `{database}`.`{object_name}`")
                row = cursor.fetchone()
                return row[1] if row else ""
            elif obj_type == "PROCEDURE":
                cursor.execute(f"SHOW CREATE PROCEDURE `{database}`.`{object_name}`")
                row = cursor.fetchone()
                # row[2] is create procedure
                return row[2] if row and len(row) > 2 else ""
            elif obj_type == "FUNCTION":
                cursor.execute(f"SHOW CREATE FUNCTION `{database}`.`{object_name}`")
                row = cursor.fetchone()
                return row[2] if row and len(row) > 2 else ""
            elif obj_type == "TRIGGER":
                cursor.execute(f"SHOW CREATE TRIGGER `{database}`.`{object_name}`")
                row = cursor.fetchone()
                return row[2] if row and len(row) > 2 else ""
            else:
                return f"-- Tipo de objeto no soportado: {object_type}"
        except Exception as e:
            return f"-- Error al obtener DDL: {str(e)}"
