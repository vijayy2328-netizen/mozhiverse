@echo off
title Mozhiverse - Development Mode
cd /d "c:\Users\VIJAY\OneDrive\Documents\mozhiverse2"
echo ========================================================
echo       STARTING MOZHIVERSE DEV SERVER
echo ========================================================
echo.
echo Opening browser at http://localhost:5173 ...
start "" "http://localhost:5173"
npm.cmd run dev
pause

