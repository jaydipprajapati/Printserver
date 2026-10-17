Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(scriptDir)

WshShell.CurrentDirectory = projectDir
WshShell.Run "cmd /c node agent/printAgent.js", 0, False
