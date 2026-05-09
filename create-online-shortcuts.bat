@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop=[Environment]::GetFolderPath('Desktop');" ^
  "$folder=Join-Path $desktop 'ПТО · Онлайн backend';" ^
  "New-Item -ItemType Directory -Path $folder -Force | Out-Null;" ^
  "$wsh=New-Object -ComObject WScript.Shell;" ^
  "$icon=Join-Path $env:SystemRoot 'System32\shell32.dll';" ^
  "$items=@(" ^
  "  @{Name='ПТО · 1. Render backend.lnk'; Target='setup-render-backend.bat'; Icon=167}," ^
  "  @{Name='ПТО · 2. Подключить API URL.lnk'; Target='set-github-api-url.bat'; Icon=21}," ^
  "  @{Name='ПТО · 3. Опубликовать сайт.lnk'; Target='publish-online.bat'; Icon=220}" ^
  ");" ^
  "foreach($i in $items){" ^
  "  $s=$wsh.CreateShortcut((Join-Path $folder $i.Name));" ^
  "  $s.TargetPath=(Join-Path '%ROOT_DIR%' $i.Target);" ^
  "  $s.WorkingDirectory='%ROOT_DIR%';" ^
  "  $s.IconLocation=($icon+','+$i.Icon);" ^
  "  $s.Save();" ^
  "}" ^
  "Write-Host 'Созданы ярлыки:';" ^
  "Get-ChildItem -LiteralPath $folder -Filter *.lnk | Select-Object -ExpandProperty Name"

if errorlevel 1 (
  echo ERROR: Не удалось создать онлайн-ярлыки.
  pause
  exit /b 1
)

echo.
echo Готово. Папка ярлыков: Рабочий стол\ПТО · Онлайн backend
echo.
pause
exit /b 0
