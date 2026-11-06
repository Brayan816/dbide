' Lanzador de escritorio para MySQL IDE & Debugger (Sin ventana de consola)
' Ejecuta la aplicacion como un programa nativo de escritorio tipo Beekeeper o Postman
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = currentDir
WshShell.Run "cmd /c run.bat", 0, False
