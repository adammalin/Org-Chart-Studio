import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  configureOrgChartMcp,
  inspectOrgChartMcpConfiguration,
} from "../scripts/configure-orgchart-mcp.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgchart-mcp-config-"));
  const projectRoot = path.join(root, "OrgChart Studio");
  const configPath = path.join(root, ".codex", "config.toml");
  fs.mkdirSync(projectRoot, { recursive: true });
  return {
    root,
    projectRoot,
    configPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("installer-managed MCP configuration preserves existing settings and is idempotent", () => {
  const item = fixture();
  try {
    fs.mkdirSync(path.dirname(item.configPath), { recursive: true });
    fs.writeFileSync(item.configPath, 'model = "gpt-example"\n');

    const installed = configureOrgChartMcp({
      action: "install",
      configPath: item.configPath,
      projectRoot: item.projectRoot,
    });
    const source = fs.readFileSync(item.configPath, "utf8");

    assert.equal(installed.changed, true);
    assert.ok(installed.backupPath && fs.existsSync(installed.backupPath));
    assert.match(source, /model = "gpt-example"/);
    assert.match(source, /\[mcp_servers\.orgchart_studio\]/);
    assert.match(source, /default_tools_approval_mode = "writes"/);
    assert.match(source, /start-orgchart-mcp\.zsh/);
    assert.match(source, /enabled_tools = \["list_charts"/);

    const repeated = configureOrgChartMcp({
      action: "install",
      configPath: item.configPath,
      projectRoot: item.projectRoot,
    });
    assert.equal(repeated.changed, false);
    assert.equal(fs.readFileSync(item.configPath, "utf8"), source);
  } finally {
    item.cleanup();
  }
});

test("packaged desktop MCP registration uses its bundled runtime and current tool set", () => {
  const item = fixture();
  try {
    const executablePath = path.join(item.root, "ORNL OrgChart Studio.exe");
    const runtimePath = path.join(item.root, "user-data", "mcp-runtime.json");
    fs.writeFileSync(executablePath, "synthetic executable placeholder");
    configureOrgChartMcp({
      action: "install",
      configPath: item.configPath,
      projectRoot: item.projectRoot,
      executablePath,
      runtimePath,
      runAsNode: true,
    });
    const source = fs.readFileSync(item.configPath, "utf8");
    const status = inspectOrgChartMcpConfiguration({ configPath: item.configPath });

    assert.equal(status.installed, true);
    assert.equal(status.needsRepair, false);
    assert.ok(source.includes(`command = ${JSON.stringify(executablePath)}`));
    assert.match(source, /mcp[\\/]server\.mjs/);
    assert.match(source, /ELECTRON_RUN_AS_NODE = "1"/);
    assert.match(source, /stage_normalized_import/);
    assert.match(source, /stage_source_recheck/);
    assert.match(source, /extract_chart_sources/);
    assert.ok(source.includes(JSON.stringify(runtimePath)));
    assert.doesNotMatch(source, /start-orgchart-mcp\.zsh/);
  } finally {
    item.cleanup();
  }
});

test("MCP configuration CLI accepts the direct Node runtime used by Windows source installs", () => {
  const item = fixture();
  try {
    const runtimePath = path.join(item.root, "AppData", "mcp-runtime.json");
    const scriptPath = path.join(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      "scripts",
      "configure-orgchart-mcp.mjs",
    );
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "install",
        "--project-root",
        item.projectRoot,
        "--config",
        item.configPath,
        "--executable",
        process.execPath,
        "--runtime-file",
        runtimePath,
      ],
      { encoding: "utf8" },
    );
    const source = fs.readFileSync(item.configPath, "utf8");

    assert.equal(result.status, 0, result.stderr);
    assert.ok(source.includes(`command = ${JSON.stringify(process.execPath)}`));
    assert.ok(source.includes(JSON.stringify(runtimePath)));
    assert.match(source, /mcp[\\/]server\.mjs/);
    assert.doesNotMatch(source, /start-orgchart-mcp\.zsh/);
  } finally {
    item.cleanup();
  }
});

test(
  "MCP configuration CLI still runs when its script path crosses a symlink",
  { skip: process.platform === "win32" },
  () => {
    const item = fixture();
    try {
      const scriptAlias = path.join(item.root, "scripts-alias");
      fs.symlinkSync(path.join(repositoryRoot, "scripts"), scriptAlias, "dir");
      const aliasEntryPoint = path.join(scriptAlias, "configure-orgchart-mcp.mjs");
      const result = spawnSync(
        process.execPath,
        [
          aliasEntryPoint,
          "install",
          "--project-root",
          item.projectRoot,
          "--config",
          item.configPath,
        ],
        { encoding: "utf8" },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /OrgChart Studio MCP registered/);
      assert.equal(fs.existsSync(item.configPath), true);
    } finally {
      item.cleanup();
    }
  },
);

test("MCP configuration removal keeps unrelated Codex configuration", () => {
  const item = fixture();
  try {
    fs.mkdirSync(path.dirname(item.configPath), { recursive: true });
    fs.writeFileSync(item.configPath, 'approval_policy = "on-request"\n');
    configureOrgChartMcp({
      action: "install",
      configPath: item.configPath,
      projectRoot: item.projectRoot,
    });

    const removed = configureOrgChartMcp({
      action: "remove",
      configPath: item.configPath,
      projectRoot: item.projectRoot,
    });
    const source = fs.readFileSync(item.configPath, "utf8");

    assert.equal(removed.changed, true);
    assert.equal(source, 'approval_policy = "on-request"\n');
    assert.doesNotMatch(source, /orgchart_studio/);
  } finally {
    item.cleanup();
  }
});

test("installer refuses to overwrite a manually owned server table", () => {
  const item = fixture();
  try {
    fs.mkdirSync(path.dirname(item.configPath), { recursive: true });
    fs.writeFileSync(
      item.configPath,
      '[mcp_servers.orgchart_studio]\ncommand = "custom-command"\n',
    );

    assert.throws(
      () =>
        configureOrgChartMcp({
          action: "install",
          configPath: item.configPath,
          projectRoot: item.projectRoot,
        }),
      /manually configured/,
    );
  } finally {
    item.cleanup();
  }
});
