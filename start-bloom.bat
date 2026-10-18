@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Installing packages...
call npm install
echo Starting Bloom...
call npm run dev -- --open
pause
