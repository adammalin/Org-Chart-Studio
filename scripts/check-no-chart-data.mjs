#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(SCRIPT_DIRECTORY);

const SAFE_DATA_FIXTURES = new Set([
  "tests/fixtures/invalid-import.csv",
  "tests/fixtures/sample-import.csv",
]);
const SAFE_JSON_FILES = new Set([
  ".openai/hosting.json",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
]);
const PUBLIC_BINARY_ALLOWLIST = new Set([
  "output/pdf/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf",
]);
const PUBLIC_RELEASE_TEXT_SCAN_EXCLUSIONS = new Set([
  "scripts/check-no-chart-data.mjs",
]);
const SOURCE_EVIDENCE_EXTENSIONS = new Set([
  ".docx",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".pptx",
  ".tif",
  ".tiff",
  ".webp",
  ".xls",
  ".xlsx",
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
  ".zsh",
]);
const PUBLIC_RELEASE_BLOCKED_PATTERNS = [
  {
    pattern: /[A-Za-z0-9._%+-]+@ornl\.gov/i,
    reason: "ORNL email address",
  },
  {
    pattern: /\/Users\/(?!example(?:\/|\b))[^/\s"']+/i,
    reason: "user-specific macOS home path",
  },
  {
    pattern: /(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/,
    reason: "GitHub credential-shaped value",
  },
  {
    pattern: /sk-[A-Za-z0-9_-]{20,}/,
    reason: "API credential-shaped value",
  },
  {
    pattern: /AKIA[0-9A-Z]{16}/,
    reason: "AWS credential-shaped value",
  },
  {
    pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
    reason: "private key material",
  },
];

function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function blockedDataPath(filePath) {
  const normalizedPath = normalizeRepositoryPath(filePath).toLowerCase();
  const components = normalizedPath.split("/");
  const baseName = components.at(-1) ?? "";
  const extension = path.extname(baseName);
  const blockedDirectory = [
    ".wrangler",
    "backups",
    "chart-backups",
    "chart-data",
    "local-worker-data",
    "orgchart-data",
  ].includes(components[0]);
  const blockedSourceEvidence =
    SOURCE_EVIDENCE_EXTENSIONS.has(extension) &&
    !PUBLIC_BINARY_ALLOWLIST.has(normalizeRepositoryPath(filePath));
  return (
    blockedDirectory ||
    blockedSourceEvidence ||
    baseName.endsWith(".orgchart-backup") ||
    baseName.endsWith(".sqlite") ||
    baseName.endsWith(".sqlite3") ||
    baseName.endsWith(".sqlite-shm") ||
    baseName.endsWith(".sqlite-wal") ||
    baseName.endsWith(".db") ||
    baseName.endsWith(".db-shm") ||
    baseName.endsWith(".db-wal")
  );
}

function isSafeFixture(filePath) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  return SAFE_DATA_FIXTURES.has(normalizedPath);
}

export function contentLooksLikePublicReleaseRisk(filePath, contents) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  if (PUBLIC_RELEASE_TEXT_SCAN_EXCLUSIONS.has(normalizedPath)) return null;
  const extension = path.extname(normalizedPath.toLowerCase());
  if (!TEXT_EXTENSIONS.has(extension)) return null;

  for (const blocked of PUBLIC_RELEASE_BLOCKED_PATTERNS) {
    if (blocked.pattern.test(contents)) return blocked.reason;
  }

  if (
    /Full Name,Position Title,Employment Type,Organization Name,Supervisor Full Name/i.test(
      contents,
    )
  ) {
    const nonSyntheticRosterRow = contents
      .split(/\r?\n/)
      .some((line) => {
        if (!/,Employee,/i.test(line)) return false;
        const columns = line.split(",");
        const personName = columns[0]?.trim() ?? "";
        const supervisorName = columns.at(-1)?.trim() ?? "";
        return [personName, supervisorName]
          .filter(Boolean)
          .some((name) => !/(?:Example|Synthetic)/i.test(name));
      });
    if (nonSyntheticRosterRow) return "non-synthetic workforce roster embedded in source";
  }

  return null;
}

function objectLooksLikeChartData(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(objectLooksLikeChartData);
  const candidate = value;
  if (
    typeof candidate.format === "string" &&
    candidate.format.startsWith("orgchart-studio-")
  ) {
    return true;
  }
  if (Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)) return true;
  if (Array.isArray(candidate.charts) && candidate.charts.some(objectLooksLikeChartData)) {
    return true;
  }
  if (
    typeof candidate.assignmentLabel === "string" &&
    (typeof candidate.parentId === "string" || typeof candidate.positionTitle === "string")
  ) {
    return true;
  }
  return Object.values(candidate).some(objectLooksLikeChartData);
}

export function contentLooksLikeChartData(filePath, contents) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  if (isSafeFixture(normalizedPath) || SAFE_JSON_FILES.has(normalizedPath)) return false;
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith(".json")) {
    try {
      return objectLooksLikeChartData(JSON.parse(contents));
    } catch {
      return false;
    }
  }
  if (lowerPath.endsWith(".csv") || lowerPath.endsWith(".tsv")) {
    const header = contents.split(/\r?\n/, 1)[0].toLowerCase();
    const normalizedHeader = header.replace(/["' _-]/g, "");
    return (
      (normalizedHeader.includes("parentid") &&
        normalizedHeader.includes("positiontitle") &&
        normalizedHeader.includes("assignmentlabel")) ||
      (normalizedHeader.includes("supervisor") && normalizedHeader.includes("name"))
    );
  }
  return false;
}

function gitOutput(argumentsList) {
  return execFileSync("git", argumentsList, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function indexedContents(filePath) {
  try {
    return gitOutput(["show", `:${filePath}`]);
  } catch {
    return "";
  }
}

function workingTreeContents(filePath) {
  try {
    return readFileSync(path.join(PROJECT_ROOT, filePath), "utf8");
  } catch {
    return "";
  }
}

export function scanPaths(paths, readContents = indexedContents) {
  const findings = [];
  for (const filePath of paths) {
    if (blockedDataPath(filePath)) {
      findings.push({ filePath, reason: "database, runtime data, or backup package" });
      continue;
    }
    const contents = readContents(filePath);
    const lowerPath = filePath.toLowerCase();
    if (
      (lowerPath.endsWith(".json") ||
        lowerPath.endsWith(".csv") ||
        lowerPath.endsWith(".tsv")) &&
      contentLooksLikeChartData(filePath, contents)
    ) {
      findings.push({ filePath, reason: "content resembles organizational chart data" });
      continue;
    }
    const publicReleaseRisk = contentLooksLikePublicReleaseRisk(filePath, contents);
    if (publicReleaseRisk) {
      findings.push({ filePath, reason: publicReleaseRisk });
    }
  }
  return findings;
}

function repositoryPaths(mode) {
  const output =
    mode === "--staged"
      ? gitOutput(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
      : gitOutput(["ls-files", "-z"]);
  return output.split("\0").filter(Boolean);
}

function scanHistory() {
  const objects = gitOutput(["rev-list", "--objects", "--all"]);
  const candidates = [];
  const seen = new Set();
  for (const line of objects.split("\n")) {
    const separator = line.indexOf(" ");
    if (separator < 1) continue;
    const objectId = line.slice(0, separator);
    const filePath = line.slice(separator + 1);
    const key = `${objectId}\0${filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ objectId, filePath });
  }

  const findings = [];
  for (const candidate of candidates) {
    if (blockedDataPath(candidate.filePath)) {
      findings.push({
        filePath: candidate.filePath,
        reason: `database, runtime data, or backup package in Git object ${candidate.objectId.slice(0, 12)}`,
      });
      continue;
    }
    let contents = "";
    try {
      contents = gitOutput(["cat-file", "-p", candidate.objectId]);
    } catch {
      continue;
    }
    const lowerPath = candidate.filePath.toLowerCase();
    if (
      (lowerPath.endsWith(".json") ||
        lowerPath.endsWith(".csv") ||
        lowerPath.endsWith(".tsv")) &&
      contentLooksLikeChartData(candidate.filePath, contents)
    ) {
      findings.push({
        filePath: candidate.filePath,
        reason: `chart-shaped content in Git object ${candidate.objectId.slice(0, 12)}`,
      });
      continue;
    }
    const publicReleaseRisk = contentLooksLikePublicReleaseRisk(
      candidate.filePath,
      contents,
    );
    if (publicReleaseRisk) {
      findings.push({
        filePath: candidate.filePath,
        reason: `${publicReleaseRisk} in Git object ${candidate.objectId.slice(0, 12)}`,
      });
    }
  }
  return findings;
}

function run() {
  const requestedMode = process.argv[2] ?? "--tracked";
  if (!["--history", "--staged", "--tracked"].includes(requestedMode)) {
    console.error(
      "Usage: node scripts/check-no-chart-data.mjs [--history|--staged|--tracked]",
    );
    process.exitCode = 2;
    return;
  }
  const findings =
    requestedMode === "--history"
      ? scanHistory()
      : scanPaths(
          repositoryPaths(requestedMode),
          requestedMode === "--staged" ? indexedContents : workingTreeContents,
        );
  if (findings.length === 0) {
    console.log(
      requestedMode === "--staged"
        ? "Chart data safety check passed for staged files."
        : requestedMode === "--history"
          ? "Chart data safety check passed for reachable Git history."
          : "Chart data safety check passed for tracked files.",
    );
    return;
  }

  console.error(
    "\nBLOCKED: possible chart data or public-release-sensitive content must not enter Git history.\n",
  );
  for (const finding of findings) {
    console.error(`- ${finding.filePath}: ${finding.reason}`);
  }
  console.error(
    "\nMove live data outside the repository. Store recovery copies in the configured backup folder as encrypted .orgchart-backup files.\n",
  );
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) run();
