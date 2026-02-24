param(
  [string]$MongodPath = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe',
  [string]$ServiceName = 'MongoDB',
  [string]$DbPath = 'C:\MongoDB\data',
  [string]$LogPath = 'C:\MongoDB\log\mongod.log',
  [int]$Port = 27017,
  [switch]$PauseOnExit
)

$ErrorActionPreference = 'Continue'
$exitCode = 0

function Pause-And-Exit([int]$code) {
  if ($PauseOnExit) { Read-Host 'Pressione Enter para fechar' | Out-Null }
  exit $code
}

Write-Host "[mongo-service-repair] Iniciando reparo do serviço MongoDB..."

if (-not (Test-Path $MongodPath)) {
  Write-Host "[mongo-service-repair] mongod.exe não encontrado em: $MongodPath"
  Write-Host "[mongo-service-repair] Informe o caminho correto com -MongodPath."
  Pause-And-Exit 2
}

# Ensure folders
try {
  $dbDir = Split-Path -Path $DbPath -Parent
  if (-not (Test-Path $dbDir)) { New-Item -Path $dbDir -ItemType Directory -Force | Out-Null }
  if (-not (Test-Path $DbPath)) { New-Item -Path $DbPath -ItemType Directory -Force | Out-Null }

  $logDir = Split-Path -Path $LogPath -Parent
  if (-not (Test-Path $logDir)) { New-Item -Path $logDir -ItemType Directory -Force | Out-Null }
} catch {
  Write-Host "[mongo-service-repair] Falha ao criar diretórios: $_"
  Pause-And-Exit 3
}

# Build config file
$configDir = 'C:\MongoDB\config'
$configPath = Join-Path $configDir 'mongod.cfg'
if (-not (Test-Path $configDir)) { New-Item -Path $configDir -ItemType Directory -Force | Out-Null }

$configContent = @"
systemLog:
  destination: file
  path: $LogPath
  logAppend: true
storage:
  dbPath: $DbPath
net:
  bindIp: 127.0.0.1
  port: $Port
"@

Set-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Host "[mongo-service-repair] Config criado em: $configPath"

# Stop and delete old service if exists
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "[mongo-service-repair] Serviço existente encontrado: $ServiceName (status: $($svc.Status))"
  try {
    if ($svc.Status -eq 'Running') {
      Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
  } catch {
    Write-Host "[mongo-service-repair] Aviso ao parar serviço: $_"
  }

  Write-Host "[mongo-service-repair] Removendo serviço antigo..."
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

# Install new service
Write-Host "[mongo-service-repair] Instalando serviço com config nova..."
try {
  & $MongodPath --config "$configPath" --install --serviceName "$ServiceName"
} catch {
  Write-Host "[mongo-service-repair] Falha ao instalar serviço: $_"
  Pause-And-Exit 4
}

# Start service
try {
  Start-Service -Name $ServiceName -ErrorAction Stop
  Start-Sleep -Seconds 3
} catch {
  Write-Host "[mongo-service-repair] Falha ao iniciar serviço: $_"
  Write-Host "[mongo-service-repair] Verifique logs em: $LogPath"
  Pause-And-Exit 5
}

# Validate connectivity
$ok = $false
try {
  $ok = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet
} catch {
  $ok = $false
}

if ($ok) {
  Write-Host "[mongo-service-repair] OK: MongoDB respondendo em 127.0.0.1:$Port"
  Write-Host "[mongo-service-repair] Log: $LogPath"
  Pause-And-Exit 0
} else {
  Write-Host "[mongo-service-repair] Serviço criado, mas porta não respondeu."
  Write-Host "[mongo-service-repair] Verifique log: $LogPath"
  Pause-And-Exit 6
}
