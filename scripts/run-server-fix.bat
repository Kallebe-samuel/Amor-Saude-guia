@echo off
cd /d "%~dp0.."
echo [run-server-fix] Iniciando Mongo + servidor Node...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-server.ps1"
echo.
echo [run-server-fix] Fim da execucao.
pause
