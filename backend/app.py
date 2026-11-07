import os
import io
import csv
import json
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .storage import (
    init_storage, get_connections, get_connection, save_connection,
    delete_connection, touch_connection, get_history, clear_history,
    get_saved_queries, save_query, delete_saved_query,
    get_last_used_connection, update_connection_database
)
from .db_manager import manager
from .schema_inspector import (
    get_databases, get_database_objects, get_table_structure,
    get_table_data, get_object_ddl
)
from .procedure_runner import get_procedure_params, execute_procedure
from .query_runner import execute_query, explain_query

# --- Pydantic Models ---
class ConnectionModel(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., example="MySQL Local")
    host: str = Field(default="127.0.0.1", example="127.0.0.1")
    port: int = Field(default=3306, example=3306)
    user: str = Field(default="root", example="root")
    password: Optional[str] = Field(default="", example="")
    database: Optional[str] = Field(default="", example="")
    ssl: Optional[bool] = Field(default=False)
    environment: Optional[str] = Field(default="development", example="development")

class ConnectRequest(BaseModel):
    connection_id: Optional[str] = None
    config: Optional[ConnectionModel] = None

class SwitchDbRequest(BaseModel):
    database: str

class QueryRequest(BaseModel):
    sql: str
    database: Optional[str] = None
    limit: Optional[int] = 100

class ProcedureExecRequest(BaseModel):
    parameters: Dict[str, Any] = Field(default_factory=dict)

class SaveQueryRequest(BaseModel):
    id: Optional[str] = None
    title: str
    query_text: str
    database_name: Optional[str] = ""

class ExportRequest(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    filename: Optional[str] = "export"

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_storage()
    # Auto-connect by default to last used connection on startup
    last_conn = get_last_used_connection()
    if last_conn:
        try:
            manager.set_active(last_conn)
            touch_connection(last_conn["id"])
            print(f"[*] Conectado automaticamente a la ultima conexion: {last_conn.get('name')} ({last_conn.get('user')}@{last_conn.get('host')})")
        except Exception as e:
            print(f"[!] No se pudo auto-conectar a {last_conn.get('name')}: {e}")
    yield
    manager.disconnect()

app = FastAPI(title="MySQL IDE & Debugger", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Connections API ---
@app.get("/api/connections")
def list_connections():
    return get_connections()

@app.post("/api/connections")
def upsert_connection(conn: ConnectionModel):
    saved = save_connection(conn.model_dump())
    return saved

@app.delete("/api/connections/{conn_id}")
def remove_connection(conn_id: str):
    success = delete_connection(conn_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    return {"success": True}

@app.post("/api/connections/test")
def test_connection_endpoint(conn: ConnectionModel):
    result = manager.test_connection(conn.model_dump())
    return result

# --- Session API ---
@app.get("/api/session/current")
def get_current_session():
    session = manager.get_active()
    if not session:
        return {"connected": False}
    return {
        "connected": True,
        "name": session.name,
        "host": session.host,
        "port": session.port,
        "user": session.user,
        "database": session.database,
        "environment": getattr(session, "environment", "development"),
        "conn_id": session.conn_id
    }

@app.post("/api/session/auto-connect")
def auto_connect_session():
    session = manager.get_active()
    if session:
        return {
            "connected": True,
            "name": session.name,
            "host": session.host,
            "port": session.port,
            "user": session.user,
            "database": session.database,
            "environment": getattr(session, "environment", "development"),
            "conn_id": session.conn_id
        }

    last_conn = get_last_used_connection()
    if not last_conn:
        return {"connected": False, "message": "No hay conexiones previas registradas"}

    try:
        info = manager.set_active(last_conn)
        touch_connection(last_conn["id"])
        return {"connected": True, "conn_id": last_conn["id"], **info}
    except Exception as e:
        return {"connected": False, "error": str(e), "message": f"No se pudo auto-conectar a {last_conn.get('name')}: {str(e)}"}

@app.post("/api/session/connect")
def connect_session(req: ConnectRequest):
    if req.connection_id:
        cfg = get_connection(req.connection_id)
        if not cfg:
            raise HTTPException(status_code=404, detail="Conexión guardada no encontrada")
        touch_connection(req.connection_id)
    elif req.config:
        cfg = req.config.model_dump()
    else:
        raise HTTPException(status_code=400, detail="Debe especificar una conexión o ID")

    try:
        info = manager.set_active(cfg)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/session/disconnect")
def disconnect_session():
    manager.disconnect()
    return {"success": True, "message": "Desconectado"}

@app.post("/api/session/switch-db")
def switch_database(req: SwitchDbRequest):
    session = manager.get_active()
    if not session:
        raise HTTPException(status_code=400, detail="No hay una conexión activa")
    try:
        session.switch_database(req.database)
        if session.conn_id and session.conn_id != "default":
            update_connection_database(session.conn_id, req.database)
        return {"success": True, "database": req.database}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Schema API ---
@app.get("/api/schema/databases")
def list_databases():
    try:
        return {"databases": get_databases()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/schema/databases/{database}/objects")
def list_database_objects(database: str):
    try:
        return get_database_objects(database)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/schema/databases/{database}/tables/{table}/structure")
def table_structure(database: str, table: str):
    try:
        return get_table_structure(database, table)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/schema/databases/{database}/tables/{table}/data")
def table_data(
    database: str, table: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: Optional[str] = None,
    sort_dir: str = "ASC",
    search: Optional[str] = None
):
    try:
        return get_table_data(database, table, page, page_size, sort_by, sort_dir, search)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/schema/databases/{database}/objects/{obj_type}/{obj_name}/ddl")
def object_ddl(database: str, obj_type: str, obj_name: str):
    try:
        ddl = get_object_ddl(database, obj_type, obj_name)
        return {"database": database, "type": obj_type, "name": obj_name, "ddl": ddl}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Procedures API ---
@app.get("/api/procedures/{database}/{proc_name}/params")
def inspect_proc_params(database: str, proc_name: str):
    try:
        params = get_procedure_params(database, proc_name)
        return {"database": database, "procedure": proc_name, "parameters": params}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/procedures/{database}/{proc_name}/execute")
def run_procedure(database: str, proc_name: str, req: ProcedureExecRequest):
    try:
        result = execute_procedure(database, proc_name, req.parameters)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Query API ---
@app.post("/api/query/execute")
def run_query(req: QueryRequest):
    result = execute_query(req.sql, req.database, limit=req.limit)
    return result

@app.post("/api/query/explain")
def run_explain(req: QueryRequest):
    try:
        return explain_query(req.sql, req.database)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/query/history")
def query_history(
    limit: int = 200,
    query_type: Optional[str] = None,
    database: Optional[str] = None,
    search: Optional[str] = None
):
    return get_history(limit=limit, query_type=query_type, database_name=database, search=search)

@app.delete("/api/query/history")
def clear_query_history():
    clear_history()
    return {"success": True}

@app.get("/api/query/saved")
def list_saved_queries():
    return get_saved_queries()

@app.post("/api/query/saved")
def add_saved_query(req: SaveQueryRequest):
    return save_query(req.title, req.query_text, req.database_name or "", req.id)

@app.delete("/api/query/saved/{qid}")
def remove_saved_query(qid: str):
    success = delete_saved_query(qid)
    return {"success": success}

# --- Export API ---
@app.post("/api/export/csv")
def export_csv(req: ExportRequest):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(req.columns)
    for row in req.rows:
        writer.writerow(row)
    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    filename = f"{req.filename or 'export'}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.post("/api/export/json")
def export_json(req: ExportRequest):
    data = []
    for row in req.rows:
        row_dict = {}
        for i, col in enumerate(req.columns):
            row_dict[col] = row[i] if i < len(row) else None
        data.append(row_dict)
    json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"{req.filename or 'export'}.json"
    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# --- Frontend Static Files ---
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path in ("/", "/favicon.ico", "/icon.png") or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.get("/")
def serve_index():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"message": "MySQL Debugger API is running. Frontend directory not found."}

@app.get("/favicon.ico")
def serve_favicon():
    favicon_path = os.path.join(frontend_dir, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/x-icon")
    return Response(status_code=404)

@app.get("/icon.png")
def serve_icon_png():
    icon_path = os.path.join(frontend_dir, "icon.png")
    if os.path.exists(icon_path):
        return FileResponse(icon_path, media_type="image/png")
    return Response(status_code=404)
