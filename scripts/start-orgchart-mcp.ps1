[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$NodeCommandRecord = Join-Path $ProjectRoot ".runtime\node-command.txt"
$NodeExecutable = if (Test-Path -LiteralPath $NodeCommandRecord -PathType Leaf) {
  (Get-Content -LiteralPath $NodeCommandRecord -Raw).Trim()
} else {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { $command.Source } else { "" }
}

if (-not $NodeExecutable -or -not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
  throw "OrgChart Studio MCP needs its local setup refreshed. Run the installer again."
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "mcp\server.mjs") -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules\@modelcontextprotocol\sdk") -PathType Container)) {
  throw "OrgChart Studio MCP is not fully installed. Run the installer again to complete setup."
}

$runtimeBase = if ($env:APPDATA) { $env:APPDATA } else { $env:USERPROFILE }
if (-not $env:ORGCHART_MCP_RUNTIME_FILE) {
  $env:ORGCHART_MCP_RUNTIME_FILE = Join-Path $runtimeBase "ORNL OrgChart Studio\mcp-runtime.json"
}

Push-Location $ProjectRoot
try {
  & $NodeExecutable (Join-Path $ProjectRoot "mcp\server.mjs")
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $exitCode
