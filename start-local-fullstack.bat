@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo ================================================
echo ПТО · Локальный fullstack запуск
echo ================================================
echo 1) Backend API: http://localhost:8787
echo 2) Frontend:    http://localhost:4173
echo ================================================

start "PTO Backend" cmd /k "cd /d ""%ROOT_DIR%\web\backend"" && npm run dev"
start "PTO Frontend" cmd /k "cd /d ""%ROOT_DIR%\web\frontend"" && npm run dev -- --host --strictPort --port 4173"

echo.
echo Открываю сайт...
start "" "http://localhost:4173"
echo.
echo Готово. Окно можно закрыть.
exit /b 0
