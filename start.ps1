# Installs the interface's dependencies when needed and starts the dev server (Windows).
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22.12 or newer is required. Install it from https://nodejs.org and retry.' }
$nodeVersion = (& node --version).TrimStart('v')
if ([version]$nodeVersion -lt [version]'22.12.0') { throw "Node.js 22.12 or newer is required (found $nodeVersion)." }
$installed = 'node_modules\.package-lock.json'
if (-not (Test-Path -LiteralPath $installed) -or (Get-Item -LiteralPath 'package-lock.json').LastWriteTime -gt (Get-Item -LiteralPath $installed).LastWriteTime) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
}
& npm.cmd run dev
