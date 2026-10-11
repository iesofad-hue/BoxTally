# Snap-on Toolbox price checker: one-time setup for a Windows computer.
# Installs what the checker needs, saves your Supabase secret key on this computer only,
# and adds two Windows scheduled tasks that run the checker in the background.

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

function Pause-AndExit($code) { Write-Host ""; Read-Host "Press Enter to close" | Out-Null; exit $code }
function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }

Write-Host "Snap-on Toolbox price checker setup" -ForegroundColor White
Write-Host "Folder: $dir"

# 1. Node.js
Step "Checking for Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js isn't installed (or Windows hasn't picked it up yet)." -ForegroundColor Yellow
  Write-Host "Install the LTS version from https://nodejs.org, restart your computer, then run this setup again."
  Pause-AndExit 1
}
Write-Host ("Found Node.js " + (node --version))

# 2. The checker's browser
Step "Installing the checker (this can take a few minutes the first time)"
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw "browser download failed" }
} catch {
  Write-Host "Setup couldn't finish installing: $_" -ForegroundColor Red
  Write-Host "Check your internet connection and run this setup again."
  Pause-AndExit 1
}

# 3. Secret key, saved only on this computer
Step "Saving your Supabase secret key"
$envFile = Join-Path $dir ".env"
$askForKey = $true
if (Test-Path $envFile) {
  $answer = Read-Host "A key is already saved. Replace it? (y/N)"
  $askForKey = $answer -match "^[yY]"
}
if ($askForKey) {
  Write-Host "In Supabase: Project Settings > API Keys > Secret keys. Copy the key that starts with sb_secret_"
  Write-Host "Paste it below (it won't show on screen) and press Enter."
  $secure = Read-Host "Secret key" -AsSecureString
  $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
  if (-not $key.StartsWith("sb_secret_")) {
    Write-Host "That doesn't look like a secret key (it should start with sb_secret_). Run setup again and paste the secret key." -ForegroundColor Red
    Pause-AndExit 1
  }
  Set-Content -Path $envFile -Value "SUPABASE_SECRET_KEY=$key" -Encoding ascii
  Write-Host "Saved to checker\.env on this computer."
}

# 4. Test the connection
Step "Testing the connection to your database"
node check.mjs --count --mode=all
if ($LASTEXITCODE -ne 0) {
  Write-Host "The checker couldn't reach your database. Check the secret key and run setup again." -ForegroundColor Red
  Pause-AndExit 1
}

# 5. Scheduled tasks (run hidden, only while you're signed in to Windows)
Step "Adding the scheduled tasks"
$vbs = Join-Path $dir "run-hidden.vbs"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 45) -MultipleInstances IgnoreNew

$dueAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`" due" -WorkingDirectory $dir
$dueTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Snap-on Toolbox - new part numbers" -Description "Every 30 minutes: prices for new part numbers and Refresh prices requests." -Action $dueAction -Trigger $dueTrigger -Settings $settings -Force | Out-Null

$allAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`" all" -WorkingDirectory $dir
$allTrigger = New-ScheduledTaskTrigger -Daily -At "11:43"
Register-ScheduledTask -TaskName "Snap-on Toolbox - daily prices" -Description "Once a day: re-checks every tracked part number." -Action $allAction -Trigger $allTrigger -Settings $settings -Force | Out-Null

Write-Host "Added 'Snap-on Toolbox - new part numbers' (every 30 minutes) and 'Snap-on Toolbox - daily prices' (11:43 AM)."
Write-Host "If your computer is asleep at 11:43, the daily check runs when it wakes up."

# 6. First check
Step "First price check"
$run = Read-Host "Run a full price check now so you can see it work? (Y/n)"
if ($run -notmatch "^[nN]") {
  node check.mjs --mode=all
  if ($LASTEXITCODE -ne 0) {
    Write-Host "The check had a problem. The message above says why; send it to whoever helped you set this up." -ForegroundColor Yellow
  } else {
    Write-Host "Done. Reload the tracker to see the prices." -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "All set. The checker's history is in checker\checker.log." -ForegroundColor Green
Pause-AndExit 0
