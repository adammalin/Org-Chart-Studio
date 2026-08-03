import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("macOS bootstrap preserves local output but refreshes the bundled guide", () => {
  const source = readFileSync(bootstrapPath, "utf8");

  assert.match(source, /--exclude "\/output\/"/);
  assert.match(
    source,
    /QUICK_START_RELATIVE_PATH="output\/pdf\/ORNL-OrgChart-Studio-macOS-Quick-Start\.pdf"/,
  );
  assert.match(
    source,
    /"\$\{EXPANDED_DIRECTORY\}\/\$\{QUICK_START_RELATIVE_PATH\}"/,
  );
  assert.match(
    source,
    /"\$\{TARGET_DIRECTORY\}\/\$\{QUICK_START_RELATIVE_PATH\}"/,
  );
});

test("macOS source-test shell entry points pass zsh syntax checking", () => {
  const scripts = [
    "bootstrap-mac-source-test.zsh",
    "setup-mac-source-test.zsh",
    "start-mac-source-test.zsh",
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
