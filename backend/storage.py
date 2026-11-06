import sqlite3
import os
import re
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.path.expanduser("~"), ".mysqldebugger")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "ide_storage.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def detect_query_type(sql: str) -> str:
    cleaned = re.sub(r'--.*?(\r?\n|$)', ' ', sql)
    cleaned = re.sub(r'/\*.*?\*/', ' ', cleaned, flags=re.DOTALL)
    match = re.search(r'^\s*([a-zA-Z]+)', cleaned)
    if match:
        val = match.group(1).upper()
        if val in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'CALL', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE'):
            return val
    return 'OTHER'

def init_storage():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 3306,
                user TEXT NOT NULL,
                password TEXT NOT NULL DEFAULT '',
                database TEXT DEFAULT '',
                ssl INTEGER DEFAULT 0,
                environment TEXT DEFAULT 'development',
                created_at TEXT NOT NULL,
                last_used_at TEXT
            )
        """)
        try:
            cursor.execute("ALTER TABLE connections ADD COLUMN environment TEXT DEFAULT 'development'")
        except Exception:
            pass
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                connection_id TEXT,
                connection_name TEXT,
                database_name TEXT,
                query_type TEXT,
                query_text TEXT NOT NULL,
                executed_at TEXT NOT NULL,
                duration_ms REAL,
                status TEXT NOT NULL,
                rows_affected INTEGER DEFAULT 0,
                error_message TEXT
            )
        """)
        try:
            cursor.execute("ALTER TABLE query_history ADD COLUMN query_type TEXT")
        except Exception:
            pass
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS saved_queries (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                query_text TEXT NOT NULL,
                database_name TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()

        # Backfill any null query_type in history
        try:
            cursor.execute("SELECT id, query_text FROM query_history WHERE query_type IS NULL OR query_type = ''")
            to_update = cursor.fetchall()
            for r in to_update:
                q_id = r[0]
                detected = detect_query_type(r[1] or "")
                cursor.execute("UPDATE query_history SET query_type = ? WHERE id = ?", (detected, q_id))
            if to_update:
                conn.commit()
        except Exception:
            pass

# Initialize storage on load
init_storage()

# --- Connection CRUD ---
def get_connections() -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM connections ORDER BY COALESCE(last_used_at, created_at) DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_last_used_connection() -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM connections ORDER BY COALESCE(last_used_at, created_at) DESC LIMIT 1")
        row = cursor.fetchone()
        return dict(row) if row else None

def get_connection(conn_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM connections WHERE id = ?", (conn_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def save_connection(conn_data: Dict[str, Any]) -> Dict[str, Any]:
    conn_id = conn_data.get("id") or str(uuid.uuid4())
    now = datetime.now().isoformat()
    env = conn_data.get("environment") or "development"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO connections (id, name, host, port, user, password, database, ssl, environment, created_at, last_used_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                host=excluded.host,
                port=excluded.port,
                user=excluded.user,
                password=excluded.password,
                database=excluded.database,
                ssl=excluded.ssl,
                environment=excluded.environment,
                last_used_at=excluded.last_used_at
        """, (
            conn_id,
            conn_data["name"],
            conn_data["host"],
            int(conn_data.get("port", 3306)),
            conn_data["user"],
            conn_data.get("password", ""),
            conn_data.get("database", ""),
            1 if conn_data.get("ssl") else 0,
            env,
            conn_data.get("created_at") or now,
            now
        ))
        conn.commit()
    return get_connection(conn_id)

def touch_connection(conn_id: str):
    now = datetime.now().isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE connections SET last_used_at = ? WHERE id = ?", (now, conn_id))
        conn.commit()

def update_connection_database(conn_id: str, db_name: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE connections SET database = ? WHERE id = ?", (db_name, conn_id))
        conn.commit()

def delete_connection(conn_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM connections WHERE id = ?", (conn_id,))
        conn.commit()
        return cursor.rowcount > 0

# --- Query History ---
def add_history(data: Dict[str, Any]) -> Dict[str, Any]:
    hist_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    q_type = data.get("query_type") or detect_query_type(data.get("query_text", ""))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO query_history (
                id, connection_id, connection_name, database_name, query_type,
                query_text, executed_at, duration_ms, status, rows_affected, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            hist_id,
            data.get("connection_id", ""),
            data.get("connection_name", ""),
            data.get("database_name", ""),
            q_type,
            data["query_text"],
            now,
            data.get("duration_ms", 0.0),
            data.get("status", "SUCCESS"),
            data.get("rows_affected", 0),
            data.get("error_message")
        ))
        conn.commit()
    return {"id": hist_id, "query_type": q_type, "executed_at": now, **data}

def get_history(
    limit: int = 200,
    query_type: Optional[str] = None,
    database_name: Optional[str] = None,
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        conditions = []
        params = []

        if query_type and query_type.strip() and query_type.upper() != 'ALL':
            conditions.append("UPPER(COALESCE(query_type, '')) = ?")
            params.append(query_type.strip().upper())

        if database_name and database_name.strip() and database_name.upper() != 'ALL':
            conditions.append("LOWER(COALESCE(database_name, '')) = LOWER(?)")
            params.append(database_name.strip())

        if search and search.strip():
            conditions.append("query_text LIKE ?")
            params.append(f"%{search.strip()}%")

        where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        query = f"SELECT * FROM query_history{where_sql} ORDER BY executed_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if not d.get("query_type"):
                d["query_type"] = detect_query_type(d.get("query_text", ""))
            result.append(d)
        return result

def clear_history():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM query_history")
        conn.commit()

# --- Saved Queries ---
def get_saved_queries() -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM saved_queries ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

def save_query(title: str, query_text: str, database_name: str = "", qid: Optional[str] = None) -> Dict[str, Any]:
    qid = qid or str(uuid.uuid4())
    now = datetime.now().isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO saved_queries (id, title, query_text, database_name, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                query_text = excluded.query_text,
                database_name = excluded.database_name
        """, (qid, title, query_text, database_name, now))
        conn.commit()
    return {"id": qid, "title": title, "query_text": query_text, "database_name": database_name, "created_at": now}

def delete_saved_query(qid: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM saved_queries WHERE id = ?", (qid,))
        conn.commit()
        return cursor.rowcount > 0
