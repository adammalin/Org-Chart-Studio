#!/bin/zsh

set -euo pipefail

DEFAULT_SOURCE_ARCHIVE_URL="https://github.com/adammalin/Org-Chart-Studio/archive/refs/heads/main.zip"
SOURCE_ARCHIVE_URL="${ORGCHART_SOURCE_ARCHIVE_URL:-${DEFAULT_SOURCE_ARCHIVE_URL}}"
SOURCE_REPOSITORY="adammalin/Org-Chart-Studio"
SOURCE_REF="main"
RESOLVED_SOURCE_REVISION="${ORGCHART_SOURCE_REVISION:-}"
if [[ ! -d "${PWD}/.git" &&
      -f "${PWD}/package.json" &&
      -f "${PWD}/scripts/setup-mac-source-test.zsh" ]] &&
    grep -Eq '"name"[[:space:]]*:[[:space:]]*"ornl-orgchart-studio"' \
      "${PWD}/package.json"; then
  DEFAULT_TARGET_DIRECTORY="${PWD}"
else
  DEFAULT_TARGET_DIRECTORY="${HOME}/OrgChart-Studio-source-test"
fi
TARGET_DIRECTORY="${1:-${DEFAULT_TARGET_DIRECTORY}}"
SKIP_SETUP="${ORGCHART_BOOTSTRAP_SKIP_SETUP:-0}"

print ""
print "ORNL OrgChart Studio - source test bootstrap"
print "=============================================="
print ""
print "Source: ${SOURCE_ARCHIVE_URL}"
print "Target: ${TARGET_DIRECTORY}"
print ""

for command_name in curl shasum unzip; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    print -u2 "${command_name} was not found. It is included with supported macOS versions."
    exit 1
  fi
done

if [[ "${TARGET_DIRECTORY:A}" == "/" ||
      "${TARGET_DIRECTORY:A}" == "${HOME:A}" ||
      -L "${TARGET_DIRECTORY}" ]]; then
  print -u2 "Refusing to update an unsafe target: ${TARGET_DIRECTORY}"
  exit 1
fi

UPDATE_EXISTING=0
if [[ -e "${TARGET_DIRECTORY}" ]]; then
  if [[ ! -d "${TARGET_DIRECTORY}" ||
        ! -f "${TARGET_DIRECTORY}/package.json" ||
        ! -f "${TARGET_DIRECTORY}/scripts/setup-mac-source-test.zsh" ]] ||
      ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"ornl-orgchart-studio"' \
        "${TARGET_DIRECTORY}/package.json"; then
    print -u2 "The existing target is not a recognized OrgChart Studio source-test folder:"
    print -u2 "${TARGET_DIRECTORY}"
    print -u2 "Nothing was overwritten."
    exit 1
  fi
  if ! command -v rsync >/dev/null 2>&1; then
    print -u2 "rsync is required to update an existing source-test folder."
    exit 1
  fi
  UPDATE_EXISTING=1
fi

TEMPORARY_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/orgchart-studio-bootstrap.XXXXXX")"
ARCHIVE_PATH="${TEMPORARY_DIRECTORY}/Org-Chart-Studio-main.zip"
EXTRACT_DIRECTORY="${TEMPORARY_DIRECTORY}/extract"
COMMIT_METADATA_PATH="${TEMPORARY_DIRECTORY}/commit.json"

cleanup() {
  if [[ -n "${TEMPORARY_DIRECTORY:-}" &&
        "${TEMPORARY_DIRECTORY}" == */orgchart-studio-bootstrap.* &&
        -d "${TEMPORARY_DIRECTORY}" ]]; then
    rm -rf "${TEMPORARY_DIRECTORY}"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "${EXTRACT_DIRECTORY}"

download_public_revision() {
  local candidate_revision public_archive_url
  if ! curl --fail --location --show-error --retry 3 \
      --output "${COMMIT_METADATA_PATH}" \
      "https://api.github.com/repos/${SOURCE_REPOSITORY}/commits/${SOURCE_REF}"; then
    return 1
  fi
  candidate_revision="$(
    awk -F '"' '/"sha"[[:space:]]*:/ { print $4; exit }' \
      "${COMMIT_METADATA_PATH}"
  )"
  if [[ ! "${candidate_revision}" =~ '^[0-9a-f]{40}$' ]]; then
    print -u2 "GitHub did not return a valid public commit revision for ${SOURCE_REF}."
    return 1
  fi
  RESOLVED_SOURCE_REVISION="${candidate_revision}"
  public_archive_url="https://github.com/${SOURCE_REPOSITORY}/archive/${RESOLVED_SOURCE_REVISION}.zip"
  curl --fail --location --show-error --retry 3 \
    --output "${ARCHIVE_PATH}" \
    "${public_archive_url}"
}

print "Downloading the latest main-branch source ZIP..."
if [[ "${SOURCE_ARCHIVE_URL}" == "${DEFAULT_SOURCE_ARCHIVE_URL}" ]]; then
  print "Using public GitHub access..."
  if ! download_public_revision; then
    print -u2 "The repository is not publicly accessible at the expected GitHub location."
    print -u2 "Public installation becomes available after the repository owner changes its visibility."
    exit 1
  fi
else
  if ! curl --fail --location --show-error --retry 3 \
      --output "${ARCHIVE_PATH}" \
      "${SOURCE_ARCHIVE_URL}"; then
    print -u2 "The configured source archive could not be downloaded."
    exit 1
  fi
fi

ARCHIVE_SHA256="$(shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')"

print "Expanding the source ZIP..."
unzip -q "${ARCHIVE_PATH}" -d "${EXTRACT_DIRECTORY}"

setopt local_options null_glob
EXPANDED_DIRECTORIES=("${EXTRACT_DIRECTORY}"/*(/))
if (( ${#EXPANDED_DIRECTORIES[@]} != 1 )); then
  print -u2 "The downloaded archive did not contain one source folder."
  exit 1
fi
EXPANDED_DIRECTORY="${EXPANDED_DIRECTORIES[1]}"
if [[ ! -f "${EXPANDED_DIRECTORY}/scripts/setup-mac-source-test.zsh" ]] ||
   ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"ornl-orgchart-studio"' \
     "${EXPANDED_DIRECTORY}/package.json"; then
  print -u2 "The downloaded archive did not contain the expected OrgChart Studio source."
  exit 1
fi

if (( UPDATE_EXISTING )); then
  print "Updating the existing OrgChart Studio source-test folder..."
  print "Preserving its private runtime, dependencies, local tool state, and repository metadata."
  rsync -a --delete \
    --exclude "/.git/" \
    --exclude "/.runtime/" \
    --exclude "/.wrangler/" \
    --exclude "/node_modules/" \
    --exclude "/outputs/" \
    --exclude "/output/" \
    --exclude "/tmp/" \
    --exclude "/work/" \
    "${EXPANDED_DIRECTORY}/" "${TARGET_DIRECTORY}/"

  QUICK_START_RELATIVE_PATH="output/pdf/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf"
  if [[ -f "${EXPANDED_DIRECTORY}/${QUICK_START_RELATIVE_PATH}" ]]; then
    mkdir -p "${TARGET_DIRECTORY}/output/pdf"
    cp \
      "${EXPANDED_DIRECTORY}/${QUICK_START_RELATIVE_PATH}" \
      "${TARGET_DIRECTORY}/${QUICK_START_RELATIVE_PATH}"
  fi
else
  mv "${EXPANDED_DIRECTORY}" "${TARGET_DIRECTORY}"
fi

REVISION_RECORD="${TARGET_DIRECTORY}/INSTALL-REVISION.txt"
REVISION_RECORD_TEMP="${REVISION_RECORD}.tmp.$$"
{
  print "Product: ORNL OrgChart Studio"
  print "Repository: ${SOURCE_REPOSITORY}"
  print "Requested ref: ${SOURCE_REF}"
  print "Installed commit: ${RESOLVED_SOURCE_REVISION:-unresolved custom archive}"
  print "Archive SHA-256: ${ARCHIVE_SHA256}"
  print "Installed at: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
} > "${REVISION_RECORD_TEMP}"
chmod 644 "${REVISION_RECORD_TEMP}"
mv "${REVISION_RECORD_TEMP}" "${REVISION_RECORD}"

print ""
if (( UPDATE_EXISTING )); then
  print "Source updated in:"
else
  print "Source downloaded to:"
fi
print "${TARGET_DIRECTORY}"
print "Revision record: ${REVISION_RECORD}"
print ""

if [[ "${SKIP_SETUP}" != "1" ]]; then
  zsh "${TARGET_DIRECTORY}/scripts/setup-mac-source-test.zsh"
fi
