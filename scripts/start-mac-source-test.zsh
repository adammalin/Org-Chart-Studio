#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
PORTABLE_NODE_BIN="${PROJECT_ROOT}/.runtime/node-current/bin"

if [[ -x "${PORTABLE_NODE_BIN}/node" ]]; then
  export PATH="${PORTABLE_NODE_BIN}:${PATH}"
fi

if ! command -v node >/dev/null 2>&1 ||
   ! command -v npm >/dev/null 2>&1 ||
   [[ "$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major === 22 && minor >= 13 ? "1" : "0"')" != "1" ]]; then
  print -u2 "OrgChart Studio needs its local setup refreshed."
  print -u2 "Run the two-command installer again to repair this source-test copy."
  exit 1
fi

if [[ ! -f "${PROJECT_ROOT}/dist/server/wrangler.json" ||
      ! -d "${PROJECT_ROOT}/node_modules/electron" ]]; then
  print -u2 "OrgChart Studio is not fully built."
  print -u2 "Run the two-command installer again to complete setup."
  exit 1
fi

cd "${PROJECT_ROOT}"
exec npm run desktop
