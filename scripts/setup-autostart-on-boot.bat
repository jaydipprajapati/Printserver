@echo off
title FastPrint - Install Windows Auto-Start
color 0A
cd /d "%~dp0\.."

echo ============================================================
echo   FASTPRINT - INSTALL AUTO-START ON WINDOWS BOOT
echo ============================================================
echo.
echo Setting up Print Agent to automatically start in background
echo whenever your computer turns on...
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\FastPrintAgent.lnk"
set "TARGET_SCRIPT=%~dp0start-agent-silent.vbs"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_SCRIPT%\"'; $s.WorkingDirectory = '%~dp0..'; $s.Description = 'FastPrint Cloud Agent Auto-start'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
  echo [SUCCESS] Auto-start installed!
  echo Your Canon printer will now automatically connect online
  echo every time you turn on this PC.
) else (
  echo [WARNING] Could not create startup shortcut automatically.
)

echo.
pause
