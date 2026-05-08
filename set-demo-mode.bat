@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "ENV_FILE=%ROOT_DIR%\web\frontend\.env.local"
set "DEBUG_LOG_FILE=%ROOT_DIR%\debug-cddc9f.log"
set "DEBUG_RUN_ID=demo-%RANDOM%-%RANDOM%"
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='set-demo-mode.bat:start';message='demo mode script start';data=@{envFile='%ENV_FILE%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion

if not exist "%ENV_FILE%" (
  echo VITE_FORCE_DEMO=1>"%ENV_FILE%"
  goto :done
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p='%ENV_FILE%';" ^
  "$c=Get-Content -LiteralPath $p -Raw;" ^
  "if($c -match '(?m)^\s*VITE_FORCE_DEMO\s*='){ $c=[regex]::Replace($c,'(?m)^\s*VITE_FORCE_DEMO\s*=.*$','VITE_FORCE_DEMO=1'); } else { if(-not $c.EndsWith([Environment]::NewLine)){ $c += [Environment]::NewLine }; $c += 'VITE_FORCE_DEMO=1' + [Environment]::NewLine; };" ^
  "Set-Content -LiteralPath $p -Value $c -Encoding UTF8;"
if errorlevel 1 (
  :: #region agent log
  powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='set-demo-mode.bat:error';message='demo mode update failed';data=@{envFile='%ENV_FILE%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
  :: #endregion
  echo ERROR: Не удалось включить демо режим.
  pause
  exit /b 1
)

:done
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='set-demo-mode.bat:done';message='demo mode enabled';data=@{value='VITE_FORCE_DEMO=1'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo [ПТО] Демо режим включен: VITE_FORCE_DEMO=1
echo Сервисный режим активен: сайт работает в локальном demo-режиме.
echo Для рабочего запуска используйте ярлык: ПТО · 1. Включить Онлайн
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 0
