@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo ================================================
echo ПТО · Backend запуск
echo ================================================
echo Backend API: http://localhost:8787
echo ================================================
echo Освобождаю порт 8787...

for /f "tokens=5" %%P in ('netstat -aon ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %%P /F >nul 2>&1

start "PTO Backend" cmd /k "cd /d ""%ROOT_DIR%\web\backend"" && npm run dev"
echo Готово. Backend запускается в отдельном окне.
exit /b 0
