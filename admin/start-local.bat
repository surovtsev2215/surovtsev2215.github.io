@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"

echo ================================================
echo PTO - lokalno na vashem PK
echo ================================================
echo Backend:  http://localhost:8787
echo Frontend: http://localhost:4173
echo ================================================

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: ustanovite Node.js s nodejs.org
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -aon ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -aon ^| findstr :4173 ^| findstr LISTENING') do taskkill /PID %%P /F >nul 2>&1

start "PTO Backend" cmd /k "cd /d ""%ROOT_DIR%\web\backend"" && npm run dev"
start "PTO Frontend" cmd /k "cd /d ""%ROOT_DIR%\web\frontend"" && npm run dev -- --host --strictPort --port 4173"

ping 127.0.0.1 -n 6 >nul
start http://localhost:4173

echo.
echo Gotovo. Ne zakryvayte okna PTO Backend i PTO Frontend.
pause
exit /b 0
