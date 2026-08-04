import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapPath = path.join(
  projectRoot,
  "scripts",
  "bootstrap-mac-source-test.zsh",
);

test("macOS bootstrap uses public-only downloads and records provenance", () => {
  const source = readFileSync(bootstrapPath, "utf8");

  assert.match(
    source,
    /api\.github\.com\/repos\/\$\{SOURCE_REPOSITORY\}\/commits\/\$\{SOURCE_REF\}/,
  );
  assert.match(
    source,
    /github\.com\/\$\{SOURCE_REPOSITORY\}\/archive\/\$\{RESOLVED_SOURCE_REVISION\}\.zip/,
  );
  assert.match(source, /INSTALL-REVISION\.txt/);
  assert.match(source, /Archive SHA-256:/);
  assert.match(source, /adammalin\/Org-Chart-Studio/);
  assert.doesNotMatch(source, /\bgh\b/);
});

test("macOS bootstrap preserves local output and moves the bundled guide into docs", () => {
  const source = readFileSync(bootstrapPath, "utf8");

  assert.match(source, /--exclude "\/output\/"/);
  assert.doesNotMatch(source, /--exclude "\/docs\/"/);
  assert.match(
    source,
    /LEGACY_QUICK_START_PATH="\$\{TARGET_DIRECTORY\}\/output\/pdf\/ORNL-OrgChart-Studio-macOS-Quick-Start\.pdf"/,
  );
  assert.equal(
    existsSync(
      path.join(projectRoot, "docs", "ORNL-OrgChart-Studio-macOS-Quick-Start.pdf"),
    ),
    true,
  );
});

test("macOS source-test shell entry points pass zsh syntax checking", () => {
  const scripts = [
    "bootstrap-mac-source-test.zsh",
    "setup-mac-source-test.zsh",
    "start-mac-source-test.zsh",
    "start-orgchart-mcp.zsh",
  ];

  for (const script of scripts) {
    const scriptPath = path.join(projectRoot, "scripts", script);
    const result = spawnSync("zsh", ["-n", scriptPath], {
      encoding: "utf8",
    });
    assert.equal(
      result.status,
      0,
      `${script} failed syntax checking:\n${result.stderr}`,
    );
  }
});

test("macOS setup offers an optional least-privilege local MCP registration", () => {
  const setupSource = readFileSync(
    path.join(projectRoot, "scripts", "setup-mac-source-test.zsh"),
    "utf8",
  );
  const packageJson = readFileSync(path.join(projectRoot, "package.json"), "utf8");

  assert.match(setupSource, /Optional ChatGPT Desktop \/ Codex integration/);
  assert.match(setupSource, /type y and press Return/);
  assert.match(setupSource, /Install the local MCP integration\? \[y\/N\]/);
  assert.match(setupSource, /y\|yes\) MCP_SETUP_CHOICE="install"/);
  assert.match(setupSource, /Chart fields read through MCP enter that AI conversation/);
  assert.match(setupSource, /not saved until you apply it in the app/);
  assert.doesNotMatch(setupSource, /Install the local MCP integration\? \[Y\/n\]/);
  assert.match(setupSource, /configure-orgchart-mcp\.mjs/);
  assert.match(setupSource, /ORGCHART_SETUP_MCP/);
  assert.match(packageJson, /"mcp:start"/);
  assert.match(packageJson, /"mcp:configure"/);
  assert.match(packageJson, /"mcp:remove"/);
});
