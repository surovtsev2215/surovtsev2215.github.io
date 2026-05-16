@echo off
chcp 65001 >nul
echo ================================================
echo Backend na Render trebuet obnovleniya
echo ================================================
echo.
echo Proverka pokazala 404 na /api/crew/isolators
echo (staryj kod na servere).
echo.
echo 1. Zakommitite i zapushьте izmeneniya v master (esli eshche ne)
echo 2. Render.com -^> pto-backend -^> Manual Deploy
echo 3. Zapustite: admin\check-online.bat
echo.
start "" "https://dashboard.render.com"
pause
