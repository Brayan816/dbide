import time
from datetime import datetime, date, time as dt_time, timedelta
from decimal import Decimal
import pymysql
import pymysql.constants.CLIENT
from typing import Optional, Dict, Any

def serialize_value(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (datetime, date, dt_time)):
        return val.isoformat()
    if isinstance(val, timedelta):
        return str(val)
    if isinstance(val, Decimal):
        # Return as float if it fits without loss, or string
        return float(val) if val % 1 else int(val)
    if isinstance(val, (bytes, bytearray)):
        try:
            return val.decode("utf-8")
        except UnicodeDecodeError:
            return f"<BLOB: {len(val)} bytes hex:{val[:16].hex()}...>"
    if isinstance(val, set):
        return list(val)
    return val

class DatabaseSession:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.host = config.get("host", "localhost")
        self.port = int(config.get("port", 3306))
        self.user = config.get("user", "root")
        self.password = config.get("password", "")
        self.database = config.get("database") or None
        self.ssl = bool(config.get("ssl", False))
        self.conn_id = config.get("id", "default")
        self.name = (config.get("name") or "").strip() or f"{self.user}@{self.host}"
        self.environment = (config.get("environment") or "development").strip() or "development"
        self._connection: Optional[pymysql.Connection] = None

    def get_connection(self) -> pymysql.Connection:
        if self._connection is not None:
            try:
                self._connection.ping(reconnect=True)
                return self._connection
            except Exception:
                self._connection = None

        ssl_ctx = {"check_hostname": False} if self.ssl else None

        self._connection = pymysql.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            database=self.database,
            charset="utf8mb4",
            autocommit=True,
            connect_timeout=10,
            read_timeout=30,
            write_timeout=30,
            ssl=ssl_ctx,
            client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS | pymysql.constants.CLIENT.MULTI_RESULTS
        )
        return self._connection

    def close(self):
        if self._connection:
            try:
                self._connection.close()
            except Exception:
                pass
            self._connection = None

    def switch_database(self, db_name: str):
        conn = self.get_connection()
        conn.select_db(db_name)
        self.database = db_name

class ConnectionManager:
    def __init__(self):
        self.active_session: Optional[DatabaseSession] = None

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        start = time.perf_counter()
        ssl_ctx = {"check_hostname": False} if config.get("ssl") else None
        try:
            conn = pymysql.connect(
                host=config.get("host", "localhost"),
                port=int(config.get("port", 3306)),
                user=config.get("user", "root"),
                password=config.get("password", ""),
                database=config.get("database") or None,
                charset="utf8mb4",
                connect_timeout=5,
                ssl=ssl_ctx
            )
            with conn.cursor() as cursor:
                cursor.execute("SELECT VERSION(), CURRENT_USER(), DATABASE()")
                version, current_user, current_db = cursor.fetchone()
            conn.close()
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": True,
                "version": version,
                "user": current_user,
                "database": current_db,
                "latency_ms": duration_ms,
                "message": f"Conexión exitosa a MySQL {version} ({duration_ms} ms)"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Error de conexión: {str(e)}"
            }

    def set_active(self, config: Dict[str, Any]) -> Dict[str, Any]:
        if self.active_session:
            self.active_session.close()

        session = DatabaseSession(config)
        # Test connection right now
        try:
            conn = session.get_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT VERSION(), DATABASE()")
                version, current_db = cursor.fetchone()
            self.active_session = session
            return {
                "success": True,
                "name": session.name,
                "host": session.host,
                "port": session.port,
                "user": session.user,
                "database": current_db or session.database,
                "environment": session.environment,
                "version": version
            }
        except Exception as e:
            session.close()
            raise RuntimeError(f"No se pudo conectar a la base de datos: {e}")

    def get_active(self) -> Optional[DatabaseSession]:
        return self.active_session

    def disconnect(self):
        if self.active_session:
            self.active_session.close()
            self.active_session = None

manager = ConnectionManager()
