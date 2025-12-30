# warm-proxy.ps1 — warm proxy cache for external uploads listed in data/uploads.json
# Usage: run from repo root: powershell -ExecutionPolicy Bypass -File .\scripts\warm-proxy.ps1

Set-Location $PSScriptRoot\..\
$dataFile = Join-Path (Get-Location) 'data\uploads.json'
if (-not (Test-Path $dataFile)) { Write-Error "uploads.json not found at $dataFile"; exit 1 }

$json = Get-Content $dataFile -Raw | ConvertFrom-Json
$items = @()
foreach ($it in $json) {
  if ($it.file -and ($it.file -like 'http*')) { $items += $it.file }
}

if ($items.Count -eq 0) { Write-Output "No external files to warm."; exit 0 }

Write-Output "Found $($items.Count) external files to warm. Starting..."

foreach ($url in $items) {
  try {
    $enc = [uri]::EscapeDataString($url)
    $proxy = "http://127.0.0.1:3000/proxy?url=$enc"
    Write-Output "Warming: $url"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    # Use curl.exe for robust streaming; output to NUL so we don't store data here
    & curl.exe -L --fail "$proxy" -o NUL
    $sw.Stop()
    Write-Output "Done in $($sw.ElapsedMilliseconds) ms"
  } catch {
    Write-Output "Failed to warm $url : $_"
  }
}

Write-Output "Warm caching complete."