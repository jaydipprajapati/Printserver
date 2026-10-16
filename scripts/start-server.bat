@echo off
title QR Print Server (Node.js)
color 0A
cd /d "%~dp0\.."
echo ===================================================
echo   STARTING QR CODE ONLINE PRINTING SERVER...
echo ===================================================
node server/index.js
pause
