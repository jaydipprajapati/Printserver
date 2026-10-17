@echo off
setlocal
echo ============================================================
echo   FastPrint - Push Project to GitHub
echo ============================================================
echo.

:: Ensure git is in PATH
set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Git is not found. Please install Git first.
  pause
  exit /b 1
)

for /f "tokens=*" %%a in ('git config --get remote.origin.url 2^>nul') do set "EXISTING_URL=%%a"

if not "%EXISTING_URL%"=="" (
  echo Using configured repository:
  echo   %EXISTING_URL%
  echo.
  set "REPO_URL=%EXISTING_URL%"
) else (
  set /p REPO_URL="Enter your GitHub Repository URL (e.g. https://github.com/username/repo.git): "
  if "%REPO_URL%"=="" (
    echo [ERROR] Repository URL cannot be empty.
    pause
    exit /b 1
  )
  echo Adding remote origin...
  git remote remove origin 2>nul
  git remote add origin %REPO_URL%
)

git branch -M main

echo.
echo Pushing code to GitHub (main branch)...
git push -u origin main

if %ERRORLEVEL% equ 0 (
  echo.
  echo [SUCCESS] Project successfully pushed to GitHub!
) else (
  echo.
  echo [NOTE] If prompted, sign in to your GitHub account in the browser.
)

echo.
pause
