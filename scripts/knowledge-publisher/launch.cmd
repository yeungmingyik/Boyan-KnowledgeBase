@echo off
where pwsh.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell 7 is required: https://aka.ms/powershell-release?tag=stable
  pause
  exit /b 1
)
pwsh.exe -NoLogo -NoProfile -STA -File "%~dp0Publisher.ps1"
if errorlevel 1 pause
