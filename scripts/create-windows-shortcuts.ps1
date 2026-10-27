[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$launcher = Join-Path $ProjectRoot "Start-OrgChart-Studio.cmd"
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
  throw "The OrgChart Studio launcher is missing."
}

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @("Programs", "DesktopDirectory")) {
  $directory = [Environment]::GetFolderPath($folder)
  if (-not $directory) { throw "Windows did not provide the $folder shortcut folder." }
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $shortcut = $shell.CreateShortcut((Join-Path $directory "OrgChart Studio.lnk"))
  $shortcut.TargetPath = $launcher
  $shortcut.WorkingDirectory = $ProjectRoot
  $shortcut.Description = "Open OrgChart Studio"
  $shortcut.Save()
  Write-Host "Shortcut ready: $(Join-Path $directory 'OrgChart Studio.lnk')"
}
