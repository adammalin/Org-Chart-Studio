#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
exec /bin/zsh "${SCRIPT_DIRECTORY}/scripts/start-mac-source-test.zsh"
