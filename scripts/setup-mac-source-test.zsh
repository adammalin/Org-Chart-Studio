#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
PINNED_NODE_VERSION="22.23.1"
PORTABLE_RUNTIME_ROOT="${PROJECT_ROOT}/.runtime"
PORTABLE_NODE_LINK="${PORTABLE_RUNTIME_ROOT}/node-current"

print ""
print "ORNL OrgChart Studio - local desktop setup"
print "============================================"
print ""
print "This runs OrgChart Studio from source through the official Electron runtime."
print "It does not install an app in /Applications, disable Gatekeeper, remove"
print "quarantine attributes, or make system-wide changes."
print ""

use_portable_node() {
  local machine_architecture node_architecture archive_name node_url
  local checksums_url temporary_directory archive_path checksums_path
  local expected_checksum actual_checksum extracted_directory runtime_directory

  for command_name in curl tar shasum; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      print -u2 "${command_name} is required to install the local Node runtime."
      exit 1
    fi
  done

  machine_architecture="$(uname -m)"
  case "${machine_architecture}" in
    arm64) node_architecture="arm64" ;;
    x86_64) node_architecture="x64" ;;
    *)
      print -u2 "Unsupported Mac architecture: ${machine_architecture}"
      exit 1
      ;;
  esac

  archive_name="node-v${PINNED_NODE_VERSION}-darwin-${node_architecture}.tar.gz"
  node_url="https://nodejs.org/dist/v${PINNED_NODE_VERSION}/${archive_name}"
  checksums_url="https://nodejs.org/dist/v${PINNED_NODE_VERSION}/SHASUMS256.txt"
  runtime_directory="${PORTABLE_RUNTIME_ROOT}/node-v${PINNED_NODE_VERSION}-darwin-${node_architecture}"

  if [[ ! -x "${runtime_directory}/bin/node" ]]; then
    mkdir -p "${PORTABLE_RUNTIME_ROOT}"
    temporary_directory="$(mktemp -d "${PORTABLE_RUNTIME_ROOT}/download.XXXXXX")"
    archive_path="${temporary_directory}/${archive_name}"
    checksums_path="${temporary_directory}/SHASUMS256.txt"

    cleanup_runtime_download() {
      if [[ -n "${temporary_directory:-}" &&
            "${temporary_directory}" == "${PORTABLE_RUNTIME_ROOT}"/download.* &&
            -d "${temporary_directory}" ]]; then
        rm -rf "${temporary_directory}"
      fi
    }
    trap cleanup_runtime_download EXIT INT TERM

    print "Node.js 22.13 or later was not found. Downloading a private pinned runtime..."
    curl --fail --location --show-error --retry 3 \
      --output "${archive_path}" "${node_url}"
    curl --fail --location --show-error --retry 3 \
      --output "${checksums_path}" "${checksums_url}"

    expected_checksum="$(
      awk -v archive="${archive_name}" '$2 == archive { print $1 }' \
        "${checksums_path}"
    )"
    actual_checksum="$(shasum -a 256 "${archive_path}" | awk '{ print $1 }')"
    if [[ -z "${expected_checksum}" || "${actual_checksum}" != "${expected_checksum}" ]]; then
      print -u2 "The downloaded Node.js checksum did not match the official list."
      exit 1
    fi

    tar -xzf "${archive_path}" -C "${temporary_directory}"
    extracted_directory="${temporary_directory}/${archive_name%.tar.gz}"
    if [[ ! -x "${extracted_directory}/bin/node" ]]; then
      print -u2 "The downloaded Node.js archive did not contain the expected runtime."
      exit 1
    fi
    if [[ -e "${runtime_directory}" ]]; then
      mv "${runtime_directory}" "${runtime_directory}.invalid.$(date +%Y%m%d-%H%M%S)"
    fi
    mv "${extracted_directory}" "${runtime_directory}"
    cleanup_runtime_download
    trap - EXIT INT TERM
  fi

  ln -sfn "${runtime_directory:t}" "${PORTABLE_NODE_LINK}"
  export PATH="${PORTABLE_NODE_LINK}/bin:${PATH}"
}

SYSTEM_NODE_USABLE=0
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  if [[ "$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major === 22 && minor >= 13 ? "1" : "0"')" == "1" ]]; then
    SYSTEM_NODE_USABLE=1
  fi
fi

if (( ! SYSTEM_NODE_USABLE )); then
  use_portable_node
fi

if ! command -v node >/dev/null 2>&1 ||
   ! command -v npm >/dev/null 2>&1 ||
   [[ "$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major === 22 && minor >= 13 ? "1" : "0"')" != "1" ]]; then
  print -u2 "OrgChart Studio could not prepare its required Node.js runtime."
  exit 1
fi

if [[ "${ORGCHART_SETUP_ONLY_RUNTIME:-0}" == "1" ]]; then
  print "Verified Node runtime: $(node --version)"
  exit 0
fi

cd "${PROJECT_ROOT}"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  print "Enabled repository hooks that block chart databases and backup files from commits and pushes."
fi

print "Project: ${PROJECT_ROOT}"
print "Node:    $(node --version)"
print "npm:     $(npm --version)"
print ""
print "Installing the exact dependency versions from package-lock.json..."
npm ci --no-audit --no-fund

print ""
print "Building the local desktop interface..."
npm run build

print ""
print "Running the hidden Electron startup and local-storage check..."
npm run desktop:smoke

print ""
print "Setup verified."
print "The app stores its working data under your macOS Application Support folder by default."
print "Use Backup & restore to choose a different local data folder and a separate backup folder. Cloud-sync folders require encryption."
print "Source updates do not replace working data. Live chart data is blocked from normal Git commits and pushes."
print "For later launches, run: /bin/zsh \"${PROJECT_ROOT}/scripts/start-mac-source-test.zsh\""
print ""

if [[ "${ORGCHART_SETUP_STAGE_ONLY:-0}" == "1" ]]; then
  exit 0
fi

print "Starting ORNL OrgChart Studio..."
print "Close the window or press Command-Q to stop its private local service."
print ""
exec zsh "${PROJECT_ROOT}/scripts/start-mac-source-test.zsh"
