@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "LOG_FILE=%ROOT_DIR%\deploy-last.log"
set "DEBUG_LOG_FILE=%ROOT_DIR%\debug-cddc9f.log"
set "DEBUG_RUN_ID=deploy-%RANDOM%-%RANDOM%"
set "DRY_RUN=0"

if /I "%~1"=="--dry-run" set "DRY_RUN=1"

echo ================================================== > "%LOG_FILE%"
echo Safe deploy started: %date% %time% >> "%LOG_FILE%"
echo Root: %ROOT_DIR% >> "%LOG_FILE%"
echo Dry run: %DRY_RUN% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H5';location='deploy-site.bat:start';message='deploy script start';data=@{dryRun='%DRY_RUN%';root='%ROOT_DIR%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo.
echo ================================================
echo ПТО · Безопасная публикация сайта
echo ================================================
echo Шаг 1/3: Проверка готовности
echo Шаг 2/3: Проверка сборки
echo Шаг 3/3: Подтвержденная публикация
echo ================================================

call :step "[1/11] Open project root"
cd /d "%ROOT_DIR%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Cannot open project root"
  goto :eof
)

call :step "[2/11] Verify git repository"
git rev-parse --is-inside-work-tree >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Current directory is not a git repository"
  goto :eof
)

call :step "[3/11] Ensure branch is publish branch"
for /f %%I in ('git branch --show-current') do set "CURRENT_BRANCH=%%I"
echo Current branch: %CURRENT_BRANCH% >> "%LOG_FILE%"
set "PUBLISH_BRANCH="
if /I "%CURRENT_BRANCH%"=="main" set "PUBLISH_BRANCH=main"
if /I "%CURRENT_BRANCH%"=="master" set "PUBLISH_BRANCH=master"
if "%PUBLISH_BRANCH%"=="" (
  git show-ref --verify --quiet refs/heads/main
  if not errorlevel 1 set "PUBLISH_BRANCH=main"
)
if "%PUBLISH_BRANCH%"=="" (
  git show-ref --verify --quiet refs/heads/master
  if not errorlevel 1 set "PUBLISH_BRANCH=master"
)
if "%PUBLISH_BRANCH%"=="" set "PUBLISH_BRANCH=main"
if /I not "%CURRENT_BRANCH%"=="%PUBLISH_BRANCH%" (
  if "%DRY_RUN%"=="1" (
    call :step "Dry run mode: branch is not publish branch, production push would be blocked"
  ) else (
    echo.
    echo Сейчас активна ветка: %CURRENT_BRANCH%
    echo Для безопасной публикации нужна ветка: %PUBLISH_BRANCH%
    echo.
    set "HAS_LOCAL_CHANGES=0"
    for /f %%I in ('git status --porcelain ^| find /c /v ""') do set "BRANCH_CHANGE_COUNT=%%I"
    if not "!BRANCH_CHANGE_COUNT!"=="0" set "HAS_LOCAL_CHANGES=1"
    if "!HAS_LOCAL_CHANGES!"=="1" (
      call :fail "Есть локальные изменения. Сначала сохраните изменения, затем переключитесь на %PUBLISH_BRANCH% и повторите запуск."
      goto :eof
    )
    set /p SWITCH_MAIN="Переключиться на %PUBLISH_BRANCH% автоматически? (Y/N): "
    if /I "!SWITCH_MAIN!"=="Y" (
      git checkout %PUBLISH_BRANCH% >> "%LOG_FILE%" 2>&1
      if errorlevel 1 (
        call :fail "Не удалось переключиться на %PUBLISH_BRANCH% автоматически"
        goto :eof
      )
      set "CURRENT_BRANCH=%PUBLISH_BRANCH%"
      call :step "Auto switch to publish branch completed"
    ) else (
      call :fail "Публикация отменена. Переключитесь на %PUBLISH_BRANCH% и запустите ярлык снова."
      goto :eof
    )
  )
)

call :step "[4/11] Build frontend (production)"
cd /d "%ROOT_DIR%\web\frontend" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Cannot open web/frontend"
  goto :eof
)
call npm run build >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Frontend build failed"
  goto :eof
)

call :step "[5/11] Check backend workspace"
cd /d "%ROOT_DIR%\web\backend" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Cannot open web/backend"
  goto :eof
)
call npm install >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Backend dependency check failed"
  goto :eof
)

call :step "[6/11] Return to project root"
cd /d "%ROOT_DIR%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "Cannot return to project root"
  goto :eof
)

call :step "[7/11] Check pending changes"
set "HAS_CHANGES=0"
for /f %%I in ('git status --porcelain ^| find /c /v ""') do set "CHANGES_COUNT=%%I"
if not "%CHANGES_COUNT%"=="0" set "HAS_CHANGES=1"
echo Changes count: %CHANGES_COUNT% >> "%LOG_FILE%"

set "DEMO_FLAG=unknown"
for /f "usebackq tokens=1,* delims==" %%A in (`type "%ROOT_DIR%\web\frontend\.env.local" 2^>nul ^| findstr /R /I "^VITE_FORCE_DEMO="`) do set "DEMO_FLAG=%%B"
echo Demo flag: %DEMO_FLAG% >> "%LOG_FILE%"
if /I "%DEMO_FLAG%"=="1" (
  if "%DRY_RUN%"=="1" (
    call :step "Dry run mode: demo flag is ON, publish would be blocked"
  ) else (
    call :fail "Обнаружен DEMO режим (VITE_FORCE_DEMO=1). Сначала запустите ярлык 'ПТО · 1. Включить Онлайн'."
    goto :eof
  )
)

if "%HAS_CHANGES%"=="1" (
  if "%DRY_RUN%"=="1" (
    call :step "Dry run mode: commit skipped"
  ) else (
    call :step "[8/11] Auto-commit prepared changes"
    git add . >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
      call :fail "git add failed"
      goto :eof
    )
    set "STAMP=%date% %time%"
    git commit -m "safe: site update %STAMP%" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 call :step "Commit skipped (nothing to commit or hook rejected)."
  )
) else (
  call :step "[8/11] No changes detected, commit skipped"
)

if "%DRY_RUN%"=="1" (
  call :step "[9/11] Dry run mode: push skipped"
  goto :done
)

echo.
echo Проверки прошли успешно. Сайт готов к безопасной публикации.
set /p CONFIRM_PUSH="Введите YES для публикации в интернет: "
if /I not "!CONFIRM_PUSH!"=="YES" (
  call :fail "Publishing canceled by user"
  goto :eof
)

call :step "[9/11] Save rollback point"
for /f %%I in ('git rev-parse HEAD') do set "LAST_COMMIT=%%I"
echo %LAST_COMMIT%>"%ROOT_DIR%\last-stable-commit.txt"
echo Last stable commit: %LAST_COMMIT% >> "%LOG_FILE%"

call :step "[10/11] Push to remote"
git push >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :fail "git push failed"
  goto :eof
)

call :step "[11/11] Final git status"
git status --short >> "%LOG_FILE%" 2>&1

:done
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H5';location='deploy-site.bat:done';message='deploy script finished';data=@{dryRun='%DRY_RUN%'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo.
echo Safe deploy flow finished.
echo Log file: "%LOG_FILE%"
if "%DRY_RUN%"=="1" (
  echo Dry run mode was used. No changes were published.
) else (
  echo Changes published. Users will receive update after host sync.
)
echo.
if not "%DRY_RUN%"=="1" (
  echo Нажмите любую клавишу, чтобы закрыть окно...
  pause >nul
)
exit /b 0

:step
echo %~1
echo %~1 >> "%LOG_FILE%"
goto :eof

:fail
:: #region agent log
powershell -NoProfile -Command "$o=@{sessionId='cddc9f';runId='%DEBUG_RUN_ID%';hypothesisId='H2';location='deploy-site.bat:fail';message='deploy script failed';data=@{reason='%~1'};timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};($o|ConvertTo-Json -Compress)|Add-Content -LiteralPath '%DEBUG_LOG_FILE%'" >nul 2>nul
:: #endregion
echo.
echo ERROR: %~1
echo ERROR: %~1 >> "%LOG_FILE%"
echo See details in: "%LOG_FILE%"
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 1
