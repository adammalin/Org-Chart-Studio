[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$PinnedNodeVersion = "22.23.1"
$PortableRuntimeRoot = Join-Path $ProjectRoot ".runtime"
$NodeCommandRecord = Join-Path $PortableRuntimeRoot "node-command.txt"
$NpmCommandRecord = Join-Path $PortableRuntimeRoot "npm-command.txt"
$utf8NoBom = New-Object Text.UTF8Encoding($false)

Write-Host ""
Write-Host "ORNL OrgChart Studio - Windows local desktop setup"
Write-Host "=================================================="
Write-Host ""
Write-Host "This runs OrgChart Studio from source through the official Electron runtime."
Write-Host "It does not install a signed application, change execution policy permanently,"
Write-Host "require administrator access, or make system-wide changes."
Write-Host ""

function Test-NodeRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$NpmExecutable
  )
  if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf) -or
      -not (Test-Path -LiteralPath $NpmExecutable -PathType Leaf)) {
    return $false
  }
  try {
    & $NodeExecutable -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major===22&&minor>=13?0:1)"
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Install-PortableNode {
  $machineArchitecture = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }
  switch ($machineArchitecture.ToUpperInvariant()) {
    "AMD64" { $nodeArchitecture = "x64" }
    "ARM64" { $nodeArchitecture = "arm64" }
    default { throw "Unsupported Windows architecture: $machineArchitecture" }
  }

  $archiveName = "node-v$PinnedNodeVersion-win-$nodeArchitecture.zip"
  $nodeUrl = "https://nodejs.org/dist/v$PinnedNodeVersion/$archiveName"
  $checksumsUrl = "https://nodejs.org/dist/v$PinnedNodeVersion/SHASUMS256.txt"
  $runtimeName = "node-v$PinnedNodeVersion-win-$nodeArchitecture"
  $runtimeDirectory = Join-Path $PortableRuntimeRoot $runtimeName
  $nodeExecutable = Join-Path $runtimeDirectory "node.exe"
  $npmExecutable = Join-Path $runtimeDirectory "npm.cmd"

  if (-not (Test-NodeRuntime -NodeExecutable $nodeExecutable -NpmExecutable $npmExecutable)) {
    New-Item -ItemType Directory -Path $PortableRuntimeRoot -Force | Out-Null
    $temporaryDirectory = Join-Path $PortableRuntimeRoot ("download-" + [guid]::NewGuid().ToString("N"))
    $archivePath = Join-Path $temporaryDirectory $archiveName
    $checksumsPath = Join-Path $temporaryDirectory "SHASUMS256.txt"
    try {
      New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
      Write-Host "Node.js 22.13 or later was not found. Downloading a private pinned runtime..."
      Invoke-WebRequest -Uri $nodeUrl -UseBasicParsing -OutFile $archivePath
      Invoke-WebRequest -Uri $checksumsUrl -UseBasicParsing -OutFile $checksumsPath

      $pattern = "^([a-fA-F0-9]{64})\s+$([regex]::Escape($archiveName))\s*$"
      $checksumLine = Get-Content -LiteralPath $checksumsPath | Where-Object {
        $_ -match $pattern
      } | Select-Object -First 1
      if (-not $checksumLine) {
        throw "The official Node.js checksum list did not contain $archiveName."
      }
      $expectedChecksum = ([regex]::Match($checksumLine, $pattern)).Groups[1].Value
      $actualChecksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
      if ($actualChecksum -ine $expectedChecksum) {
        throw "The downloaded Node.js checksum did not match the official list."
      }

      Expand-Archive -LiteralPath $archivePath -DestinationPath $temporaryDirectory -Force
      $extractedDirectory = Join-Path $temporaryDirectory $runtimeName
      if (-not (Test-Path -LiteralPath (Join-Path $extractedDirectory "node.exe") -PathType Leaf)) {
        throw "The downloaded Node.js archive did not contain the expected runtime."
      }
      if (Test-Path -LiteralPath $runtimeDirectory) {
        $invalidRuntime = "$runtimeDirectory.invalid-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
        Move-Item -LiteralPath $runtimeDirectory -Destination $invalidRuntime
      }
      Move-Item -LiteralPath $extractedDirectory -Destination $runtimeDirectory
    } finally {
      if ($temporaryDirectory -like (Join-Path $PortableRuntimeRoot "download-*") -and
          (Test-Path -LiteralPath $temporaryDirectory)) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
      }
    }
  }

  return @{
    Node = $nodeExecutable
    Npm = $npmExecutable
  }
}

$NodeExecutable = ""
$NpmExecutable = ""
$systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
$systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$forcePortableNode = $env:ORGCHART_FORCE_PORTABLE_NODE -eq "1"
if (-not $forcePortableNode -and $systemNode -and $systemNpm -and
    (Test-NodeRuntime -NodeExecutable $systemNode.Source -NpmExecutable $systemNpm.Source)) {
  $NodeExecutable = $systemNode.Source
  $NpmExecutable = $systemNpm.Source
} else {
  $portable = Install-PortableNode
  $NodeExecutable = $portable.Node
  $NpmExecutable = $portable.Npm
}

if (-not (Test-NodeRuntime -NodeExecutable $NodeExecutable -NpmExecutable $NpmExecutable)) {
  throw "OrgChart Studio could not prepare its required Node.js runtime."
}

New-Item -ItemType Directory -Path $PortableRuntimeRoot -Force | Out-Null
[IO.File]::WriteAllText($NodeCommandRecord, $NodeExecutable + [Environment]::NewLine, $utf8NoBom)
[IO.File]::WriteAllText($NpmCommandRecord, $NpmExecutable + [Environment]::NewLine, $utf8NoBom)
$env:Path = (Split-Path -Parent $NodeExecutable) + ";" + $env:Path

if ($env:ORGCHART_SETUP_ONLY_RUNTIME -eq "1") {
  Write-Host "Verified Node runtime: $(& $NodeExecutable --version)"
  exit 0
}

Push-Location $ProjectRoot
try {
  Write-Host "Project: $ProjectRoot"
  Write-Host "Node:    $(& $NodeExecutable --version)"
  Write-Host "npm:     $(& $NpmExecutable --version)"
  Write-Host ""
  Write-Host "Installing exact dependency versions from package-lock.json..."
  & $NpmExecutable ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }

  Write-Host ""
  Write-Host "Building the local desktop interface..."
  & $NpmExecutable run build
  if ($LASTEXITCODE -ne 0) { throw "The desktop build failed with exit code $LASTEXITCODE." }

  Write-Host ""
  Write-Host "Running the hidden Electron startup, GUI, storage, and local AI checks..."
  & $NpmExecutable run desktop:smoke
  if ($LASTEXITCODE -ne 0) { throw "The Electron smoke test failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

$CodexConfigRoot = if ($env:CODEX_HOME) {
  $env:CODEX_HOME
} else {
  Join-Path $env:USERPROFILE ".codex"
}
$McpConfigPath = Join-Path $CodexConfigRoot "config.toml"
$McpManagedMarker = "# BEGIN ORGCHART STUDIO MCP - managed by installer"
$McpSetupChoice = if ($env:ORGCHART_SETUP_MCP) {
  $env:ORGCHART_SETUP_MCP.ToLowerInvariant()
} else {
  "ask"
}
$McpAlreadyManaged = (
  (Test-Path -LiteralPath $McpConfigPath -PathType Leaf) -and
  (Select-String -LiteralPath $McpConfigPath -SimpleMatch $McpManagedMarker -Quiet)
)

if ($McpSetupChoice -eq "ask" -and
    $McpAlreadyManaged) {
  $McpSetupChoice = "install"
} elseif ($McpSetupChoice -eq "ask") {
  $interactiveConsole = $Host.Name -eq "ConsoleHost" -and -not [Console]::IsInputRedirected
  if ($interactiveConsole) {
    Write-Host ""
    Write-Host "Optional ChatGPT Desktop / Codex integration"
    Write-Host "The local MCP companion lets ChatGPT Desktop or Codex use approved charts"
    Write-Host "through OrgChart Studio while the desktop app is open. It can list and read"
    Write-Host "charts, validate or import structured data, and propose reviewed changes."
    Write-Host "Chart fields read through MCP enter that AI conversation. Use it only with"
    Write-Host "charts approved for the ChatGPT or Codex environment you are using."
    Write-Host "Read tools are automatic; tools that change a chart ask for approval."
    Write-Host ""
    $response = Read-Host "Install the local MCP integration? [y/N]"
    if ($response -and @("y", "yes") -contains $response.ToLowerInvariant()) {
      $McpSetupChoice = "install"
    } else {
      $McpSetupChoice = "skip"
    }
  } else {
    $McpSetupChoice = "skip"
  }
}

if (@("1", "yes", "install") -contains $McpSetupChoice) {
  $runtimeBase = if ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
  $McpRuntimePath = Join-Path $runtimeBase "ORNL OrgChart Studio\mcp-runtime.json"
  & $NodeExecutable (Join-Path $ProjectRoot "scripts\configure-orgchart-mcp.mjs") install `
    --project-root $ProjectRoot `
    --config $McpConfigPath `
    --executable $NodeExecutable `
    --runtime-file $McpRuntimePath
  if ($LASTEXITCODE -ne 0) { throw "The local MCP integration could not be configured." }
  Write-Host "Local MCP integration installed."
  Write-Host "Restart ChatGPT Desktop or Codex once so it discovers OrgChart Studio MCP."
}
else {
  if ($McpAlreadyManaged) {
    Write-Host "Existing local MCP integration was left unchanged."
  } else {
    Write-Host "Optional local MCP integration was not installed."
    Write-Host "Install it later from Local AI control after starting the app."
  }
}

$StartScript = Join-Path $ProjectRoot "scripts\start-windows-source-test.ps1"
Write-Host ""
Write-Host "Setup verified."
Write-Host "Working data is stored under your Windows application-data folder by default."
Write-Host "Use Backup & restore to choose a different local data folder and a separate backup folder."
Write-Host "Source updates do not replace working chart data."
Write-Host "For later launches, run:"
Write-Host "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
Write-Host "Or double-click Start-OrgChart-Studio.cmd in the installed application folder."
Write-Host ""

if ($env:ORGCHART_SETUP_STAGE_ONLY -eq "1") {
  exit 0
}

Write-Host "Starting ORNL OrgChart Studio..."
Write-Host "Use the red X in the app to stop both the interface and private local server."
Write-Host ""
& $StartScript
exit $LASTEXITCODE
