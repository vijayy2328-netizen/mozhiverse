@echo off
title Mozhiverse - Live Multi-User Simulation
echo Opening Window 1: Anand (Tamil Voice)...
start "" "http://localhost:8000/?role=anand"
timeout /t 1 >nul
echo Opening Window 2: Sarah (Deaf Captions)...
start "" "http://localhost:8000/?role=sarah"
echo.
echo Both participants are now connected in real time!
echo Put the two windows side-by-side to watch live cross-language conversation!
pause
