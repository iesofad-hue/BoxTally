# Snap-on Toolbox price checker: download the latest checker files from GitHub into this folder.
# Keeps your saved key (.env), the installed packages and the log.

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$zipUrl = "https://github.com/iesofad-hue/snapon-toolbox/archive/refs/heads/main.zip"
$temp = Join-Path $env:TEMP ("snapon-toolbox-update-" + [guid]::NewGuid().ToString("N"))

function Pause-AndExit($code) { Write-Host ""; Read-Host "Press Enter to close" | Out-Null; exit $code }

Write-Host "Updating the Snap-on Toolbox price checker..." -ForegroundColor White
try {
  New-Item -ItemType Directory -Path $temp | Out-Null
  $zip = Join-Path $temp "latest.zip"
  Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $temp -Force
  $source = Join-Path $temp "snapon-toolbox-main\checker"
  if (-not (Test-Path $source)) { throw "the download didn't contain the checker folder" }
  Get-ChildItem -Path $source -File | Where-Object { $_.Name -notin @(".env", "checker.log") } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $dir $_.Name) -Force
    Write-Host ("  updated " + $_.Name)
  }
} catch {
  Write-Host "The update didn't finish: $_" -ForegroundColor Red
  Pause-AndExit 1
} finally {
  if (Test-Path $temp) { Remove-Item -Path $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

Set-Location $dir
npm install --no-audit --no-fund | Out-Null
Write-Host ""
Write-Host "Updated. Your saved key and scheduled tasks are unchanged." -ForegroundColor Green
$run = Read-Host "Run a full price check now to test it? (Y/n)"
if ($run -notmatch "^[nN]") { node check.mjs --mode=all }
Pause-AndExit 0
