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
   - Tabla interactiva con ordenamiento de columnas al hacer clic.
   - Indicador de valores `NULL` y recuento de filas afectadas/devueltas.
   - Medición precisa de tiempo de respuesta (en milisegundos).
   - Exportación de resultados a **CSV** (con codificación UTF-8 compatible con Excel) y **JSON**.

5. **Historial de Consultas:**
   - Registro persistente de consultas ejecutadas con fecha, duración, estado y botón para recargar la consulta en el editor con un solo clic.

---

## 🚀 Cómo Iniciar la Aplicación

### Método 1: Doble Clic en Windows
Simplemente haz doble clic en el archivo:
- `run.bat`

### Método 2: Desde Terminal (PowerShell o CMD)
```powershell
.\run.ps1
```
o
```bash
python main.py
```

La aplicación iniciará el servidor en `http://127.0.0.1:8000` y abrirá automáticamente tu navegador predeterminado.

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
