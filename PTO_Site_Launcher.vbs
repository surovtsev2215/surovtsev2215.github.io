' Тихая обёртка: запускает PTO_Site_Launcher.ps1 без видимых окон.
Option Explicit

Dim sh, fso, root, ps1, cmd
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1  = root & "\PTO_Site_Launcher.ps1"

If Not fso.FileExists(ps1) Then
  MsgBox "Не найден скрипт:" & vbCrLf & ps1, 16, "PTO Site"
  WScript.Quit 1
End If

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
