# Starts the voice backend (port 8000) and the interface dev server (port 5173). Windows.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22.12 or newer is required. Install it from https://nodejs.org and retry.' }
$nodeVersion = (& node --version).TrimStart('v')
if ([version]$nodeVersion -lt [version]'22.12.0') { throw "Node.js 22.12 or newer is required (found $nodeVersion)." }

if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
  if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv .venv } else { & python -m venv .venv }
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python virtual environment (Python 3.11 or newer is required).' }
}
& .\.venv\Scripts\python.exe -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed' }
if (-not (Test-Path -LiteralPath '.env')) { Write-Host 'No .env file: voice input/output stays hidden. Copy .env.example to .env and add ELEVENLABS_API_KEY to enable it.' }

$installed = 'frontend\node_modules\.package-lock.json'
if (-not (Test-Path -LiteralPath $installed) -or (Get-Item -LiteralPath 'frontend\package-lock.json').LastWriteTime -gt (Get-Item -LiteralPath $installed).LastWriteTime) {
  Push-Location -LiteralPath 'frontend'
  try { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Interface dependency installation failed' } } finally { Pop-Location }
}

$backend = Start-Process -FilePath '.\.venv\Scripts\python.exe' -ArgumentList '-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000' -NoNewWindow -PassThru
try {
  Push-Location -LiteralPath 'frontend'
  & npm.cmd run dev
} finally {
  Pop-Location
  if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
