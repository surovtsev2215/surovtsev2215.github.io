@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "ENV_FILE=%ROOT_DIR%\web\frontend\.env.local"
set "DEBUG_LOG_FILE=%ROOT_DIR%\debug-cddc9f.log"
set "DEBUG_RUN_ID=online-%RANDOM%-%RANDOM%"
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='set-online-mode.bat:start';message='online mode script start';data=@{envFile='%ENV_FILE%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion

if not exist "%ENV_FILE%" (
  echo VITE_FORCE_DEMO=0>"%ENV_FILE%"
  goto :done
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p='%ENV_FILE%';" ^
  "$c=Get-Content -LiteralPath $p -Raw;" ^
  "if($c -match '(?m)^\s*VITE_FORCE_DEMO\s*='){ $c=[regex]::Replace($c,'(?m)^\s*VITE_FORCE_DEMO\s*=.*$','VITE_FORCE_DEMO=0'); } else { if(-not $c.EndsWith([Environment]::NewLine)){ $c += [Environment]::NewLine }; $c += 'VITE_FORCE_DEMO=0' + [Environment]::NewLine; };" ^
  "Set-Content -LiteralPath $p -Value $c -Encoding UTF8;"
if errorlevel 1 (
  :: #region agent log
  powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='set-online-mode.bat:error';message='online mode update failed';data=@{envFile='%ENV_FILE%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
  :: #endregion
  echo ERROR: Не удалось включить онлайн режим.
  pause
  exit /b 1
)

:done
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='set-online-mode.bat:done';message='online mode enabled';data=@{value='VITE_FORCE_DEMO=0'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo [ПТО] Онлайн режим включен: VITE_FORCE_DEMO=0
echo Следующие шаги:
echo 1) ПТО · 2. Локальный Тест
echo 2) ПТО · 3. Безопасная Публикация
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 0
