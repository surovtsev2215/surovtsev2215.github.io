$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
Get-ChildItem -Path $desktop -Filter "*PTO*.lnk" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

$shortcutPath = Join-Path $desktop "PTO Site.lnk"
$launcherPath = "c:\Users\Surovcev\PTO_Project\PTO_Site_Launcher.vbs"

$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($shortcutPath)
$s.TargetPath = "wscript.exe"
$s.Arguments = '"' + $launcherPath + '"'
$s.WorkingDirectory = "c:\Users\Surovcev\PTO_Project"
$s.Description = "PTO site launcher with diagnostics"
$s.IconLocation = "shell32.dll,220"
$s.Save()

Write-Host "Shortcut ready: $shortcutPath"
