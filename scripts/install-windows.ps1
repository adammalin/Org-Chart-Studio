[CmdletBinding()]
param(
  [string]$TargetDirectory = $(if ($env:ORGCHART_INSTALL_TARGET_DIRECTORY) { $env:ORGCHART_INSTALL_TARGET_DIRECTORY } else { Join-Path $env:USERPROFILE "OrgChart-Studio-source-test" })
)

# Public one-paste entry point. Keep the transcript limited to setup, never app use.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("orgchart-install-" + [guid]::NewGuid().ToString("N"))
$logRoot = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "ORNL OrgChart Studio\Installer"
$logPath = Join-Path $logRoot ("setup-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss") + "-$PID.log")
$transcribing = $false
$setupFailed = $false
$previousStageOnly = $env:ORGCHART_SETUP_STAGE_ONLY

try {
  New-Item -ItemType Directory -Path $logRoot, $temporaryDirectory -Force | Out-Null
  Start-Transcript -LiteralPath $logPath -Force | Out-Null
  $transcribing = $true
  Write-Host ""
  Write-Host "Installing OrgChart Studio. This may take several minutes."
  Write-Host "You can leave this window open while setup finishes."
  Write-Host "Setup log: $logPath"
  Write-Host ""
  Write-Host "[1/4] Downloading the installer..."
  $bootstrapPath = Join-Path $temporaryDirectory "bootstrap.ps1"
  # Local-file override supports isolated Windows installer tests without public downloads.
  if ($env:ORGCHART_INSTALL_BOOTSTRAP_PATH) {
    Copy-Item -LiteralPath $env:ORGCHART_INSTALL_BOOTSTRAP_PATH -Destination $bootstrapPath
  } else {
    Invoke-WebRequest -UseBasicParsing `
      -Uri "https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/main/scripts/bootstrap-windows-source-test.ps1" `
      -OutFile $bootstrapPath
  }

  Write-Host "[2/4] Downloading and updating the application..."
  # Stop setup before everyday app use so the log contains installation output only.
  $env:ORGCHART_SETUP_STAGE_ONLY = "1"
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $bootstrapPath -TargetDirectory $TargetDirectory
  if ($LASTEXITCODE -ne 0) {
    throw "Installation did not finish (exit code $LASTEXITCODE)."
  }
  Write-Host "[4/4] OrgChart Studio is ready."
  Write-Host "Open OrgChart Studio from the Start menu or desktop next time."
  Write-Host "To update or repair, close the app and paste the same install command again."
} catch {
  $setupFailed = $true
  Write-Host ""
  Write-Host "OrgChart Studio could not finish installing." -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host "Close OrgChart Studio, check your internet connection, and paste the same install command to try again."
  Write-Host "If it still fails, share this setup log with the person helping you:"
  Write-Host $logPath
} finally {
  $env:ORGCHART_SETUP_STAGE_ONLY = $previousStageOnly
  if ($transcribing) { Stop-Transcript | Out-Null }
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}

if ($setupFailed) {
  if ($env:ORGCHART_INSTALL_NO_PAUSE -ne "1" -and -not [Console]::IsInputRedirected) {
    Read-Host "Press Enter to close setup" | Out-Null
  }
  exit 1
}

if ($env:ORGCHART_SETUP_STAGE_ONLY -eq "1" -or $env:ORGCHART_BOOTSTRAP_SKIP_SETUP -eq "1") {
  exit 0
}

Write-Host "Opening OrgChart Studio..."
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $TargetDirectory "scripts\start-windows-source-test.ps1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "OrgChart Studio could not open. Paste the install command again to repair it." -ForegroundColor Red
  if ($env:ORGCHART_INSTALL_NO_PAUSE -ne "1" -and -not [Console]::IsInputRedirected) {
    Read-Host "Press Enter to close setup" | Out-Null
  }
  exit 1
}
