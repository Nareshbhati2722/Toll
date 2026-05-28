@echo off
setlocal enabledelayedexpansion

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in system PATH.
    echo Please install Node.js (v16+) to run the setup script.
    echo Visit: https://nodejs.org/
    exit /b 1
)

:: Run the cross-platform setup installer
node "%~dp0setup.js"
