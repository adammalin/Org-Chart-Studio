import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { configureOrgChartMcp } from "../scripts/configure-orgchart-mcp.mjs";

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
