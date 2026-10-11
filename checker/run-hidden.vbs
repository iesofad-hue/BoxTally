' Runs the price checker without opening a window. Used by the Windows scheduled tasks.
' Usage: wscript.exe run-hidden.vbs due|all
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
mode = "due"
If WScript.Arguments.Count > 0 Then mode = WScript.Arguments(0)
If mode <> "all" Then mode = "due"
shell.CurrentDirectory = folder
shell.Run "cmd /c node check.mjs --mode=" & mode & " >> checker.log 2>&1", 0, True
