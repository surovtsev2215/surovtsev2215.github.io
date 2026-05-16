@echo off
setlocal EnableExtensions EnableDelayedExpansion
call "%~dp0_env.bat"

set "URL_FILE=%ROOT_DIR%\pto-online-url.txt"
set "SITE_URL=https://surovtsev2215.github.io/"
set "API_URL="
set "STRICT_PHOTO=0"
if /I "%~1"=="--strict-photo" set "STRICT_PHOTO=1"

if exist "%URL_FILE%" set /p API_URL=<"%URL_FILE%"
if "!API_URL!"=="" (
  set /p API_URL="Vstavte URL backend Render (bez slasha v konce): "
  if "!API_URL!"=="" (pause & exit /b 1)
  echo !API_URL!> "%URL_FILE%"
)
if "!API_URL:~-1!"=="/" set "API_URL=!API_URL:~0,-1!"

set "PS_ARGS=-ApiUrl \"!API_URL!\""
if "!STRICT_PHOTO!"=="1" set "PS_ARGS=!PS_ARGS! -StrictPhoto"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-online.ps1" !PS_ARGS!
if errorlevel 1 (
  echo.
  echo Esli 404 na uchastnikah: Render -^> pto-backend -^> Manual Deploy.
  pause
  exit /b 1
)
if errorlevel 2 (
  echo.
  echo photoStorage disabled. Zapustite admin\setup-photo-storage.bat
  pause
  exit /b 2
)

start "" "!API_URL!/api/health"
start "" "!SITE_URL!"
echo.
echo Gotovo. Na telefone: Ctrl+F5 na forme otcheta.
pause
exit /b 0
