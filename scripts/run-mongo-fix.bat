@echo off
cd /d "%~dp0.."
echo [run-mongo-fix] Iniciando correcao do Mongo...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-mongo.ps1" -PauseOnExit
echo.
echo [run-mongo-fix] Fim da execucao. Verifique os logs em .\logs\ caso tenha erro.
pause
