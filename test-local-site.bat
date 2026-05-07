@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "LOG_FILE=%ROOT_DIR%\local-test-last.log"

echo ================================================== > "%LOG_FILE%"
echo Local test started: %date% %time% >> "%LOG_FILE%"
echo Root: %ROOT_DIR% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"

echo.
echo ================================================
echo Локальный тест сайта (ПТО)
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
echo [4/4] Откройте сайт в браузере и проверьте основные страницы
echo.
echo Локальный тест запущен. Для остановки нажмите Ctrl+C.
echo Лог: "%LOG_FILE%"
call npm run preview -- --host >> "%LOG_FILE%" 2>&1
set "PREVIEW_EXIT=%errorlevel%"
if not "%PREVIEW_EXIT%"=="0" (
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
echo.
echo ERROR: Не удалось открыть папку web\frontend
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 1

:fail_build
echo.
echo ERROR: Сборка не прошла. Публикацию делать нельзя.
echo Подробности: "%LOG_FILE%"
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 1
