import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

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
    /github\.com\/\$\{SOURCE_REPOSITORY\}\/commit\/\$\{SOURCE_REF\}\.patch/,
  );
  assert.match(
    source,
    /codeload\.github\.com\/\$\{SOURCE_REPOSITORY\}\/zip\/\$\{RESOLVED_SOURCE_REVISION\}/,
  );
  assert.match(source, /INSTALL-REVISION\.txt/);
  assert.match(source, /Archive SHA-256:/);
  assert.match(source, /--user-agent "ORNL-OrgChart-Studio-Installer"/);
  assert.match(source, /adammalin\/Org-Chart-Studio/);
  assert.doesNotMatch(source, /api\.github\.com/);
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

test("macOS source-test shell entry points pass zsh syntax checking", (context) => {
  const zshVersion = spawnSync("zsh", ["--version"], { encoding: "utf8" });
  if (zshVersion.error?.code === "ENOENT") {
    context.skip("zsh is unavailable on this host; the macOS CI job exercises these scripts.");
    return;
  }

  const scripts = [
    "../Start-OrgChart-Studio.command",
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
  assert.match(setupSource, /ORGCHART_FORCE_PORTABLE_NODE/);
  assert.match(setupSource, /MCP_ALREADY_MANAGED=0/);
  assert.match(setupSource, /Existing local MCP integration was left unchanged/);
  assert.match(packageJson, /"mcp:start"/);
  assert.match(packageJson, /"mcp:configure"/);
  assert.match(packageJson, /"mcp:remove"/);
});

test("Windows command-line installer matches the macOS safety and setup flow", () => {
  const bootstrapSource = readFileSync(
    path.join(projectRoot, "scripts", "bootstrap-windows-source-test.ps1"),
    "utf8",
  );
  const setupSource = readFileSync(
    path.join(projectRoot, "scripts", "setup-windows-source-test.ps1"),
    "utf8",
  );
  const startSource = readFileSync(
    path.join(projectRoot, "scripts", "start-windows-source-test.ps1"),
    "utf8",
  );
  const mcpStartSource = readFileSync(
    path.join(projectRoot, "scripts", "start-orgchart-mcp.ps1"),
    "utf8",
  );
  const commandLauncher = readFileSync(
    path.join(projectRoot, "Start-OrgChart-Studio.cmd"),
    "utf8",
  );
  const electronStartSource = readFileSync(
    path.join(projectRoot, "scripts", "start-electron.mjs"),
    "utf8",
  );
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

  assert.match(bootstrapSource, /github\.com\/\$SourceRepository\/commit\/\$SourceRef\.patch/);
  assert.match(bootstrapSource, /codeload\.github\.com\/\$SourceRepository\/zip\/\$ResolvedSourceRevision/);
  assert.doesNotMatch(bootstrapSource, /api\.github\.com/);
  assert.match(bootstrapSource, /Get-FileHash[^\n]+SHA256/);
  assert.match(bootstrapSource, /INSTALL-REVISION\.txt/);
  assert.match(bootstrapSource, /Platform: Windows/);
  assert.match(bootstrapSource, /robocopy\.exe/);
  assert.match(bootstrapSource, /\$global:LASTEXITCODE = 0/);
  assert.match(bootstrapSource, /"\.runtime"/);
  assert.match(bootstrapSource, /"node_modules"/);
  assert.doesNotMatch(bootstrapSource, /git clone|\bgh\b/i);

  assert.match(setupSource, /node-v\$PinnedNodeVersion-win-\$nodeArchitecture\.zip/);
  assert.match(setupSource, /SHASUMS256\.txt/);
  assert.match(setupSource, /Get-FileHash[^\n]+SHA256/);
  assert.match(setupSource, /ci --no-audit --no-fund/);
  assert.match(setupSource, /run build/);
  assert.match(setupSource, /run desktop:smoke/);
  assert.match(setupSource, /ORGCHART_FORCE_PORTABLE_NODE/);
  assert.match(setupSource, /\$McpAlreadyManaged/);
  assert.match(setupSource, /Existing local MCP integration was left unchanged/);
  assert.match(setupSource, /Install the local MCP integration\? \[y\/N\]/);
  assert.match(setupSource, /--executable \$NodeExecutable/);
  assert.match(setupSource, /--runtime-file \$McpRuntimePath/);
  assert.doesNotMatch(setupSource, /Set-ExecutionPolicy/);

  assert.match(startSource, /node-command\.txt/);
  assert.match(startSource, /npm-command\.txt/);
  assert.match(startSource, /run desktop/);
  assert.match(mcpStartSource, /ORGCHART_MCP_RUNTIME_FILE/);
  assert.match(commandLauncher, /start-windows-source-test\.ps1/i);
  assert.match(commandLauncher, /Repeat the command-line installation to repair it/i);
  assert.match(commandLauncher, /ORGCHART_EXIT_CODE/);
  assert.match(electronStartSource, /superviseWindowsSmoke/);
  assert.match(electronStartSource, /taskkill\.exe/);
  assert.match(electronStartSource, /ORGCHART_ELECTRON_SMOKE/);
  assert.equal(packageJson.scripts.build, "node scripts/run-vinext.mjs build");
  assert.equal(packageJson.scripts.dev, "node scripts/run-vinext.mjs dev");
  assert.equal(packageJson.scripts.start, "node scripts/run-vinext.mjs start");
  assert.equal(packageJson.scripts["desktop:smoke"], "node scripts/start-electron.mjs --smoke");
});

test("everyday CI runs complete command-line install and update checks on Mac and Windows", () => {
  const workflowSource = readFileSync(
    path.join(projectRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );

  assert.match(workflowSource, /Command-line install - \$\{\{ matrix\.name \}\}/);
  assert.match(workflowSource, /os: macos-15/);
  assert.match(workflowSource, /os: windows-latest/);
  assert.match(workflowSource, /bootstrap-mac-source-test\.zsh/);
  assert.match(workflowSource, /bootstrap-windows-source-test\.ps1/);
  assert.match(workflowSource, /setup-mac-source-test\.zsh/);
  assert.match(workflowSource, /setup-windows-source-test\.ps1/);
  assert.match(workflowSource, /obsolete-update-test\.txt/);
  assert.match(workflowSource, /ORGCHART_SETUP_STAGE_ONLY/);
  assert.equal((workflowSource.match(/ORGCHART_FORCE_PORTABLE_NODE/g) ?? []).length, 2);
  assert.equal((workflowSource.match(/Exercise public no-auth/g) ?? []).length, 2);
  assert.match(workflowSource, /GITHUB_TOKEN: ""/);
  assert.match(workflowSource, /Parser\]::ParseFile/);
  assert.match(workflowSource, /Windows PowerShell scripts did not parse/);
  assert.match(workflowSource, /Start-OrgChart-Studio\.command/);
  assert.match(workflowSource, /Start-OrgChart-Studio\.cmd/);
  assert.equal((workflowSource.match(/ORGCHART_ELECTRON_SMOKE/g) ?? []).length, 2);
});

test("bundled quick-start has a second page for the reviewed local AI workflow", async () => {
  const guidePath = path.join(
    projectRoot,
    "docs",
    "ORNL-OrgChart-Studio-macOS-Quick-Start.pdf",
  );
  const generatorSource = readFileSync(
    path.join(projectRoot, "scripts", "create_mac_quick_start_pdf.py"),
    "utf8",
  );
  const guide = await PDFDocument.load(readFileSync(guidePath));

  assert.equal(guide.getPageCount(), 2);
  assert.match(generatorSource, /Use the orgchart_studio MCP server/);
  assert.match(generatorSource, /AI stages edits and imports\. You decide\. The app remains the source of truth\./);
  assert.match(generatorSource, /Stage a reviewed import or source recheck/);
  assert.match(generatorSource, /Source extraction is off by default/);
  assert.match(generatorSource, /Return raw source files or passphrases/);
  assert.match(generatorSource, /Bypass review for chart replacement/);
  assert.match(generatorSource, /not ChatGPT web/);
});

test("desktop guide covers both command-line installs, updates, storage, and optional AI setup", async () => {
  const guidePath = path.join(
    projectRoot,
    "docs",
    "ORNL-OrgChart-Studio-Desktop-Quick-Start.pdf",
  );
  const generatorSource = readFileSync(
    path.join(projectRoot, "scripts", "create_desktop_quick_start_pdf.py"),
    "utf8",
  );
  const guide = await PDFDocument.load(readFileSync(guidePath));

  assert.equal(guide.getPageCount(), 3);
  assert.match(generatorSource, /No signed installer required/);
  assert.match(generatorSource, /Mac - paste all five lines into Terminal/);
  assert.match(generatorSource, /Windows - paste all six lines into PowerShell/);
  assert.match(generatorSource, /Repeat the same installation commands from page 1/i);
  assert.match(generatorSource, /Install the local MCP integration\? \[y\/N\]/);
  assert.match(generatorSource, /Install local AI integration/);
  assert.match(generatorSource, /OneDrive or Dropbox/);
  assert.match(generatorSource, /Retained-source extraction starts off/);
});

test("unsigned native packaging stays manual while retaining per-platform smoke checks", () => {
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const forgeSource = readFileSync(path.join(projectRoot, "forge.config.js"), "utf8");
  const workflowSource = readFileSync(
    path.join(projectRoot, ".github", "workflows", "build-installers.yml"),
    "utf8",
  );

  assert.equal(packageJson.scripts["package:mac"].includes("package-electron.mjs mac"), true);
  assert.equal(packageJson.scripts["package:windows"].includes("package-electron.mjs windows"), true);
  assert.equal(packageJson.dependencies.wrangler, "4.118.0");
  assert.match(forgeSource, /appBundleId: "gov\.ornl\.orgchart-studio"/);
  assert.match(forgeSource, /@electron-forge\/maker-dmg/);
  assert.match(forgeSource, /@electron-forge\/maker-squirrel/);
  assert.match(forgeSource, /asar: false/);
  assert.match(workflowSource, /runs-on: macos-15/);
  assert.match(workflowSource, /runs-on: windows-latest/);
  assert.match(workflowSource, /ORGCHART_ELECTRON_SMOKE/);
  assert.match(workflowSource, /shasum -a 256 -c/);
  assert.match(workflowSource, /Get-FileHash -Algorithm SHA256/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.doesNotMatch(workflowSource, /push:\s*\n\s*tags:|gh release create/);
});
