Why auto-terminal failed

When the assistant tried to run `npm install` and `npm start` via the IDE automation, the run failed with an error about Copilot request limits ("ChatRateLimited"). That error comes from the VS Code / Copilot integration used by the automation layer when running terminal commands without an authenticated Copilot session.

How to fix permanently

Option A — let the assistant run commands from the IDE (recommended for convenience):
- Sign into GitHub Copilot in your VS Code (or the appropriate extension the environment requires). Once authenticated, the assistant's automated terminal calls should no longer hit the anonymous rate limit.

Option B — run locally or use the provided scripts (works without changing IDE auth):
- From PowerShell (recommended):

```powershell
Set-Location 'g:\CARSER'
./start-server.ps1
```

- From Command Prompt (cmd.exe):

```bat
cd /d g:\CARSER
start-server.bat
```

What the scripts do

- `start-server.ps1` — installs dependencies if `node_modules` is missing, then starts `node server.js` in a detached process.
- `start-server.bat` — similar behavior for Windows CMD; opens the server via `start` so it runs in a new window.

If you prefer I retry running commands from this environment, sign into Copilot in VS Code and tell me to try again; otherwise run one of the scripts above.

Notes

- The app serves on `http://127.0.0.1:3000` by default.
- I added `public/favicon.ico` and updated HTML to avoid 404 favicon errors.
