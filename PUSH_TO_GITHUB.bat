@echo off
title Push Mozhiverse to GitHub
cd /d "c:\Users\VIJAY\OneDrive\Documents\mozhiverse2"
echo ========================================================
echo       PUSHING MOZHIVERSE TO GITHUB
echo ========================================================
echo.
git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo ----------------------------------------------------
    echo If a browser window appears, please authorize and
    echo sign in as: jefinjug24it-ship-it
    echo ----------------------------------------------------
)
echo.
echo ========================================================
echo Done! Check https://github.com/jefinjug24it-ship-it/mozhiverse
echo ========================================================
pause
