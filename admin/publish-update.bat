@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"

echo ================================================
echo Publikaciya obnovleniya sayta
echo ================================================

call "%~dp0set-online-mode.bat" quiet
if errorlevel 1 exit /b 1

echo.
echo Proverka sborki pered publikaciej...
call "%~dp0test-local.bat" quick
if errorlevel 1 (
  echo Proverka ne projdena. Publikaciya otmenena.
  pause
  exit /b 1
)

echo Vvedite YES dlya publikacii:
call "%~dp0deploy.bat"
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" echo Cherez 2-3 min: https://surovtsev2215.github.io/ i Ctrl+F5
pause
exit /b %RC%
