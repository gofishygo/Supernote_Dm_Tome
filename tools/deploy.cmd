@echo off
REM Double-click: build DM Tome and copy it to the Supernote's MyStyle folder.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
echo.
pause
