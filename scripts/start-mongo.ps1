<#
Script: start-mongo.ps1
Propósito: tentar restaurar uma instância MongoDB local no Windows.
O que faz:
 - verifica se há um serviço 'MongoDB' e tenta iniciá-lo
 - se não houver serviço, procura por 'mongod.exe' em caminhos padrão e tenta executá-lo em background usando C:\data\db como dbpath
 - cria C:\data\db se necessário
 - testa conexão na porta 27017
Uso:
  Abra PowerShell como Administrador e rode:
    powershell -ExecutionPolicy Bypass -File .\scripts\start-mongo.ps1
#>

param(
  [string]$MongoBinPath,
  [switch]$PauseOnExit
)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
$projectRoot = Split-Path -Path $scriptDir -Parent
Set-Location $projectRoot
Write-Host "[mongo-fix] Iniciando verificação..."

$mongoPort = 27017
$mongoHost = '127.0.0.1'
$exitCode = 0

function TestMongoPort() {
  param($host='127.0.0.1',$port=27017)
  try{ return Test-NetConnection -ComputerName $host -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet } catch { return $false }
}

# 1) Try to start Windows service 'MongoDB'
$svc = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "[mongo-fix] Encontrado serviço 'MongoDB' com status: $($svc.Status)"
  if ($svc.Status -ne 'Running'){
    try{
      Start-Service -Name 'MongoDB' -ErrorAction Stop
      Start-Sleep -Seconds 3
      $svc = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
      Write-Host "[mongo-fix] Serviço 'MongoDB' status agora: $($svc.Status)"
    }catch{
      Write-Host "[mongo-fix] Falha ao iniciar serviço 'MongoDB': $_"
    }
  }
  if (TestMongoPort -host $mongoHost -port $mongoPort){ Write-Host "[mongo-fix] Mongo está acessível em ${mongoHost}:$mongoPort (serviço)."; $exitCode = 0; if($PauseOnExit){ Read-Host "Pressione Enter para fechar" | Out-Null }; exit $exitCode }
}

# 2) Se não houver serviço ou não respondeu, procurar por mongod.exe em caminhos padrão
Write-Host "[mongo-fix] Serviço não disponível ou porta não respondeu; procurando por mongod.exe em caminhos padrão..."
 # prefer explicit path from param -> env -> common locations
 $envPref = $env:MONGO_BIN
 if ($MongoBinPath -and $MongoBinPath.Trim()) {
   $preferred = $MongoBinPath
 } elseif ($envPref -and $envPref.Trim()) {
   $preferred = $envPref
 } else {
   $preferred = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
 }
 $found = $null
 if ($preferred -and (Test-Path $preferred)) { $found = $preferred }
 else {
  $possible = @(
    'C:\Program Files\MongoDB\Server',
    'C:\Program Files (x86)\MongoDB\Server'
  )
  foreach ($base in $possible){
    if (Test-Path $base){
      Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $cand = Join-Path $_.FullName 'bin\mongod.exe'
        if (Test-Path $cand){ $found = $cand }
      }
    }
  }
}

if (-not $found){
  Write-Host "[mongo-fix] Não foi encontrado mongod.exe nos caminhos padrão. Você instalou o MongoDB?"
  Write-Host "Dica: Instale o MongoDB Community Server ou indique o caminho completo do mongod.exe." 
  if (-not (Test-Path 'C:\data\db')){ Write-Host "[mongo-fix] Pasta C:\data\db não existe." } else { Write-Host "[mongo-fix] Pasta C:\data\db encontrada." }
  $exitCode = 2
  if($PauseOnExit){ Read-Host "Pressione Enter para fechar" | Out-Null }
  exit $exitCode
}

Write-Host "[mongo-fix] Encontrado mongod em: $found"

# 3) Garantir C:\data\db
$dbpath = 'C:\data\db'
if (-not (Test-Path $dbpath)){
  try{ New-Item -ItemType Directory -Path $dbpath -Force | Out-Null; Write-Host "[mongo-fix] Criado $dbpath" } catch { Write-Host "[mongo-fix] Falha ao criar ${dbpath}: $_" }
} else { Write-Host "[mongo-fix] DB path existe: $dbpath" }

# 4) Tentar iniciar mongod.exe em background redirecionando saída para logs (Windows)
$logDir = Join-Path $projectRoot 'logs'
if (-not (Test-Path $logDir)){ New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "mongod-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$stdoutLog = Join-Path $logDir "mongod-stdout-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$stderrLog = Join-Path $logDir "mongod-stderr-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$argList = "--dbpath `"$dbpath`" --port $mongoPort --bind_ip $mongoHost --logpath `"$logFile`" --logappend"

Write-Host "[mongo-fix] Iniciando mongod.exe com argumentos: $argList"
try{
  # Start-Process without --fork; process will run independently
  Write-Host "[mongo-fix] Executando: `"$found`" $argList"
  $proc = Start-Process -FilePath $found -ArgumentList $argList -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -ErrorAction Stop
  Start-Sleep -Seconds 3
  if (TestMongoPort -host $mongoHost -port $mongoPort){ Write-Host "[mongo-fix] mongod iniciado e responde em ${mongoHost}:$mongoPort"; Write-Host "[mongo-fix] Logs: $logFile"; Write-Host "[mongo-fix] Stdout: $stdoutLog"; Write-Host "[mongo-fix] Stderr: $stderrLog"; $exitCode = 0 }
  else { Write-Host "[mongo-fix] mongod iniciado mas porta não respondeu."; Write-Host "[mongo-fix] Logs: $logFile"; Write-Host "[mongo-fix] Stdout: $stdoutLog"; Write-Host "[mongo-fix] Stderr: $stderrLog"; $exitCode = 3 }
}catch{
  Write-Host "[mongo-fix] Falha ao iniciar mongod.exe: $_"
  Write-Host "[mongo-fix] Tente executar manualmente: `"$found`" --dbpath `"$dbpath`" --port $mongoPort"
  $exitCode = 4
}

if($PauseOnExit){ Read-Host "Pressione Enter para fechar" | Out-Null }
exit $exitCode
