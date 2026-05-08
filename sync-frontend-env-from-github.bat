@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
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

set "VAR_LIST=VITE_FIREBASE_API_KEY VITE_FIREBASE_APP_ID VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_STORAGE_BUCKET"

(
  echo VITE_FORCE_DEMO=0
) > "%TMP_FILE%"

for %%V in (%VAR_LIST%) do (
  call :fetchVar "%%V"
  if errorlevel 1 (
    del /q "%TMP_FILE%" >nul 2>nul
    exit /b 1
  )
)

call :loadLocalApiBaseUrl
if not defined API_BASE_URL set "API_BASE_URL=http://localhost:8787"
>> "%TMP_FILE%" echo VITE_API_BASE_URL=%API_BASE_URL%

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src='%TMP_FILE%'; $dst='%ENV_FILE%'; $c=Get-Content -LiteralPath $src -Raw; Set-Content -LiteralPath $dst -Value $c -Encoding UTF8"
if errorlevel 1 (
  echo ERROR: Не удалось записать %ENV_FILE%.
  del /q "%TMP_FILE%" >nul 2>nul
  exit /b 1
)

del /q "%TMP_FILE%" >nul 2>nul
echo Готово: %ENV_FILE% обновлен из GitHub Variables.
echo Репозиторий: %REPO%
echo Важно: значения должны храниться в GitHub Actions Variables ^(не в Secrets^).
exit /b 0

:loadLocalApiBaseUrl
if not exist "%ENV_FILE%" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in (`type "%ENV_FILE%" ^| findstr /R /I "^VITE_API_BASE_URL="`) do (
  set "API_BASE_URL=%%B"
)
exit /b 0

:fetchVar
set "NAME=%~1"
set "VALUE="
for /f "usebackq delims=" %%I in (`gh variable get "%NAME%" -R "%REPO%" 2^>nul`) do set "VALUE=%%I"
if not defined VALUE (
  echo ERROR: Не удалось получить variable %NAME% из %REPO%.
  echo Проверьте, что variable существует в GitHub Actions Variables.
  exit /b 1
)
echo(!VALUE! | findstr /I /C:"\"message\":\"Not Found\"" /C:"documentation_url" >nul
if not errorlevel 1 (
  echo ERROR: Вместо значения %NAME% получен ответ об ошибке GitHub API.
  echo Проверьте gh auth login и доступ к repo %REPO%.
  exit /b 1
)
>> "%TMP_FILE%" echo %NAME%=!VALUE!
exit /b 0
