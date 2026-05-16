@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"

echo ================================================
echo PERENOS DANNYH V BAZU (ODIN RAZ!)
echo ================================================
echo VNIMANIE: vtoroj zapusk mozhet isportit dannye.
echo.

where npm >nul 2>&1 || (echo ERROR: net Node.js & pause & exit /b 1)
set /p DATABASE_URL="Vstavte Database URL iz Render: "
if "%DATABASE_URL%"=="" (pause & exit /b 1)

cd /d "%ROOT_DIR%\web\backend"
call npm run migrate:json-to-pg
pause
exit /b %ERRORLEVEL%
