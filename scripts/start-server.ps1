# Self-heal starter for AmorSaude Guias
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start-server.ps1
# This script will:
#  - read .env (if exists) to find PORT and MONGO_URI
#  - check MongoDB connectivity and try to start Windows service 'MongoDB' if not reachable
#  - detect processes using the configured PORT and kill them (best-effort)
#  - start the Node server with `node server.js` in the current console (foreground)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
$projectRoot = Split-Path -Path $scriptDir -Parent
Set-Location $projectRoot
Write-Host "[self-heal] Working directory: $projectRoot"

# defaults
$PORT = 3002
$mongoHost = '127.0.0.1'
$mongoPort = 27017

# parse .env if available
$envPath = Join-Path $projectRoot '.env'
if (Test-Path $envPath) {
  Write-Host "[self-heal] Reading $envPath"
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*PORT\s*=\s*(\d+)') { $PORT = [int]$matches[1] }
    if ($_ -match '^\s*MONGO_URI\s*=\s*(.+)') { $uri = $matches[1].Trim() ;
        if ($uri -match 'mongodb:\/\/(?:[^@\/]+@)?([^:\/]+):(\d+)') { $mongoHost = $matches[1]; $mongoPort = [int]$matches[2] } }
  }
}

Write-Host "[self-heal] Using PORT=$PORT and MongoDB at ${mongoHost}:$mongoPort"

# Check Mongo connectivity
Write-Host "[self-heal] Checking MongoDB connectivity to ${mongoHost}:$mongoPort..."
$mongoOk = $false
try {
  $mongoOk = Test-NetConnection -ComputerName $mongoHost -Port $mongoPort -WarningAction SilentlyContinue -InformationLevel Quiet
} catch { $mongoOk = $false }

if (-not $mongoOk) {
  Write-Host "[self-heal] MongoDB not reachable. Attempting to start Windows service 'MongoDB' (if present)..."
  try {
    $svc = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
    if ($svc) {
      if ($svc.Status -ne 'Running') { Start-Service -Name 'MongoDB' -ErrorAction SilentlyContinue; Start-Sleep -Seconds 4 }
      $svc = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
      if ($svc -and $svc.Status -eq 'Running') { Write-Host "[self-heal] MongoDB service started." } else { Write-Host "[self-heal] MongoDB service present but not running." }
    } else { Write-Host "[self-heal] MongoDB Windows service not found. Ensure mongod is running manually." }
  } catch { Write-Host "[self-heal] Error while starting MongoDB service: $_" }
  try { $mongoOk = Test-NetConnection -ComputerName $mongoHost -Port $mongoPort -InformationLevel Quiet } catch { $mongoOk = $false }
  if (-not $mongoOk) {
    $mongoScript = Join-Path $scriptDir 'start-mongo.ps1'
    if (Test-Path $mongoScript) {
      Write-Host "[self-heal] Trying fallback helper: $mongoScript"
      try { powershell -ExecutionPolicy Bypass -File $mongoScript } catch { Write-Host "[self-heal] Fallback start-mongo failed: $_" }
      Start-Sleep -Seconds 2
      try { $mongoOk = Test-NetConnection -ComputerName $mongoHost -Port $mongoPort -InformationLevel Quiet } catch { $mongoOk = $false }
    }
  }
  if (-not $mongoOk) { Write-Host "[self-heal] MongoDB still not reachable. Please start MongoDB and re-run this script." ; exit 2 }
}
Write-Host "[self-heal] MongoDB reachable." 

# Check if PORT is busy
Write-Host "[self-heal] Checking if port $PORT is in use..."
$net = netstat -ano | Select-String ":$PORT\s"
$pids = @()
foreach ($line in $net) {
  $parts = ($line -replace '\s{2,}',' ').Trim() -split ' '
  $pid = $parts[-1]
  if ($pid -match '^\d+$') { $pids += [int]$pid }
}
$pids = $pids | Select-Object -Unique
if ($pids.Count -gt 0) {
  Write-Host "[self-heal] Found processes using port ${PORT}: $($pids -join ', ')"
  foreach ($pid in $pids) {
    try {
      $proc = Get-Process -Id $pid -ErrorAction Stop
      Write-Host "[self-heal] Killing process $($proc.ProcessName) (PID $pid)"
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    } catch { Write-Host "[self-heal] Could not inspect/kill PID ${pid}: $_" }
  }
  Start-Sleep -Seconds 1
} else {
  Write-Host "[self-heal] Port $PORT appears free." 
}

# Start the server
Write-Host "[self-heal] Starting Node server (node server.js). This will run in foreground and print logs here. Press Ctrl+C to stop."
try {
  & node server.js
} catch {
  Write-Host "[self-heal] Failed to start server: $_"
  exit 3
}
