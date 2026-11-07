#!/usr/bin/env bash
# ==============================================================================
# DBIDE - MySQL IDE & Debugger
# Script de inicio para macOS (Apple Silicon M1/M2/M3/M4 & Intel) y Linux
# ==============================================================================

set -e

# Cambiar al directorio donde se encuentra este script
cd "$(dirname "$0")"

# Colores para la salida en consola
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # Sin color

echo -e "${CYAN}============================================================"
echo -e "${YELLOW}${BOLD}           DBIDE - MySQL IDE & Debugger (Desktop)           ${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Detección de Arquitectura y Sistema Operativo
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
        echo -e "${GREEN}[✓] Plataforma: macOS Apple Silicon (${ARCH} - Chip M1/M2/M3/M4)${NC}"
    else
        echo -e "${GREEN}[✓] Plataforma: macOS Intel (${ARCH})${NC}"
    fi
elif [ "$OS" = "Linux" ]; then
    echo -e "${GREEN}[✓] Plataforma: Linux (${ARCH})${NC}"
else
    echo -e "${YELLOW}[*] Plataforma: ${OS} (${ARCH})${NC}"
fi

# 2. Localización de Python 3
# En Apple Silicon, Homebrew instala en /opt/homebrew/bin/python3
PYTHON_CMD=""

if [ "$OS" = "Darwin" ] && [ -x "/opt/homebrew/bin/python3" ]; then
    PYTHON_CMD="/opt/homebrew/bin/python3"
elif [ -x "/usr/local/bin/python3" ]; then
    PYTHON_CMD="/usr/local/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="$(command -v python)"
fi

if [ -z "$PYTHON_CMD" ]; then
    echo -e "${RED}[✗] Error: No se encontró Python 3 en el sistema.${NC}"
    echo "Instala Python 3 en tu Mac ejecutando en Terminal:"
    echo "    brew install python"
    echo "o descárgalo desde https://www.python.org/downloads/macos/"
    exit 1
fi

PY_VERSION="$($PYTHON_CMD --version 2>&1)"
echo -e "${GREEN}[✓] Intérprete Python: ${PYTHON_CMD} (${PY_VERSION})${NC}"

# 3. Entorno virtual (.venv) para aislar dependencias y cumplir con PEP 668 en macOS
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}[*] Creando entorno virtual aislado (.venv) para macOS...${NC}"
    "$PYTHON_CMD" -m venv .venv
fi

# Activar el entorno virtual
source .venv/bin/activate

# 4. Comprobación e instalación de dependencias necesarias
if ! python -c "import fastapi, uvicorn, pymysql, cryptography, pydantic" >/dev/null 2>&1; then
    echo -e "${YELLOW}[*] Instalando dependencias necesarias (FastAPI, PyMySQL, Cryptography, Uvicorn)...${NC}"
    pip install --upgrade pip >/dev/null 2>&1 || true
    pip install -r requirements.txt
    echo -e "${GREEN}[✓] Dependencias instaladas con éxito.${NC}"
fi

# 5. Ejecutar la aplicación de escritorio
echo -e "${GREEN}[✓] Iniciando aplicación de escritorio...${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"
exec python main.py

