$ErrorActionPreference = "Stop"
$adminDir = $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$folder = Join-Path $desktop "PTO"
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$wsh = New-Object -ComObject WScript.Shell
$icon = Join-Path $env:SystemRoot "System32\shell32.dll"
$items = @(
  @{ Name = "ПТО — 1. Локально на ПК.lnk"; Target = "start-local.bat"; Icon = 25 },
  @{ Name = "ПТО — 2. Первый запуск в интернет.lnk"; Target = "first-online.bat"; Icon = 167 },
  @{ Name = "ПТО — 3. Опубликовать обновление.lnk"; Target = "publish-update.bat"; Icon = 220 },
  @{ Name = "ПТО — 4. Проверить сайт.lnk"; Target = "check-online.bat"; Icon = 21 },
  @{ Name = "ПТО — 5. Инструкция.lnk"; Target = "open-instrukciya.bat"; Icon = 23 }
)
Get-ChildItem -LiteralPath $folder -Filter *.lnk -ErrorAction SilentlyContinue | Remove-Item -Force
foreach ($item in $items) {
  $lnkPath = Join-Path $folder $item.Name
  $sc = $wsh.CreateShortcut($lnkPath)
  $sc.TargetPath = Join-Path $adminDir $item.Target
  $sc.WorkingDirectory = $adminDir
  $sc.IconLocation = "$icon,$($item.Icon)"
  $sc.Save()
}
Write-Host "Готово. Папка на рабочем столе:"
Write-Host $folder