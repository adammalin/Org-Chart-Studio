@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows-source-test.ps1"
set "ORGCHART_EXIT_CODE=%errorlevel%"
if not "%ORGCHART_EXIT_CODE%"=="0" (
  echo.
  echo OrgChart Studio could not start. Repeat the command-line installation to repair it.
  if not "%ORGCHART_LAUNCH_NO_PAUSE%"=="1" pause
)
exit /b %ORGCHART_EXIT_CODE%
