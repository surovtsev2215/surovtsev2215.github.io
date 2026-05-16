@echo off
setlocal EnableExtensions EnableDelayedExpansion
call "%~dp0_env.bat"

set "URL_FILE=%ROOT_DIR%\pto-online-url.txt"
set "SITE_URL=https://surovtsev2215.github.io/"
set "API_URL="

if exist "%URL_FILE%" set /p API_URL=<"%URL_FILE%"
if "!API_URL!"=="" (
  set /p API_URL="Vstavte URL backend Render: "
  if "!API_URL!"=="" (pause & exit /b 1)
  echo !API_URL!> "%URL_FILE%"
)
if "!API_URL:~-1!"=="/" set "API_URL=!API_URL:~0,-1!"
set "HEALTH_URL=!API_URL!/api/health"

echo Proverka: !HEALTH_URL!
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri '!HEALTH_URL!' -UseBasicParsing -TimeoutSec 90; $j=$r.Content | ConvertFrom-Json; Write-Host 'OK:' $r.Content; if ($j.photoStorage) { Write-Host ''; Write-Host 'Foto v oblake (photoStorage):' $j.photoStorage; if ($j.photoStorage -eq 'disabled') { Write-Host 'Podskazka: zapustite admin\setup-photo-storage.bat i sdelayte Manual Deploy na Render.' } } } catch { Write-Host 'OSHIBKA:' $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo Podozhdite 1 minutu i povtorite. Proverite render.com
  pause
  exit /b 1
)
start "" "!HEALTH_URL!"
start "" "!SITE_URL!"
echo.
pause
exit /b 0
