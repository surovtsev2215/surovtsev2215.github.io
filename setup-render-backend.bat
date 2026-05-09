@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "REPO_URL=https://github.com/surovtsev2215/surovtsev2215.github.io"
set "DEPLOY_URL=https://render.com/deploy?repo=%REPO_URL%"

echo ================================================
echo ПТО · Шаг 1. Развернуть backend на Render (free)
echo ================================================
echo.
echo 1) Сейчас откроется страница Render Blueprint Deploy.
echo 2) Войдите в Render и подтвердите создание сервиса pto-backend.
echo 3) Дождитесь статуса Live.
echo 4) Скопируйте URL сервиса вида: https://pto-backend-xxxx.onrender.com
echo.
echo Если сервис уже создан, просто откройте Render Dashboard и возьмите URL.
echo.

start "" "%DEPLOY_URL%"
start "" "https://dashboard.render.com/"

echo.
echo После получения URL backend запустите:
echo   set-github-api-url.bat
echo.
echo Нажмите любую клавишу для закрытия...
pause >nul
exit /b 0
