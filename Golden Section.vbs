' Silent launch "Golden Section" without cmd console window (uses pythonw/pyw).
Option Explicit

Dim sh, fso, root, scr, pyw, i, paths

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
scr = root & "\Мои_утилиты\Golden Section.pyw"

If Not fso.FileExists(scr) Then
    MsgBox "Не найден файл:" & vbCrLf & scr, 16, "Golden Section"
    WScript.Quit 1
End If

If fso.FileExists("C:\Windows\pyw.exe") Then
    sh.Run """C:\Windows\pyw.exe"" -3 """ & scr & """", 0, False
    WScript.Quit 0
End If

paths = Array( _
    sh.ExpandEnvironmentStrings("%LocalAppData%\Programs\Python\Python314\pythonw.exe"), _
    sh.ExpandEnvironmentStrings("%LocalAppData%\Programs\Python\Python313\pythonw.exe"), _
    sh.ExpandEnvironmentStrings("%LocalAppData%\Programs\Python\Python312\pythonw.exe"), _
    sh.ExpandEnvironmentStrings("%LocalAppData%\Programs\Python\Python311\pythonw.exe") )

pyw = ""
For i = 0 To UBound(paths)
    If fso.FileExists(paths(i)) Then
        pyw = paths(i)
        Exit For
    End If
Next

If pyw <> "" Then
    sh.Run """" & pyw & """ """ & scr & """", 0, False
Else
    sh.Run "pythonw.exe """ & scr & """", 0, False
End If
