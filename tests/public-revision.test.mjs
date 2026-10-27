import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("public bootstrap installs the newest merge revision rather than an earlier PR commit", {
  skip: process.platform !== "win32" && !existsSync("/bin/zsh"),
}, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "orgchart-public-revision-"));
  const newest = "a".repeat(40);
  const earlier = "b".repeat(40);
  const archive = path.join(directory, "source.zip");
  const feed = path.join(directory, "commits.atom");
  const target = path.join(directory, "installed");
  try {
    execFileSync("git", ["archive", "--format=zip", "--prefix=OrgChart-test/", "HEAD", "-o", archive], { cwd: root });
    writeFileSync(feed, `<feed xmlns="http://www.w3.org/2005/Atom">
<id>tag:github.com,2008:/adammalin/Org-Chart-Studio/commits/main</id>
<entry>
  <id>tag:github.com,2008:Grit::Commit/${newest}</id>
</entry>
<entry>
  <id>tag:github.com,2008:Grit::Commit/${earlier}</id>
</entry>
</feed>`);
    if (process.platform === "win32") {
      const quote = (value) => `'${value.replaceAll("'", "''")}'`;
      const harness = path.join(directory, "test.ps1");
      writeFileSync(harness, `
$ErrorActionPreference = "Stop"
function Invoke-WebRequest {
  param($Uri, $Headers, [switch]$UseBasicParsing, $OutFile)
  if ($Uri -eq "https://github.com/adammalin/Org-Chart-Studio/commits/main.atom") {
    return @{ Content = (Get-Content -LiteralPath ${quote(feed)} -Raw) }
  }
  if ($Uri -ne "https://codeload.github.com/adammalin/Org-Chart-Studio/zip/${newest}") {
    throw "The bootstrap requested the wrong revision: $Uri"
  }
  Copy-Item -LiteralPath ${quote(archive)} -Destination $OutFile
}
& ${quote(path.join(root, "scripts/bootstrap-windows-source-test.ps1"))} -TargetDirectory ${quote(target)} -SkipSetup
`);
      execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", harness], {
        env: { ...process.env, ORGCHART_SOURCE_ARCHIVE_URL: "" },
      });
    } else {
      const bin = path.join(directory, "bin");
      mkdirSync(bin);
      writeFileSync(path.join(bin, "curl"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const url = args.at(-1);
const output = args[args.indexOf('--output') + 1];
if (url === 'https://github.com/adammalin/Org-Chart-Studio/commits/main.atom') {
  fs.copyFileSync(${JSON.stringify(feed)}, output);
} else if (url === 'https://codeload.github.com/adammalin/Org-Chart-Studio/zip/${newest}') {
  fs.copyFileSync(${JSON.stringify(archive)}, output);
} else { throw Error('Incorrect public download: ' + url); }
`, { mode: 0o755 });
      execFileSync("/bin/zsh", [path.join(root, "scripts/bootstrap-mac-source-test.zsh"), target], {
        env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, ORGCHART_SOURCE_ARCHIVE_URL: "", ORGCHART_BOOTSTRAP_SKIP_SETUP: "1" },
      });
    }
    const record = readFileSync(path.join(target, "INSTALL-REVISION.txt"), "utf8");
    assert.ok(record.includes(`Installed commit: ${newest}`));
    assert.ok(!record.includes(earlier));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
