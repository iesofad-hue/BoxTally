@echo off
rem Removes the Snap-on Toolbox scheduled tasks from this computer. Your saved key stays in checker\.env until you delete this folder.
schtasks /Delete /TN "Snap-on Toolbox - new part numbers" /F
schtasks /Delete /TN "Snap-on Toolbox - daily prices" /F
echo.
echo The price checker won't run on this computer anymore.
pause
