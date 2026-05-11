# Starts the Word Cloud server.
# Prefers the local portable Node.js installation if present.

$localNode = Join-Path $PSScriptRoot ".node\node.exe"

if (Test-Path $localNode) {
    $env:PATH = (Join-Path $PSScriptRoot ".node") + ";$env:PATH"
    Write-Host "Using local Node.js" -ForegroundColor Cyan
} else {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
    if (-not $nodePath) {
        Write-Host "Node.js not found. Please run .\install-node.ps1 first." -ForegroundColor Red
        exit 1
    }
    Write-Host "Using system Node.js" -ForegroundColor Cyan
}

Set-Location $PSScriptRoot

if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
}

Write-Host ""
Write-Host "Starting Word Cloud server..." -ForegroundColor Green
Write-Host "Open in browser:" -ForegroundColor Yellow
Write-Host "  Audience / Projector : http://localhost:3000/audience.html" -ForegroundColor White
Write-Host "  Admin / Facilitator  : http://localhost:3000/admin" -ForegroundColor White
Write-Host ""

node server.js
