@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"
chcp 65001 >nul

echo ================================================
echo ПТО · Frontend запуск
echo ================================================
echo Frontend: http://localhost:4173
echo ================================================
echo Освобождаю порт 4173...

for /f "tokens=5" %%P in ('netstat -aon ^| findstr :4173 ^| findstr LISTENING') do taskkill /PID %%P /F >nul 2>&1

start "PTO Frontend" cmd /k "cd /d ""%ROOT_DIR%\web\frontend"" && npm run dev -- --host --strictPort --port 4173"
start "" "http://localhost:4173"
echo Готово. Frontend запускается в отдельном окне.
exit /b 0
