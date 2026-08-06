#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BEGIN_MARKER = "# BEGIN ORGCHART STUDIO MCP - managed by installer";
const END_MARKER = "# END ORGCHART STUDIO MCP - managed by installer";
const SERVER_TABLE = "[mcp_servers.orgchart_studio]";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, "..");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function defaultRuntimeFile() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "ORNL OrgChart Studio",
      "mcp-runtime.json",
    );
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(
      process.env.APPDATA,
      "ORNL OrgChart Studio",
      "mcp-runtime.json",
    );
  }
  return path.join(os.homedir(), ".orgchart-studio", "mcp-runtime.json");
}

function managedBlock({ projectRoot, executablePath, runtimePath, runAsNode }) {
  const launcher = path.join(projectRoot, "scripts", "start-orgchart-mcp.zsh");
  const mcpServer = path.join(projectRoot, "mcp", "server.mjs");
  const runtimeFile = runtimePath ?? defaultRuntimeFile();
  const enabledTools = [
    "list_charts",
    "get_chart",
    "validate_chart",
    "list_chart_versions",
    "validate_normalized_import",
    "list_import_intakes",
    "extract_import_intake",
    "extract_chart_sources",
    "create_chart_draft",
    "import_normalized_chart",
    "stage_normalized_import",
    "replace_chart_draft",
    "stage_source_recheck",
    "save_chart_version",
  ];
  const command = executablePath ?? "/bin/zsh";
  const args = executablePath ? [mcpServer] : [launcher];
  const environment = [
    `ORGCHART_MCP_RUNTIME_FILE = ${tomlString(runtimeFile)}`,
    ...(runAsNode ? ['ELECTRON_RUN_AS_NODE = "1"'] : []),
  ];
  return [
    BEGIN_MARKER,
    SERVER_TABLE,
    `command = ${tomlString(command)}`,
    `args = [${args.map(tomlString).join(", ")}]`,
    `cwd = ${tomlString(projectRoot)}`,
    "enabled = true",
    "required = false",
    "default_tools_approval_mode = \"writes\"",
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 60",
    `enabled_tools = [${enabledTools.map(tomlString).join(", ")}]`,
    "",
    '[mcp_servers.orgchart_studio.env]',
    ...environment,
    END_MARKER,
  ].join("\n");
}

function removeManagedBlock(source) {
  const start = source.indexOf(BEGIN_MARKER);
  if (start < 0) return { source, found: false };
  const endStart = source.indexOf(END_MARKER, start);
  if (endStart < 0) {
    throw new Error("The existing OrgChart Studio MCP configuration marker is incomplete.");
  }
  const end = endStart + END_MARKER.length;
  const before = source.slice(0, start).replace(/[ \t]+$/gm, "").trimEnd();
  const after = source.slice(end).trimStart();
  return {
    source: [before, after].filter(Boolean).join("\n\n") + (before || after ? "\n" : ""),
    found: true,
  };
}

export function inspectOrgChartMcpConfiguration({ configPath }) {
  const resolvedConfig = path.resolve(configPath);
  const source = fs.existsSync(resolvedConfig)
    ? fs.readFileSync(resolvedConfig, "utf8")
    : "";
  const hasStart = source.includes(BEGIN_MARKER);
  const hasEnd = source.includes(END_MARKER);
  return {
    configPath: resolvedConfig,
    installed: hasStart && hasEnd,
    needsRepair: hasStart !== hasEnd,
  };
}

function backupPath(configPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${configPath}.backup-${timestamp}`;
  let candidate = base;
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function atomicWrite(target, contents) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Some Windows filesystems do not implement POSIX modes.
  }
}

export function configureOrgChartMcp({
  action = "install",
  configPath,
  projectRoot,
  executablePath,
  runtimePath,
  runAsNode = false,
}) {
  const resolvedConfig = path.resolve(configPath);
  const resolvedProject = path.resolve(projectRoot);
  const original = fs.existsSync(resolvedConfig)
    ? fs.readFileSync(resolvedConfig, "utf8")
    : "";
  const withoutManaged = removeManagedBlock(original);

  if (
    action === "install" &&
    !withoutManaged.found &&
    original.includes(SERVER_TABLE)
  ) {
    throw new Error(
      "A manually configured orgchart_studio MCP server already exists. Remove or rename that table before using the installer-managed integration.",
    );
  }

  const next =
    action === "remove"
      ? withoutManaged.source
      : `${withoutManaged.source.trimEnd()}${withoutManaged.source.trim() ? "\n\n" : ""}${managedBlock({
          projectRoot: resolvedProject,
          executablePath: executablePath ? path.resolve(executablePath) : undefined,
          runtimePath: runtimePath ? path.resolve(runtimePath) : undefined,
          runAsNode,
        })}\n`;
  if (next === original) {
    return { changed: false, configPath: resolvedConfig, backupPath: null };
  }

  let savedBackup = null;
  if (original) {
    savedBackup = backupPath(resolvedConfig);
    fs.copyFileSync(resolvedConfig, savedBackup, fs.constants.COPYFILE_EXCL);
    try {
      fs.chmodSync(savedBackup, 0o600);
    } catch {
      // Some Windows filesystems do not implement POSIX modes.
    }
  }
  atomicWrite(resolvedConfig, next);
  return {
    changed: true,
    configPath: resolvedConfig,
    backupPath: savedBackup,
  };
}

async function main() {
  const action = process.argv[2] === "remove" ? "remove" : "install";
  const projectRoot = argumentValue("--project-root") ?? defaultProjectRoot;
  const executablePath = argumentValue("--executable");
  const runtimePath = argumentValue("--runtime-file");
  const runAsNode = process.argv.includes("--electron-run-as-node");
  const configPath =
    argumentValue("--config") ??
    path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml");
  const result = configureOrgChartMcp({
    action,
    configPath,
    projectRoot,
    executablePath,
    runtimePath,
    runAsNode,
  });
  const verb = action === "remove" ? "removed from" : "registered in";
  process.stdout.write(
    result.changed
      ? `OrgChart Studio MCP ${verb} ${result.configPath}.\n${
          result.backupPath ? `Previous configuration backup: ${result.backupPath}\n` : ""
        }`
      : `OrgChart Studio MCP configuration already matches ${result.configPath}.\n`,
  );
}

function isCommandLineEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(fileURLToPath(import.meta.url)) ===
      fs.realpathSync(process.argv[1])
    );
  } catch {
    return import.meta.url === new URL(process.argv[1], "file:").href;
  }
}

if (isCommandLineEntryPoint()) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "MCP configuration failed."}\n`,
    );
    process.exitCode = 1;
  });
}
