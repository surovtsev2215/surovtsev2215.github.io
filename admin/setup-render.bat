@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"
set "DEPLOY_URL=https://render.com/deploy?repo=https://github.com/surovtsev2215/surovtsev2215.github.io"

echo Otkryvayu Render...
start "" "%DEPLOY_URL%"
start "" "https://dashboard.render.com/"
echo Dozhdites statusa Live i skopiruyte URL.
pause
exit /b 0
