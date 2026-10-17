@echo off
title FastPrint - Instant Public Online Tunnel
color 0A
cd /d "%~dp0\.."

echo ============================================================
echo   FASTPRINT - INSTANT PUBLIC TUNNEL (Option A)
echo ============================================================
echo.
echo 1. Ensuring Backend Print Server is running on port 4000...
netstat -ano | findstr ":4000 " | findstr "LISTENING" >nul
if %ERRORLEVEL% neq 0 (
  echo    Starting local server...
  start "QR Print Server" cmd /k "node server/index.js"
  timeout /t 3 /nobreak >nul
) else (
  echo    Local server is already running!
)

echo.
echo 2. Ensuring Windows Print Agent is running...
netstat -ano | findstr ":4000 " | findstr "ESTABLISHED" >nul
if %ERRORLEVEL% neq 0 (
  echo    Starting print agent...
  start "Windows Print Agent" cmd /k "node agent/printAgent.js"
  timeout /t 2 /nobreak >nul
) else (
  echo    Print agent is already running!
)

echo.
echo 3. Generating Public Secure HTTPS Tunnel...
echo    Customers anywhere (Wi-Fi or Mobile Data) can open this link!
echo ============================================================
echo.

npx --yes localtunnel --port 4000

pause
