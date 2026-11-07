# DBIDE - MySQL IDE & Debugger 🚀

Un IDE moderno, ligero y rápido para administrar y consultar bases de datos MySQL, diseñado con la fluidez y estética de herramientas profesionales como DataGrip y Beekeeper Studio.

---

## ✨ Características Principales

1. **Gestor de Conexiones Múltiples:**
   - Guarda configuraciones de conexión para localhost, Docker o servidores remotos.
   - Prueba de conexión instantánea con medición de latencia y versión del motor MySQL.
   - Soporte para MySQL 5.7, 8.0, 8.4+, MariaDB y conexiones seguras SSL.

2. **Explorador Completo de Esquemas:**
   - **Tablas:** Visualización de registros aproximados, visor de datos en vivo con paginación, visor de columnas/estructura y generador de `SELECT`/`INSERT`.
   - **Vistas:** Consulta de datos y visor del DDL de la vista.
   - **Procedimientos Almacenados (Stored Procedures):**
     - DDL completo (`SHOW CREATE PROCEDURE`).
     - **Asistente de Ejecución:** Formulario interactivo que detecta parámetros `IN`, `OUT` e `INOUT`, permitiendo ingresar valores y visualizando tanto los conjuntos de resultados devueltos como los valores de salida (`@OUT_PARAM`).
   - **Funciones Almacenadas:** Visor de DDL y generador de llamada `SELECT funcion()`.
   - **Triggers:** Lista de disparadores con evento (`INSERT`, `UPDATE`, `DELETE`), momento (`BEFORE`, `AFTER`) y DDL.
   - **Filtro de búsqueda en tiempo real** en el árbol lateral.

3. **Editor SQL Multi-Pestaña:**
   - Impulsado por **Monaco Editor** (el núcleo de Visual Studio Code).
   - Autocompletado inteligente con palabras clave de SQL, funciones integradas de MySQL y objetos de la base de datos conectada (tablas y columnas).
   - Atajos de teclado: `Ctrl + Enter` (ejecutar selección o consulta activa), `F5` (ejecutar todo), `Ctrl + Space` (sugerencias).
   - Plan de ejecución visual con **EXPLAIN**.
   - Formateador SQL integrado.

4. **Visor de Datos y Resultados:**
   - Tabla interactiva con ordenamiento de columnas al hacer clic y **Virtual Scrolling** de alto rendimiento (60 FPS con miles de filas).
   - Selector dinámico de límite de filas (`50`, `100`, `250`, `500`, `1000`, `5000`, `Sin límite`).
   - Pestañas dinámicas y numeradas para ejecuciones múltiples (`Resultado 1`, `Resultado 2`, etc.).
   - Control unificado de exportación **Split Button** con soporte para:
     - 📊 **Excel (.xlsx):** Libro de cálculo nativo con encabezados formateados y congelados.
     - 📄 **CSV (.csv):** Valores delimitados por comas con codificación UTF-8 BOM compatible con Microsoft Excel.
     - 💻 **JSON (.json):** Array estructurado de objetos JSON.
     - 📥 **SQL (INSERT):** Archivo `.sql` con sentencias `INSERT INTO tabla (...) VALUES (...)` agrupadas por lotes.
     - 📝 **SQL (UPDATE):** Archivo `.sql` con sentencias `UPDATE tabla SET ... WHERE clave = ...` detectando automáticamente la columna clave primaria.

5. **Historial de Consultas:**
   - Registro persistente de consultas ejecutadas con fecha, duración, estado y botón para recargar la consulta en el editor con un solo clic.

---

## 🚀 Cómo Iniciar la Aplicación

### 🍎 En macOS (Apple Silicon M1/M2/M3/M4 e Intel)

> [!NOTE]
> La aplicación está totalmente optimizada para la arquitectura ARM64 de Apple Silicon. Detecta automáticamente navegadores Chromium (Chrome, Brave, Edge, Arc) para ejecutarse como una ventana de escritorio nativa independiente sin barra de direcciones, y gestiona automáticamente un entorno virtual aislado (`.venv`).

#### Opción 1: Con Doble Clic en el Finder
Haz doble clic sobre el archivo ejecutable:
- **`Iniciar_Mac.command`**

*(La primera vez, si macOS lo solicita, autoriza la ejecución en Terminal).*

#### Opción 2: Desde la Terminal
```bash
./run.sh
```
o manualmente:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py
```

---

### 🪟 En Windows

#### Opción 1: Con Doble Clic
- **`MySQL_IDE.lnk`** (Acceso directo con el icono oficial de la aplicación)
- **`run.bat`** o **`Iniciar_MySQL_IDE.vbs`** (sin ventana negra de consola)

#### Opción 2: Desde PowerShell o CMD
```powershell
.\run.ps1
```
o:
```bash
python main.py
```

---

### 🐧 En Linux
```bash
chmod +x run.sh
./run.sh
```

La aplicación iniciará el servidor local en `http://127.0.0.1:8000` y abrirá automáticamente la ventana de escritorio nativa (o tu navegador predeterminado).

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
|---|---|
| `Ctrl + Enter` / `Cmd + Enter` | Ejecutar consulta seleccionada o activa |
| `F5` | Ejecutar todo el editor |
| `Ctrl + Space` | Abrir autocompletado inteligente |
| `Ctrl + T` | Abrir nueva pestaña de consulta |
| `Ctrl + F` | Buscar en el editor |
| `Ctrl + H` | Reemplazar texto en el editor |
| `Shift + Alt + F` | Formatear consulta SQL |
| `Alt + R` | Recargar explorador de tablas y esquemas |
