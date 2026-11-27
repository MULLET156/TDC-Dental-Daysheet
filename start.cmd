@echo off
rem Starts the Dental Daysheet by hand (Windows). Needs Node.js 20 or newer.
cd /d "%~dp0"
if not exist .env (
  echo No .env file yet. Copy .env.example to .env and fill it in first. See README.md.
  pause
  exit /b 1
)
node server.js
pause
