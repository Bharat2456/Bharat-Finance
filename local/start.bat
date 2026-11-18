@echo off
setlocal EnableExtensions
title Bharat Finance - Local Edition
cd /d "%~dp0"
echo.
echo  Bharat Finance - Local Edition
echo  Everything runs on this computer. Nothing is uploaded anywhere.
echo.

rem ---- 1. Is Python 3.9+ already installed? Use it if so. ----
set "PY="
for %%C in (py python python3) do (
  if not defined PY (
    %%C -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>&1 && set "PY=%%C"
  )
)
if defined PY goto :run

rem ---- 2. Not found: ask before downloading anything. ----
echo  Python 3.9 or newer was not found on this computer.
echo  It is the only thing this program needs (about 30 MB).
echo.
choice /C YN /M "  Download and install Python now (official source)"
if errorlevel 2 goto :manual

where winget >nul 2>&1
if not errorlevel 1 (
  echo  Installing with winget...
  winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
) else (
  echo  Downloading the official installer from python.org...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe' -OutFile '%TEMP%\bf-python-setup.exe'"
  if not exist "%TEMP%\bf-python-setup.exe" goto :manual
  "%TEMP%\bf-python-setup.exe" /passive InstallAllUsers=0 PrependPath=1 Include_test=0
  del "%TEMP%\bf-python-setup.exe" >nul 2>&1
)

rem ---- 3. Look again (PATH of this window may be stale) ----
for %%C in (py python python3) do (
  if not defined PY (
    %%C -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>&1 && set "PY=%%C"
  )
)
if not defined PY if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PY=%LocalAppData%\Programs\Python\Python312\python.exe"
if defined PY goto :run

:manual
echo.
echo  Please install Python from https://www.python.org/downloads/
echo  (tick "Add python.exe to PATH"), then double-click start.bat again.
echo.
pause
exit /b 1

:run
echo  Using Python: %PY%
echo  Opening http://127.0.0.1:8765  (close this window to stop the program)
echo.
%PY% run.py %*
echo.
echo  Program stopped.
pause
