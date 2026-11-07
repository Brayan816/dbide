import os
import sys
import platform
import subprocess
import webbrowser
import threading
import time
import uvicorn

def find_chromium_app_executable():
    """
    Locates an available Chromium-based browser (Edge, Chrome, Brave, Arc) that supports
    --app mode to run the IDE as a native standalone desktop application
    without address bar, browser tabs, or navigation buttons.
    Supports macOS (Apple Silicon ARM64 & Intel), Linux, and Windows.
    """
    candidates = []

    if sys.platform == "darwin":
        # macOS paths (Apple Silicon / Intel)
        home = os.path.expanduser("~")
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Arc.app/Contents/MacOS/Arc",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            os.path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            os.path.join(home, "Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
            os.path.join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ]
    elif sys.platform.startswith("linux"):
        # Linux paths
        candidates = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/brave-browser",
            "/usr/bin/microsoft-edge",
            "/usr/bin/microsoft-edge-stable",
            "/snap/bin/chromium",
        ]
    else:
        # Windows paths
        candidates = [
            # Microsoft Edge
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
            # Google Chrome
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            # Brave
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]

    for path in candidates:
        if os.path.isfile(path):
            return path
    return None

def launch_desktop_window(url: str):
    """
    Launches the application as a standalone desktop window (like Postman or Beekeeper Studio).
    """
    time.sleep(1.2)
    browser_exe = find_chromium_app_executable()

    if browser_exe:
        if sys.platform == "darwin":
            profile_dir = os.path.expanduser("~/Library/Application Support/MySQLDebugger/app_profile")
        elif sys.platform.startswith("linux"):
            profile_dir = os.path.expanduser("~/.config/MySQLDebugger/app_profile")
        else:
            profile_dir = os.path.join(
                os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
                "MySQLDebugger",
                "app_profile"
            )
        os.makedirs(profile_dir, exist_ok=True)

        engine_name = os.path.basename(browser_exe)
        if sys.platform == "darwin" and "Contents" in browser_exe:
            for part in browser_exe.split("/"):
                if part.endswith(".app"):
                    engine_name = part
                    break

        print(f"\n[*] Iniciando en modo aplicación de escritorio nativa (estilo Beekeeper/Postman)")
        print(f"    Motor: {engine_name}")
        print(f"    Ventana: 1440x900 (sin barra de direcciones ni pestañas de navegador)")

        cmd = [
            browser_exe,
            f"--app={url}",
            f"--user-data-dir={profile_dir}",
            "--window-size=1440,900",
            "--window-position=80,40",
            "--app-id=mysqldebugger_desktop_app",
            "--disable-features=Translate,OptimizationHints",
            "--no-first-run",
            "--no-default-browser-check"
        ]

        try:
            subprocess.Popen(cmd)
            return
        except Exception as e:
            print(f"[!] Error al iniciar ventana de escritorio ({e}). Usando navegador estándar...")

    # Fallback to standard browser if chromium app mode fails
    print(f"\n[*] Abriendo en el navegador predeterminado: {url}")
    webbrowser.open(url)

if __name__ == "__main__":
    os_name = platform.system()
    machine = platform.machine()
    arch_str = f" ({machine})" if machine else ""
    if os_name == "Darwin" and machine in ("arm64", "aarch64"):
        arch_str = " (Apple Silicon M1/M2/M3/M4)"

    print("=" * 60)
    print("           MySQL IDE & Debugger - Desktop App")
    print("============================================================")
    print("  Modo: Aplicación de Escritorio (Standalone Window)")
    print(f"  Plataforma: {os_name}{arch_str}")
    print("  Host: http://127.0.0.1:8000")
    print("  Presione Ctrl+C en esta consola para detener el servidor.")
    print("=" * 60)

    # Launch desktop window in a background thread
    threading.Thread(target=launch_desktop_window, args=("http://127.0.0.1:8000",), daemon=True).start()

    # Start FastAPI server
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, log_level="warning", reload=True)
