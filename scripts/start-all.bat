@echo off
title QR Print System Launcher
color 0E
cd /d "%~dp0\.."
echo ===================================================
echo   LAUNCHING COMPLETE QR ONLINE PRINT SYSTEM
echo ===================================================
echo 1. Starting Backend Print Server...
start "QR Print Server" cmd /k "node server/index.js"

echo Waiting 3 seconds for server initialization...
timeout /t 3 /nobreak >nul

echo 2. Starting Windows Print Agent (Hardware Spooler)...
start "Windows Print Agent" cmd /k "node agent/printAgent.js"

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo 3. Opening Admin Dashboard in browser...
start http://localhost:4000/admin

echo ===================================================
echo   SYSTEM LAUNCHED SUCCESSFULLY!
echo   Customer App: http://localhost:4000/
echo   Admin Panel:  http://localhost:4000/admin
echo   Standee:      http://localhost:4000/standee
echo ===================================================
