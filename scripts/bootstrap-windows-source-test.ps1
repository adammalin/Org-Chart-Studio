[CmdletBinding()]
param(
  [string]$TargetDirectory = "",
  [switch]$SkipSetup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$DefaultSourceArchiveUrl = "https://github.com/adammalin/Org-Chart-Studio/archive/refs/heads/main.zip"
$SourceArchiveUrl = if ($env:ORGCHART_SOURCE_ARCHIVE_URL) {
  $env:ORGCHART_SOURCE_ARCHIVE_URL
} else {
  $DefaultSourceArchiveUrl
}
$SourceRepository = "adammalin/Org-Chart-Studio"
$SourceRef = "main"
$ResolvedSourceRevision = if ($env:ORGCHART_SOURCE_REVISION) {
  $env:ORGCHART_SOURCE_REVISION
} else {
  ""
}

function Test-OrgChartSourceFolder {
  param([Parameter(Mandatory = $true)][string]$Path)
  $packagePath = Join-Path $Path "package.json"
  $setupPath = Join-Path $Path "scripts\setup-windows-source-test.ps1"
  if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
    return $false
  }
  try {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    return $package.name -eq "ornl-orgchart-studio"
  } catch {
    return $false
  }
}

if (-not $TargetDirectory) {
  if (Test-OrgChartSourceFolder -Path (Get-Location).Path) {
    $TargetDirectory = (Get-Location).Path
  } else {
    $TargetDirectory = Join-Path $env:USERPROFILE "OrgChart-Studio-source-test"
  }
}

$TargetDirectory = [IO.Path]::GetFullPath($TargetDirectory)
$HomeDirectory = [IO.Path]::GetFullPath($env:USERPROFILE)
$TargetRoot = [IO.Path]::GetPathRoot($TargetDirectory)

Write-Host ""
Write-Host "ORNL OrgChart Studio - Windows command-line installer"
Write-Host "========================================================"
Write-Host ""
Write-Host "Source: $SourceArchiveUrl"
Write-Host "Target: $TargetDirectory"
Write-Host ""

if ($TargetDirectory -eq $TargetRoot -or $TargetDirectory -eq $HomeDirectory) {
  throw "Refusing to update an unsafe target: $TargetDirectory"
}

$UpdateExisting = $false
if (Test-Path -LiteralPath $TargetDirectory) {
  $targetItem = Get-Item -LiteralPath $TargetDirectory -Force
  if (-not $targetItem.PSIsContainer -or
      ($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      -not (Test-OrgChartSourceFolder -Path $TargetDirectory)) {
    throw "The existing target is not a recognized OrgChart Studio application folder. Nothing was overwritten: $TargetDirectory"
  }
  if (-not (Get-Command robocopy.exe -ErrorAction SilentlyContinue)) {
    throw "robocopy.exe is required to update an existing application folder."
  }
  $UpdateExisting = $true
}

$TemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("orgchart-studio-bootstrap-" + [guid]::NewGuid().ToString("N"))
$ArchivePath = Join-Path $TemporaryDirectory "Org-Chart-Studio-main.zip"
$ExtractDirectory = Join-Path $TemporaryDirectory "extract"
$Headers = @{ "User-Agent" = "ORNL-OrgChart-Studio-Installer" }

try {
  New-Item -ItemType Directory -Path $ExtractDirectory -Force | Out-Null

  Write-Host "Downloading the latest main-branch source ZIP..."
  if ($SourceArchiveUrl -eq $DefaultSourceArchiveUrl) {
    Write-Host "Using public GitHub access; no account or authentication is required..."
    $commit = Invoke-RestMethod `
      -Uri "https://api.github.com/repos/$SourceRepository/commits/$SourceRef" `
      -Headers $Headers `
      -UseBasicParsing
    $candidateRevision = [string]$commit.sha
    if ($candidateRevision -notmatch "^[0-9a-f]{40}$") {
      throw "GitHub did not return a valid public commit revision for $SourceRef."
    }
    $ResolvedSourceRevision = $candidateRevision
    $publicArchiveUrl = "https://github.com/$SourceRepository/archive/$ResolvedSourceRevision.zip"
    Invoke-WebRequest -Uri $publicArchiveUrl -Headers $Headers -UseBasicParsing -OutFile $ArchivePath
  } else {
    if (Test-Path -LiteralPath $SourceArchiveUrl -PathType Leaf) {
      Copy-Item -LiteralPath $SourceArchiveUrl -Destination $ArchivePath
    } else {
      Invoke-WebRequest -Uri $SourceArchiveUrl -Headers $Headers -UseBasicParsing -OutFile $ArchivePath
    }
  }

  $ArchiveSha256 = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Expanding the source ZIP..."
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractDirectory -Force
  $expandedDirectories = @(Get-ChildItem -LiteralPath $ExtractDirectory -Directory -Force)
  if ($expandedDirectories.Count -ne 1) {
    throw "The downloaded archive did not contain one source folder."
  }
  $ExpandedDirectory = $expandedDirectories[0].FullName
  if (-not (Test-OrgChartSourceFolder -Path $ExpandedDirectory)) {
    throw "The downloaded archive did not contain the expected OrgChart Studio source."
  }

  if ($UpdateExisting) {
    Write-Host "Updating the existing OrgChart Studio application folder..."
    Write-Host "Preserving its private runtime, dependencies, local tool state, and local output."
    $robocopyArguments = @(
      $ExpandedDirectory,
      $TargetDirectory,
      "/MIR",
      "/R:2",
      "/W:1",
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/NP",
      "/XD",
      ".git",
      ".runtime",
      ".wrangler",
      "node_modules",
      "outputs",
      "output",
      "tmp",
      "work"
    )
    & robocopy.exe @robocopyArguments | Out-Host
    if ($LASTEXITCODE -gt 7) {
      throw "The existing application folder could not be updated. robocopy exit code: $LASTEXITCODE"
    }
  } else {
    Move-Item -LiteralPath $ExpandedDirectory -Destination $TargetDirectory
  }

  $RevisionRecord = Join-Path $TargetDirectory "INSTALL-REVISION.txt"
  $RevisionRecordTemp = "$RevisionRecord.tmp-$PID"
  $revisionLines = @(
    "Product: ORNL OrgChart Studio",
    "Repository: $SourceRepository",
    "Requested ref: $SourceRef",
    "Installed commit: $(if ($ResolvedSourceRevision) { $ResolvedSourceRevision } else { 'unresolved custom archive' })",
    "Archive SHA-256: $ArchiveSha256",
    "Installed at: $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    "Platform: Windows"
  )
  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText(
    $RevisionRecordTemp,
    ($revisionLines -join [Environment]::NewLine) + [Environment]::NewLine,
    $utf8NoBom
  )
  Move-Item -LiteralPath $RevisionRecordTemp -Destination $RevisionRecord -Force

  Write-Host ""
  if ($UpdateExisting) {
    Write-Host "Source updated in:"
  } else {
    Write-Host "Source downloaded to:"
  }
  Write-Host $TargetDirectory
  Write-Host "Revision record: $RevisionRecord"
  Write-Host ""

  $skipRequested = $SkipSetup.IsPresent -or $env:ORGCHART_BOOTSTRAP_SKIP_SETUP -eq "1"
  if (-not $skipRequested) {
    $setupPath = Join-Path $TargetDirectory "scripts\setup-windows-source-test.ps1"
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $setupPath
    if ($LASTEXITCODE -ne 0) {
      throw "OrgChart Studio Windows setup failed with exit code $LASTEXITCODE."
    }
  }
} finally {
  if ($TemporaryDirectory -like (Join-Path ([IO.Path]::GetTempPath()) "orgchart-studio-bootstrap-*") -and
      (Test-Path -LiteralPath $TemporaryDirectory)) {
    Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force
  }
}
