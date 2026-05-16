@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"
chcp 65001 >nul

set "ENV_FILE=%ROOT_DIR%\web\frontend\.env.local"
set "TMP_FILE=%ENV_FILE%.tmp"
set "API_BASE_URL="
echo [ПТО] Синхронизация web\frontend\.env.local из GitHub Variables

where gh >nul 2>nul
if errorlevel 1 (
  echo ERROR: GitHub CLI ^(gh^) не найден.
  echo Установите gh и выполните: gh auth login
  exit /b 1
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo ERROR: gh не авторизован.
  echo Выполните: gh auth login
  exit /b 1
)

for /f "usebackq delims=" %%I in (`gh repo view --json nameWithOwner --jq ".nameWithOwner" 2^>nul`) do set "REPO=%%I"
if not defined REPO (
  echo ERROR: Не удалось определить репозиторий через gh repo view.
  exit /b 1
)

(
  echo VITE_FORCE_DEMO=0
) > "%TMP_FILE%"

for /f "usebackq delims=" %%I in (`gh variable get "VITE_API_BASE_URL" -R "%REPO%" 2^>nul`) do set "API_BASE_URL=%%I"
if defined API_BASE_URL (
  echo(!API_BASE_URL! | findstr /I /C:"\"message\":\"Not Found\"" /C:"documentation_url" >nul
  if not errorlevel 1 set "API_BASE_URL="
)

call :loadLocalApiBaseUrl
if not defined API_BASE_URL set "API_BASE_URL=http://localhost:8787"
>> "%TMP_FILE%" echo VITE_API_BASE_URL=!API_BASE_URL!

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src='%TMP_FILE%'; $dst='%ENV_FILE%'; $c=Get-Content -LiteralPath $src -Raw; Set-Content -LiteralPath $dst -Value $c -Encoding UTF8"
if errorlevel 1 (
  echo ERROR: Не удалось записать %ENV_FILE%.
  del /q "%TMP_FILE%" >nul 2>nul
  exit /b 1
)

del /q "%TMP_FILE%" >nul 2>nul
echo Готово: %ENV_FILE% обновлен.
echo Репозиторий: %REPO%
echo VITE_API_BASE_URL=!API_BASE_URL!
exit /b 0

:loadLocalApiBaseUrl
if not exist "%ENV_FILE%" exit /b 0
if defined API_BASE_URL exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in (`type "%ENV_FILE%" ^| findstr /R /I "^VITE_API_BASE_URL="`) do (
  set "API_BASE_URL=%%B"
)
exit /b 0
