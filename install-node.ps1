# Downloads and installs Node.js LTS (no admin required for portable mode)
# Run this once: .\install-node.ps1

$nodeVersion = "20.11.1"
$nodeArch    = "x64"
$zipName     = "node-v$nodeVersion-win-$nodeArch.zip"
$downloadUrl = "https://nodejs.org/dist/v$nodeVersion/$zipName"
$installDir  = Join-Path $PSScriptRoot ".node"

if (Test-Path (Join-Path $installDir "node.exe")) {
    Write-Host "Node.js already installed at $installDir" -ForegroundColor Green
} else {
    Write-Host "Downloading Node.js v$nodeVersion..." -ForegroundColor Cyan
    $zipPath = Join-Path $env:TEMP $zipName
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "Extracting..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
    $extracted = Join-Path $env:TEMP "node-v$nodeVersion-win-$nodeArch"
    if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }
    Move-Item $extracted $installDir
    Remove-Item $zipPath -Force
    Write-Host "Node.js installed to $installDir" -ForegroundColor Green
}

# Add node to PATH for this session
$env:PATH = "$installDir;$env:PATH"

Write-Host "Installing npm packages..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
& "$installDir\npm.cmd" install

Write-Host ""
Write-Host "Done! Run .\start.ps1 to launch the server." -ForegroundColor Green
