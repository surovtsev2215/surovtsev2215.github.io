@echo off
chcp 65001 >nul
setlocal

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "DEBUG_LOG_FILE=%ROOT_DIR%\debug-cddc9f.log"
set "DEBUG_RUN_ID=shortcuts-%RANDOM%-%RANDOM%"
set "NAME_ONLINE=ПТО · 1. Включить Онлайн"
set "NAME_TEST=ПТО · 2. Локальный Тест"
set "NAME_DEPLOY=ПТО · 3. Безопасная Публикация"
set "NAME_DEMO=ПТО · D. Включить Демо"
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H1';location='create-desktop-shortcuts.bat:start';message='shortcut creation start';data=@{root='%ROOT_DIR%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion

set "SHORTCUT_PS=$desktop=[Environment]::GetFolderPath('Desktop');"
set "SHORTCUT_PS=%SHORTCUT_PS%$wsh=New-Object -ComObject WScript.Shell;"
set "SHORTCUT_PS=%SHORTCUT_PS%$root='%ROOT_DIR%';"
set "SHORTCUT_PS=%SHORTCUT_PS%$icon='%SystemRoot%\System32\shell32.dll';"
set "SHORTCUT_PS=%SHORTCUT_PS%$l1=$wsh.CreateShortcut((Join-Path $desktop '%NAME_ONLINE%.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l1.TargetPath=(Join-Path $root 'set-online-mode.bat');$l1.WorkingDirectory=$root;$l1.Description='ПТО: шаг 1, включить онлайн режим';$l1.IconLocation=($icon + ',167');$l1.Save();"
set "SHORTCUT_PS=%SHORTCUT_PS%$l2=$wsh.CreateShortcut((Join-Path $desktop '%NAME_TEST%.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l2.TargetPath=(Join-Path $root 'test-local-site.bat');$l2.WorkingDirectory=$root;$l2.Description='ПТО: шаг 2, локально проверить сайт';$l2.IconLocation=($icon + ',220');$l2.Save();"
set "SHORTCUT_PS=%SHORTCUT_PS%$l3=$wsh.CreateShortcut((Join-Path $desktop '%NAME_DEPLOY%.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l3.TargetPath=(Join-Path $root 'deploy-site.bat');$l3.WorkingDirectory=$root;$l3.Description='ПТО: шаг 3, безопасная публикация сайта';$l3.IconLocation=($icon + ',21');$l3.Save();"
set "SHORTCUT_PS=%SHORTCUT_PS%$l4=$wsh.CreateShortcut((Join-Path $desktop '%NAME_DEMO%.lnk'));"
set "SHORTCUT_PS=%SHORTCUT_PS%$l4.TargetPath=(Join-Path $root 'set-demo-mode.bat');$l4.WorkingDirectory=$root;$l4.Description='ПТО: сервисный режим демонстрации';$l4.IconLocation=($icon + ',44');$l4.Save();"

powershell -NoProfile -ExecutionPolicy Bypass -Command "%SHORTCUT_PS%"
if errorlevel 1 (
  :: #region agent log
  powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H1';location='create-desktop-shortcuts.bat:powershell';message='shortcut creation failed';data=@{exitCode='1'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
  :: #endregion
  echo ERROR: Не удалось создать ярлыки автоматически.
  echo Создайте ярлыки вручную на файлы:
  echo   - test-local-site.bat
  echo   - deploy-site.bat
  echo   - set-online-mode.bat
  echo   - set-demo-mode.bat
  exit /b 1
)
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H3';location='create-desktop-shortcuts.bat:success';message='shortcuts created';data=@{online='%NAME_ONLINE%';local='%NAME_TEST%';deploy='%NAME_DEPLOY%';demo='%NAME_DEMO%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo Ярлыки ПТО обновлены на рабочем столе:
echo 1) %NAME_ONLINE%
echo 2) %NAME_TEST%
echo 3) %NAME_DEPLOY%
echo 4) %NAME_DEMO%
exit /b 0
