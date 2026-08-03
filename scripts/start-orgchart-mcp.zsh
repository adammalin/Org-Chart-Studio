#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
PORTABLE_NODE_BIN="${PROJECT_ROOT}/.runtime/node-current/bin"

if [[ -x "${PORTABLE_NODE_BIN}/node" ]]; then
  export PATH="${PORTABLE_NODE_BIN}:${PATH}"
fi

if ! command -v node >/dev/null 2>&1; then
  print -u2 "OrgChart Studio MCP needs its local setup refreshed."
  print -u2 "Run the OrgChart Studio installer again to repair this source-test copy."
  exit 1
fi

if [[ ! -f "${PROJECT_ROOT}/mcp/server.mjs" ||
      ! -d "${PROJECT_ROOT}/node_modules/@modelcontextprotocol/sdk" ]]; then
  print -u2 "OrgChart Studio MCP is not fully installed."
  print -u2 "Run the OrgChart Studio installer again to complete setup."
  exit 1
fi

export ORGCHART_MCP_RUNTIME_FILE="${ORGCHART_MCP_RUNTIME_FILE:-${HOME}/Library/Application Support/ORNL OrgChart Studio/mcp-runtime.json}"

cd "${PROJECT_ROOT}"
exec node "${PROJECT_ROOT}/mcp/server.mjs"
