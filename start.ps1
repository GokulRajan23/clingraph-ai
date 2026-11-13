$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { py -3.12 -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
# The interface is a React app in frontend\. Install and build it only when missing or older than its sources.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20 or newer is required to build the interface. Install it from https://nodejs.org and retry.' }
$nodeVersion = (& node --version).TrimStart('v')
if ([int]$nodeVersion.Split('.')[0] -lt 20) { throw "Node.js 20 or newer is required to build the interface (found $nodeVersion)." }
$installed = 'frontend\node_modules\.package-lock.json'
if (-not (Test-Path -LiteralPath $installed) -or (Get-Item -LiteralPath 'frontend\package-lock.json').LastWriteTime -gt (Get-Item -LiteralPath $installed).LastWriteTime) {
  Push-Location -LiteralPath 'frontend'
  try { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Interface dependency installation failed' } } finally { Pop-Location }
}
$built = 'frontend\dist\index.html'
$sources = @(Get-ChildItem -LiteralPath 'frontend\src' -Recurse -File) + @(Get-Item -LiteralPath 'frontend\index.html', 'frontend\package.json', 'frontend\package-lock.json', 'frontend\vite.config.ts', 'frontend\tsconfig.json')
if (-not (Test-Path -LiteralPath $built) -or ($sources | Where-Object { $_.LastWriteTime -gt (Get-Item -LiteralPath $built).LastWriteTime })) {
  Push-Location -LiteralPath 'frontend'
  try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Interface build failed' } } finally { Pop-Location }
}
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
