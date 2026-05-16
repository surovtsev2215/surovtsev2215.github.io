@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"
chcp 65001 >nul

set "ENV_FILE=%ROOT_DIR%\web\frontend\.env.local"
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
  echo ERROR: Не удалось включить онлайн режим.
  pause
  exit /b 1
)

:done
echo [ПТО] Онлайн режим включен: VITE_FORCE_DEMO=0
if /I "%~1"=="quiet" exit /b 0
echo Следующие шаги:
echo 1) ПТО - 2. Локальный тест
echo 2) ПТО - 3. Опубликовать обновление
echo 3) Убедитесь, что backend запущен (web\backend, порт 8787)
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 0
