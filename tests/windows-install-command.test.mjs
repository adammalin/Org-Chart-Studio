import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);

test("one-paste Windows command installs and repairs from cmd.exe and PowerShell", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "orgchart-installer-"));
  const source = path.join(directory, "source with spaces & an apostrophe's");
  const archive = path.join(directory, "source.zip");
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const installer = await readFile(new URL("scripts/install-windows.ps1", root));
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end(installer);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await mkdir(path.join(source, "scripts"), { recursive: true });
    await writeFile(path.join(source, "package.json"), '{"name":"ornl-orgchart-studio"}\n');
    await writeFile(path.join(source, "Start-OrgChart-Studio.cmd"), "@echo off\r\nexit /b 0\r\n");
    await writeFile(path.join(source, "scripts", "create-windows-shortcuts.ps1"),
      await readFile(new URL("scripts/create-windows-shortcuts.ps1", root)));
    await writeFile(path.join(source, "scripts", "setup-windows-source-test.ps1"), `
$ErrorActionPreference = "Stop"
if ($env:ORGCHART_SETUP_STAGE_ONLY -ne "1") { throw "Setup must finish before app launch." }
& (Join-Path $PSScriptRoot "create-windows-shortcuts.ps1")
Set-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) "setup-complete.txt") -Value "verified"
`);
    await run("powershell.exe", ["-NoProfile", "-Command",
      `Compress-Archive -LiteralPath ${quote(source)} -DestinationPath ${quote(archive)}`]);
    const originalCommand = (await readFile(new URL("scripts/install-windows-command.txt", root), "utf8")).trim();
    const command = originalCommand.replace(
      "https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/main/scripts/install-windows.ps1",
      `http://127.0.0.1:${server.address().port}/install-windows.ps1`,
    );
    const bootstrap = new URL("scripts/bootstrap-windows-source-test.ps1", root);
    const { fileURLToPath } = await import("node:url");
    for (const shell of ["cmd", "powershell"]) {
      const target = path.join(directory, `${shell} installed app's & shortcuts`);
      const env = {
        ...process.env,
        ORGCHART_INSTALL_BOOTSTRAP_PATH: fileURLToPath(bootstrap),
        ORGCHART_INSTALL_TARGET_DIRECTORY: target,
        ORGCHART_SOURCE_ARCHIVE_URL: archive,
        ORGCHART_SOURCE_REVISION: "1234567890123456789012345678901234567890",
        ORGCHART_SETUP_STAGE_ONLY: "1",
        ORGCHART_BOOTSTRAP_SKIP_SETUP: "0",
        ORGCHART_INSTALL_NO_PAUSE: "1",
      };
      const invoke = () => shell === "cmd"
        ? run("cmd.exe", ["/d", "/s", "/c", command], { env, windowsVerbatimArguments: true })
        : run("powershell.exe", ["-NoProfile", "-Command", command], { env });
      const first = await invoke();
      assert.match(first.stdout, /OrgChart Studio is ready/);
      assert.equal((await readFile(path.join(target, "setup-complete.txt"), "utf8")).trim(), "verified");
      await mkdir(path.join(target, "output"), { recursive: true });
      await writeFile(path.join(target, "output", "preserved.txt"), "keep");
      await writeFile(path.join(target, "obsolete.txt"), "remove");
      await invoke();
      assert.equal(await readFile(path.join(target, "output", "preserved.txt"), "utf8"), "keep");
      await assert.rejects(readFile(path.join(target, "obsolete.txt")), { code: "ENOENT" });
      const shortcut = await run("powershell.exe", ["-NoProfile", "-Command", `
$shell = New-Object -ComObject WScript.Shell
$files = New-Object -ComObject Scripting.FileSystemObject
$expected = $files.GetFile(${quote(path.join(target, "Start-OrgChart-Studio.cmd"))}).ShortPath
foreach ($folder in @("Programs", "DesktopDirectory")) {
  $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath($folder)) "OrgChart Studio.lnk"))
  # Windows expands short profile paths such as RUNNER~1 when saving shortcuts.
  if ($files.GetFile($link.TargetPath).ShortPath -ne $expected) { throw "Incorrect shortcut target." }
}
Write-Output "Shortcuts verified"
`]);
      assert.match(shortcut.stdout, /Shortcuts verified/);
      // An invalid archive must stop with a diagnostic log and a nonzero exit.
      await writeFile(path.join(directory, "invalid.zip"), "invalid archive");
      env.ORGCHART_SOURCE_ARCHIVE_URL = path.join(directory, "invalid.zip");
      await assert.rejects(invoke(), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /could not finish installing/);
        assert.match(error.stdout, /setup-.*\.log/);
        assert.doesNotMatch(error.stdout, /OrgChart Studio is ready/);
        return true;
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
