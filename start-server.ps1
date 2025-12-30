# start-server.ps1 - run from PowerShell or double-click
# Ensures dependencies are installed and starts the server in a new process.
Set-Location $PSScriptRoot
if (-not (Test-Path "node_modules")) {
  Write-Output "Installing dependencies..."
  npm install
}
Write-Output "Starting server (detached)..."
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $PSScriptRoot
Write-Output "Server start requested. Check the terminal window launched by node or visit http://127.0.0.1:3000"