@echo off
setlocal EnableExtensions
call "%~dp0_env.bat"
chcp 65001 >nul

echo ================================================
echo NASTROJKA HRANILISCHA FOTO (Cloudflare R2)
echo ================================================
echo.
echo Odin raz: sozdayte bucket v Cloudflare R2,
echo skopirujte klyuchi i vstavte nizhe.
echo.
pause

set /p S3_ENDPOINT="S3 Endpoint (https://....r2.cloudflarestorage.com): "
set /p S3_BUCKET="Imya bucket: "
set /p S3_ACCESS_KEY_ID="Access Key ID: "
set /p S3_SECRET_ACCESS_KEY="Secret Access Key: "
set /p S3_PUBLIC_BASE_URL="Public URL (https://pub-....r2.dev): "

if "%S3_ENDPOINT%"=="" goto :empty
if "%S3_BUCKET%"=="" goto :empty
if "%S3_ACCESS_KEY_ID%"=="" goto :empty
if "%S3_SECRET_ACCESS_KEY%"=="" goto :empty
if "%S3_PUBLIC_BASE_URL%"=="" goto :empty

set "OUT=%ROOT_DIR%\pto-photo-env.txt"
(
  echo S3_ENDPOINT=%S3_ENDPOINT%
  echo S3_BUCKET=%S3_BUCKET%
  echo S3_ACCESS_KEY_ID=%S3_ACCESS_KEY_ID%
  echo S3_SECRET_ACCESS_KEY=%S3_SECRET_ACCESS_KEY%
  echo S3_PUBLIC_BASE_URL=%S3_PUBLIC_BASE_URL%
)>"%OUT%"

echo.
echo Sokhraneno v: %OUT%
echo.
echo DALEE na sayte Render.com:
echo 1) Otkrojte servis pto-backend
echo 2) Environment - dobavte 5 peremennyh iz fayla
echo 3) Manual Deploy
echo.
start "" "https://dashboard.render.com"
pause
exit /b 0

:empty
echo Otmeneno: ne vse polya zapolneny.
pause
exit /b 1
