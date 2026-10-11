@echo off
rem Double-click to run a full price check right now, with the results shown in this window.
cd /d "%~dp0"
node check.mjs --mode=all
echo.
pause
