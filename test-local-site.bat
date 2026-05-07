@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "LOG_FILE=%ROOT_DIR%\local-test-last.log"
set "DEBUG_LOG_FILE=%ROOT_DIR%\debug-cddc9f.log"
set "DEBUG_RUN_ID=local-test-%RANDOM%-%RANDOM%"
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H4';location='test-local-site.bat:start';message='local test script start';data=@{root='%ROOT_DIR%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion

echo ================================================== > "%LOG_FILE%"
echo Local test started: %date% %time% >> "%LOG_FILE%"
echo Root: %ROOT_DIR% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"

echo.
echo ================================================
echo ПТО · Локальный тест сайта
echo ================================================
echo Шаг 1/3: Проверка сборки
echo Шаг 2/3: Запуск локального сайта
echo Шаг 3/3: Ручная проверка в браузере
echo ================================================
echo.
echo [1/4] Переход в web\frontend
cd /d "%ROOT_DIR%\web\frontend" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail_frontend

echo [2/4] Проверка production-сборки
call npm run build >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail_build

echo [3/4] Запуск локального тестового сервера
start "" "http://localhost:4173"
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H4';location='test-local-site.bat:open-url';message='opening local url';data=@{url='http://localhost:4173';method='start-default-browser'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo [4/4] Откройте сайт в браузере и проверьте основные страницы
echo.
echo Локальный тест запущен. Для остановки нажмите Ctrl+C.
echo Следующий шаг после проверки: ПТО · 3. Безопасная Публикация
echo Лог: "%LOG_FILE%"
call npm run preview -- --host >> "%LOG_FILE%" 2>&1
set "PREVIEW_EXIT=%errorlevel%"
if not "%PREVIEW_EXIT%"=="0" (
  :: #region agent log
  powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H5';location='test-local-site.bat:preview-error';message='preview server exited with error';data=@{previewExit='%PREVIEW_EXIT%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
  :: #endregion
  echo.
  echo ERROR: Локальный сервер завершился с ошибкой.
  echo Подробности: "%LOG_FILE%"
  echo Нажмите любую клавишу, чтобы закрыть окно...
  pause >nul
  exit /b %PREVIEW_EXIT%
)
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 0

:fail_frontend
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='test-local-site.bat:fail-frontend';message='cannot open frontend directory';data=@{path='%ROOT_DIR%\web\frontend'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo.
echo ERROR: Не удалось открыть папку web\frontend
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 1

:fail_build
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='test-local-site.bat:fail-build';message='frontend build failed in local test';data=@{log='%LOG_FILE%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo.
echo ERROR: Сборка не прошла. Публикацию делать нельзя.
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 1
