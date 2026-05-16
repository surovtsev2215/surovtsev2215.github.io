@echo off
chcp 65001 >nul
setlocal EnableExtensions
call "%~dp0_env.bat"
set "REPO=surovtsev2215/surovtsev2215.github.io"

echo Podklyuchenie API k GitHub...
set /p API_URL="URL backend (https://....onrender.com): "
if "%API_URL%"=="" (echo Oshibka: pustoj URL & pause & exit /b 1)

gh variable set VITE_API_BASE_URL --repo "%REPO%" --body "%API_URL%"
if errorlevel 1 (
  echo Oshibka gh. Vypolnite: gh auth login
  pause
  exit /b 1
)

set "SAVE_URL=%API_URL%"
if "%SAVE_URL:~-1%"=="/" set "SAVE_URL=%SAVE_URL:~0,-1%"
echo %SAVE_URL%> "%ROOT_DIR%\pto-online-url.txt"

echo Gotovo.
pause
exit /b 0
