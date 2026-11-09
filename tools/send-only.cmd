@echo off
REM Double-click: copy the last build to the Supernote without rebuilding.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -NoBuild %*
echo.
pause
