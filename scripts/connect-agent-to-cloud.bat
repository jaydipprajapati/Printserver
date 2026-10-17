@echo off
setlocal enabledelayedexpansion
title FastPrint - Connect Windows Print Agent to Cloud
color 0B
cd /d "%~dp0\.."

echo ============================================================
echo   FASTPRINT - CONNECT PRINT AGENT TO ONLINE SERVER
echo ============================================================
echo.

:: Check if SERVER_URL is already in .env
set "CURRENT_URL="
if exist .env (
  for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="SERVER_URL" set "CURRENT_URL=%%b"
  )
)

if not "%CURRENT_URL%"=="" (
  echo Last saved Cloud Server URL:
  echo   %CURRENT_URL%
  echo.
  set /p NEW_URL="Press ENTER to use saved URL, or type new URL: "
  if "!NEW_URL!"=="" (
    set "TARGET_URL=%CURRENT_URL%"
  ) else (
    set "TARGET_URL=!NEW_URL!"
  )
) else (
  echo Enter your online server URL (e.g. from Render.com or Railway):
  echo   Example: https://printserver.onrender.com
  echo.
  set /p TARGET_URL="Cloud Server URL: "
)

if "%TARGET_URL%"=="" (
  echo [ERROR] Server URL cannot be empty.
  pause
  exit /b 1
)

:: Save to .env for future runs
echo SERVER_URL=%TARGET_URL%> .env
echo AGENT_AUTH_TOKEN=PRINT_AGENT_SECRET_SECURE_2026>> .env

echo.
echo ============================================================
echo Connecting Windows Print Agent to:
echo   %TARGET_URL%
echo ============================================================
echo.

node agent/printAgent.js

pause
