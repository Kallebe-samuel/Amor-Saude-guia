param(
  [switch]$PauseOnExit
)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
$projectRoot = Split-Path -Path $scriptDir -Parent
Set-Location $projectRoot

function Finish([int]$code) {
  if ($PauseOnExit) { Read-Host 'Pressione Enter para fechar' | Out-Null }
  exit $code
}

Write-Host '[full-fix-ps] 1/3 Reparando serviço MongoDB...'
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\repair-mongo-service.ps1"
if ($LASTEXITCODE -ne 0) {
  Write-Host '[full-fix-ps] Falha no reparo do MongoDB. Encerrando.'
  Finish 1
}

Write-Host '[full-fix-ps] 2/3 Validando porta 27017...'
$mongoOk = $false
try {
  $mongoOk = Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet
} catch {
  $mongoOk = $false
}
if (-not $mongoOk) {
  Write-Host '[full-fix-ps] MongoDB ainda não responde na 27017.'
  Write-Host '[full-fix-ps] Verifique o log em C:\MongoDB\log\mongod.log'
  Finish 1
}

Write-Host '[full-fix-ps] 3/3 Iniciando servidor Node...'
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-server.ps1"
Finish $LASTEXITCODE
