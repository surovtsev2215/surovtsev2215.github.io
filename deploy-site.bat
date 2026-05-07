@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "LOG_FILE=%ROOT_DIR%\deploy-last.log"
set "DRY_RUN=0"

if /I "%~1"=="--dry-run" set "DRY_RUN=1"

echo ================================================== > "%LOG_FILE%"
echo Deploy started: %date% %time% >> "%LOG_FILE%"
echo Root: %ROOT_DIR% >> "%LOG_FILE%"
echo Dry run: %DRY_RUN% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"

call :step "[1/8] Open project root"
cd /d "%ROOT_DIR%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :fail "Cannot open project root"

call :step "[2/8] Verify git repository"
git rev-parse --is-inside-work-tree >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :fail "Current directory is not a git repository"

call :step "[3/8] Check pending changes"
set "HAS_CHANGES=0"
for /f %%I in ('git status --porcelain ^| find /c /v ""') do set "CHANGES_COUNT=%%I"
if not "%CHANGES_COUNT%"=="0" set "HAS_CHANGES=1"
echo Changes count: %CHANGES_COUNT% >> "%LOG_FILE%"

if "%HAS_CHANGES%"=="1" (
  call :step "[4/8] Stage and commit changes"
  git add . >> "%LOG_FILE%" 2>&1
  if errorlevel 1 call :fail "git add failed"

  set "STAMP=%date% %time%"
  git commit -m "auto: site update %STAMP%" >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    call :step "Commit skipped (nothing to commit or hook rejected)."
  )
) else (
  call :step "[4/8] No changes detected, commit skipped"
)

call :step "[5/8] Build frontend"
cd /d "%ROOT_DIR%\web\frontend" >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :fail "Cannot open web/frontend"
call npm run build >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :fail "Frontend build failed"

call :step "[6/8] Push to remote"
cd /d "%ROOT_DIR%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :fail "Cannot return to project root"
if "%DRY_RUN%"=="1" (
  call :step "Dry run mode: git push skipped"
) else (
  git push >> "%LOG_FILE%" 2>&1
  if errorlevel 1 call :fail "git push failed"
)

call :step "[7/8] Final git status"
git status --short >> "%LOG_FILE%" 2>&1

call :step "[8/8] Done"
echo.
echo Deployment flow finished successfully.
echo Log file: "%LOG_FILE%"
if "%DRY_RUN%"=="1" (
  echo Dry run mode was used. No push to remote.
) else (
  echo Changes pushed. GitHub Pages will update after pipeline completes.
)
exit /b 0

:step
echo %~1
echo %~1 >> "%LOG_FILE%"
goto :eof

:fail
echo.
echo ERROR: %~1
echo ERROR: %~1 >> "%LOG_FILE%"
echo See details in: "%LOG_FILE%"
exit /b 1
