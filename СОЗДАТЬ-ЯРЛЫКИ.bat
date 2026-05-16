@echo off
echo ================================================
echo PTO - sozdanie yarlykov na rabochem stole
echo ================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0admin\Create-DesktopShortcuts.ps1"
if errorlevel 1 (
  echo Oshibka sozdaniya yarlykov.
  pause
  exit /b 1
)
echo.
echo Otkroyte papku PTO na rabochem stole.
echo Bolshe ne nuzhno otkryvat etu papku proekta.
echo.
pause
exit /b 0
