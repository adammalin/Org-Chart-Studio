[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$NodeCommandRecord = Join-Path $ProjectRoot ".runtime\node-command.txt"
$NpmCommandRecord = Join-Path $ProjectRoot ".runtime\npm-command.txt"

$NodeExecutable = if (Test-Path -LiteralPath $NodeCommandRecord -PathType Leaf) {
  (Get-Content -LiteralPath $NodeCommandRecord -Raw).Trim()
} else {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { $command.Source } else { "" }
}
$NpmExecutable = if (Test-Path -LiteralPath $NpmCommandRecord -PathType Leaf) {
  (Get-Content -LiteralPath $NpmCommandRecord -Raw).Trim()
} else {
  $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($command) { $command.Source } else { "" }
}

if (-not $NodeExecutable -or -not $NpmExecutable -or
    -not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf) -or
    -not (Test-Path -LiteralPath $NpmExecutable -PathType Leaf)) {
  throw "OrgChart Studio needs its local setup refreshed. Run the two-command installer again."
}

& $NodeExecutable -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major===22&&minor>=13?0:1)"
if ($LASTEXITCODE -ne 0) {
  throw "OrgChart Studio needs Node.js 22.13 or later. Run the installer again to repair this copy."
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\server\wrangler.json") -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules\electron") -PathType Container)) {
  throw "OrgChart Studio is not fully built. Run the two-command installer again to complete setup."
}

$env:Path = (Split-Path -Parent $NodeExecutable) + ";" + $env:Path
Push-Location $ProjectRoot
try {
  & $NpmExecutable run desktop
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $exitCode
