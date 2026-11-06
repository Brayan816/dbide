@echo off
title MySQL IDE ^& Debugger
echo ===================================================
echo             MySQL IDE ^& Debugger
echo ===================================================
echo Iniciando el entorno y el servidor local...

set "PYTHON_CMD="

if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
) else if exist "C:\Users\Brayan\AppData\Local\Programs\Python\Python313\python.exe" (
    set "PYTHON_CMD=C:\Users\Brayan\AppData\Local\Programs\Python\Python313\python.exe"
)

if not defined PYTHON_CMD (
    for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
        if exist "%%D\python.exe" set "PYTHON_CMD=%%D\python.exe"
    )
)

if not defined PYTHON_CMD (
    for /d %%D in ("C:\Program Files\Python*") do (
        if exist "%%D\python.exe" set "PYTHON_CMD=%%D\python.exe"
    )
)

if not defined PYTHON_CMD (
    set "PYTHON_CMD=python"
)

echo Usando ejecutable: "%PYTHON_CMD%"
"%PYTHON_CMD%" main.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo El programa se detuvo con codigo de salida %ERRORLEVEL%.
)
pause
