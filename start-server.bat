@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo Starting server...
start "" node server.js
echo Server start requested. Visit http://127.0.0.1:3000
pause