@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo ================================================
echo ПТО · Шаг 3. Публикация сайта с online backend
echo ================================================
echo.
call "%ROOT_DIR%\обнова.bat"
exit /b %ERRORLEVEL%
