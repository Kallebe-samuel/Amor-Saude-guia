@echo off
cd /d "%~dp0.."
echo [run-mongo-service-repair] Recriando servico MongoDB...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\repair-mongo-service.ps1" -PauseOnExit
echo.
echo [run-mongo-service-repair] Fim.
pause
