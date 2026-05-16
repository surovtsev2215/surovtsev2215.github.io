@echo off
set "ADMIN_DIR=%~dp0"
if "%ADMIN_DIR:~-1%"=="\" set "ADMIN_DIR=%ADMIN_DIR:~0,-1%"
for %%I in ("%ADMIN_DIR%\..") do set "ROOT_DIR=%%~fI"
