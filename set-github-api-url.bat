@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "REPO=surovtsev2215/surovtsev2215.github.io"

echo ================================================
echo ПТО · Шаг 2. Подключить online backend URL
echo ================================================
echo.
set /p API_URL="Вставьте URL backend (пример: https://pto-backend-xxxx.onrender.com): "
if "%API_URL%"=="" (
  echo ERROR: URL не указан.
  pause
  exit /b 1
)

echo.
echo Устанавливаю GitHub Variable VITE_API_BASE_URL для %REPO% ...
gh variable set VITE_API_BASE_URL --repo "%REPO%" --body "%API_URL%"
if errorlevel 1 (
  echo ERROR: Не удалось записать variable через gh.
  echo Проверьте авторизацию: gh auth login
  pause
  exit /b 1
)

echo.
echo Готово. Теперь запустите:
echo   publish-online.bat
echo чтобы пересобрать фронтенд и применить URL в онлайне.
echo.
pause
exit /b 0
