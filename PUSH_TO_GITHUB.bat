@echo off
title Push Mozhiverse to GitHub
cd /d "c:\Users\VIJAY\OneDrive\Documents\mozhiverse2"
echo ========================================================
echo       PUSHING MOZHIVERSE TO GITHUB
echo ========================================================
echo.
git init
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/jefinjug24it-ship-it/mozhiverse.git
git add .
git commit -m "Mozhiverse: Real-time multimodal communication bridge"
git push -u origin main
echo.
echo ========================================================
echo Done! Visit https://github.com/jefinjug24it-ship-it/mozhiverse
echo ========================================================
pause

