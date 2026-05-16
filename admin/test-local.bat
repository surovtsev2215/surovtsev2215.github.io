@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"
chcp 65001 >nul
if /I "%~1"=="quick" goto :quick_check

set "LAST_LOG_FILE=%ROOT_DIR%\local-test-last.log"
set "LOG_FILE=%ROOT_DIR%\local-test-run-%RANDOM%-%RANDOM%.log"
set "TEST_URL=http://localhost:4173/"
echo ================================================== > "%LOG_FILE%"
echo Local test started: %date% %time% >> "%LOG_FILE%"
echo Root: %ROOT_DIR% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"

echo.
echo ================================================
echo ПТО · Локальный тест сайта
echo ================================================
echo Шаг 1/4: Синхронизация .env из GitHub
echo Шаг 2/4: Проверка backend
echo Шаг 3/4: Проверка сборки frontend
echo Шаг 4/4: Запуск локального сайта
echo ================================================
echo.
echo [1/5] Синхронизация .env.local из GitHub Variables
call "%ROOT_DIR%\sync-frontend-env-from-github.bat"
if not "%errorlevel%"=="0" (
  echo Sync failed with exit code %errorlevel%. Try local env fallback. >> "%LOG_FILE%"
  call :validate_existing_env
  if errorlevel 1 goto :fail_sync
  echo [WARN] Автосинхронизация недоступна, используем существующий .env.local
)

echo [2/5] Переход в web\frontend
cd /d "%ROOT_DIR%\web\frontend" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail_frontend

echo [3/5] Проверка API конфигурации
if not exist ".env.local" goto :fail_env
findstr /R /I "^VITE_API_BASE_URL=." ".env.local" >nul || goto :fail_env
call :ensure_backend_running
if errorlevel 1 goto :fail_backend

echo [4/5] Проверка production-сборки frontend
call npm run build >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail_build

echo [5/5] Запуск локального тестового сервера
call :open_test_url
echo [Проверка] Откройте сайт и проверьте основные страницы
echo.
echo Локальный тест запущен. Для остановки нажмите Ctrl+C.
echo Следующий шаг после проверки: ПТО · 3. Безопасная Публикация
echo Лог: "%LOG_FILE%"
call :ensure_preview_port
if errorlevel 1 goto :fail_port
call npm run preview -- --host --strictPort --port 4173 >> "%LOG_FILE%" 2>&1
set "PREVIEW_EXIT=%errorlevel%"
if not "%PREVIEW_EXIT%"=="0" (
  echo.
  echo ERROR: Локальный сервер завершился с ошибкой.
  echo Подробности: "%LOG_FILE%"
  echo Нажмите любую клавишу, чтобы закрыть окно...
  pause >nul
  call :finalize_log
  exit /b %PREVIEW_EXIT%
)
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 0

:fail_frontend
echo.
echo ERROR: Не удалось открыть папку web\frontend
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 1

:fail_build
echo.
echo ERROR: Сборка не прошла. Публикацию делать нельзя.
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 1

:fail_sync
echo.
echo ERROR: Автосинхронизация .env.local не выполнена.
echo Проверьте доступ к GitHub Variables и авторизацию gh ^(gh auth login^).
echo Либо заполните web\frontend\.env.local вручную: VITE_API_BASE_URL=http://localhost:8787
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 1

:fail_env
echo.
echo ERROR: API настройки не заполнены в web\frontend\.env.local
echo Для online режима добавьте VITE_API_BASE_URL.
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 1

:fail_backend
echo.
echo ERROR: Backend API недоступен на порту 8787.
echo Запустите backend вручную: web\backend ^> npm run dev
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 1

:fail_port
echo.
echo ERROR: Не удалось освободить порт 4173.
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
call :finalize_log
exit /b 1

:finalize_log
copy /y "%LOG_FILE%" "%LAST_LOG_FILE%" >nul 2>nul
exit /b 0

:validate_existing_env
if not exist "%ROOT_DIR%\web\frontend\.env.local" exit /b 1
findstr /R /I "^VITE_API_BASE_URL=." "%ROOT_DIR%\web\frontend\.env.local" >nul || exit /b 1
findstr /I /C:"{\"message\":\"Not Found\"" "%ROOT_DIR%\web\frontend\.env.local" >nul && exit /b 1
exit /b 0

:ensure_backend_running
netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul
if not errorlevel 1 exit /b 0
echo [INFO] Backend не запущен, стартуем web\backend...
start "PTO Backend (auto)" cmd /k "cd /d ""%ROOT_DIR%\web\backend"" && npm run dev"
set /a WAIT_COUNT=0
:wait_backend_loop
set /a WAIT_COUNT+=1
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul
if not errorlevel 1 exit /b 0
if %WAIT_COUNT% GEQ 20 exit /b 1
goto :wait_backend_loop

:ensure_preview_port
set "PREVIEW_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4173 .*LISTENING"') do (
  set "PREVIEW_PID=%%P"
)
if not defined PREVIEW_PID exit /b 0
echo [WARN] Порт 4173 занят процессом PID=%PREVIEW_PID%. Пытаемся освободить...
taskkill /PID %PREVIEW_PID% /F >> "%LOG_FILE%" 2>&1
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":4173 .*LISTENING" >nul
if not errorlevel 1 exit /b 1
exit /b 0

:open_test_url
start "" "%TEST_URL%"
exit /b 0

:quick_check
echo.
echo [ПТО] Быстрая проверка перед публикацией...
echo [1/4] Синхронизация .env.local
if exist "%ROOT_DIR%\sync-frontend-env-from-github.bat" (
  call "%ROOT_DIR%\sync-frontend-env-from-github.bat"
) else (
  call :validate_existing_env
  if errorlevel 1 (
    echo ERROR: Нет sync-frontend-env-from-github.bat и .env.local не настроен.
    exit /b 1
  )
)
echo [2/4] Проверка .env.local
cd /d "%ROOT_DIR%\web\frontend"
if errorlevel 1 exit /b 1
if not exist ".env.local" (
  echo ERROR: Создайте web\frontend\.env.local с VITE_API_BASE_URL
  exit /b 1
)
findstr /R /I "^VITE_API_BASE_URL=." ".env.local" >nul || (
  echo ERROR: В .env.local нужен VITE_API_BASE_URL
  exit /b 1
)
echo [3/4] Backend (порт 8787)
call :ensure_backend_running
if errorlevel 1 (
  echo ERROR: Backend недоступен. Запустите web\backend
  exit /b 1
)
echo [4/4] Сборка frontend
call npm run build
if errorlevel 1 (
  echo ERROR: Сборка не прошла. Публикацию отменяем.
  exit /b 1
)
echo [ПТО] Проверка пройдена, можно публиковать.
exit /b 0
