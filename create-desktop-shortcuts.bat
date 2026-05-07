@echo off
chcp 65001 >nul
setlocal

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "SHORTCUT_PS=$desktop=[Environment]::GetFolderPath('Desktop');"
set "SHORTCUT_PS=%SHORTCUT_PS%$wsh=New-Object -ComObject WScript.Shell;"
set "SHORTCUT_PS=%SHORTCUT_PS%$root='%ROOT_DIR%';"
set "SHORTCUT_PS=%SHORTCUT_PS%$l1=$wsh.CreateShortcut((Join-Path $desktop 'ПТО - Локальный тест.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l1.TargetPath=(Join-Path $root 'test-local-site.bat');$l1.WorkingDirectory=$root;$l1.Save();"
set "SHORTCUT_PS=%SHORTCUT_PS%$l2=$wsh.CreateShortcut((Join-Path $desktop 'ПТО - Безопасно обновить сайт.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l2.TargetPath=(Join-Path $root 'deploy-site.bat');$l2.WorkingDirectory=$root;$l2.Save();"
set "SHORTCUT_PS=%SHORTCUT_PS%$l3=$wsh.CreateShortcut((Join-Path $desktop 'ПТО - Онлайн режим.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l3.TargetPath=(Join-Path $root 'set-online-mode.bat');$l3.WorkingDirectory=$root;$l3.Save();"
set "SHORTCUT_PS=%SHORTCUT_PS%$l4=$wsh.CreateShortcut((Join-Path $desktop 'ПТО - Демо режим.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l4.TargetPath=(Join-Path $root 'set-demo-mode.bat');$l4.WorkingDirectory=$root;$l4.Save();"

powershell -NoProfile -ExecutionPolicy Bypass -Command "%SHORTCUT_PS%"
if errorlevel 1 (
  echo ERROR: Не удалось создать ярлыки автоматически.
  echo Создайте ярлыки вручную на файлы:
  echo   - test-local-site.bat
  echo   - deploy-site.bat
  echo   - set-online-mode.bat
  echo   - set-demo-mode.bat
  exit /b 1
)
echo Ярлыки созданы на рабочем столе.
echo 1) ПТО - Локальный тест
echo 2) ПТО - Безопасно обновить сайт
echo 3) ПТО - Онлайн режим
echo 4) ПТО - Демо режим
exit /b 0
