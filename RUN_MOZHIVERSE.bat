@echo off
title Mozhiverse - Multimodal Real-time Translation
cd /d "c:\Users\VIJAY\OneDrive\Documents\mozhiverse2"
echo ========================================================
echo       STARTING MOZHIVERSE PRODUCTION SERVER
echo ========================================================
echo.
echo Opening browser at http://localhost:3001 ...
start "" "http://localhost:3001"
npm.cmd start
pause

