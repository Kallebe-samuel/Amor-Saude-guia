@echo off
cd /d "%~dp0.."
echo [full-fix] 1/3 Reparando servico MongoDB...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\repair-mongo-service.ps1" -PauseOnExit
if errorlevel 1 (
  echo [full-fix] Falha no reparo do MongoDB. Encerrando.
  pause
  exit /b 1
)

echo [full-fix] 2/3 Validando porta 27017...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [full-fix] MongoDB ainda nao responde na 27017.
  echo [full-fix] Verifique o log em C:\MongoDB\log\mongod.log
  pause
  exit /b 1
)

echo [full-fix] 3/3 Iniciando servidor Node...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-server.ps1"
echo.
echo [full-fix] Fim.
pause
