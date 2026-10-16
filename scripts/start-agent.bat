@echo off
title Windows Print Agent Service (Canon MF3010 / USB / Wi-Fi)
color 0B
cd /d "%~dp0\.."
echo ===================================================
echo   STARTING WINDOWS PRINT AGENT SERVICE...
echo   Auto-discovering USB / Wi-Fi Printers...
echo ===================================================
node agent/printAgent.js
pause
