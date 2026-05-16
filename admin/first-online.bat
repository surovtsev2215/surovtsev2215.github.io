@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"

echo ================================================
echo PERVYJ ZAPUSK SAYTA V INTERNETE
echo ================================================
echo Shagi po poryadku. Lyubaya klavisha - dalshe.
pause

echo SHAG 1: Render (sozdanie servera)
call "%~dp0setup-render.bat"
pause

set /p API_URL="Vstavte URL backend: "
if "%API_URL%"=="" (pause & exit /b 1)
if "%API_URL:~-1%"=="/" set "API_URL=%API_URL:~0,-1%"
echo %API_URL%> "%ROOT_DIR%\pto-online-url.txt"
start "" "%API_URL%/api/health"
pause

echo SHAG 2: Perenos dannyh v bazu
call "%~dp0migrate-db.bat"
if errorlevel 1 exit /b 1

echo SHAG 3: GitHub
call "%~dp0set-github-api-url.bat"
if errorlevel 1 exit /b 1

call "%~dp0set-online-mode.bat" quiet
call "%~dp0test-local.bat" quick
if errorlevel 1 exit /b 1

echo SHAG 4: Publikaciya (YES)
call "%~dp0deploy.bat"
if errorlevel 1 exit /b 1

echo SHAG 5: UptimeRobot - besplatno, interval 5-10 min
echo URL: %API_URL%/api/health
start "" "https://uptimerobot.com"
echo.
echo GOTOVO. Dalee tolko yarlyki s rabochego stola.
pause
exit /b 0
