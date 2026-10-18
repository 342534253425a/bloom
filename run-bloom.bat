@echo off
cd /d "%~dp0"
echo Bloom: zapusk... Ne zakryvaj eto okno.
(
echo === node ===
node -v
echo === npm ===
call npm -v
echo === install ===
call npm install
echo === dev ===
call npm run dev -- --host 127.0.0.1 --port 5173 --open
) > "%~dp0bloom-log.txt" 2>&1
echo Gotovo. Log: bloom-log.txt
pause
