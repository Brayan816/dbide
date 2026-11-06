# PowerShell Launcher for MySQL IDE & Debugger
$Host.UI.RawUI.WindowTitle = "MySQL IDE & Debugger"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "            MySQL IDE & Debugger                   " -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

$pythonExe = "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"

if (-not (Test-Path $pythonExe)) {
    $alt = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python*\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($alt) {
        $pythonExe = $alt
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $pythonExe = "py"
    } else {
        $pythonExe = "python"
    }
}

Write-Host "Iniciando con: $pythonExe" -ForegroundColor Green
& $pythonExe main.py
