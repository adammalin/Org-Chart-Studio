import { spawn, spawnSync } from "node:child_process";
import electronPath from "electron";

const smokeTest = process.argv.includes("--smoke");
const superviseWindowsSmoke = smokeTest && process.platform === "win32";
const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ORGCHART_NODE_BIN: process.execPath,
    ...(smokeTest ? { ORGCHART_ELECTRON_SMOKE: "1" } : {}),
  },
  stdio: superviseWindowsSmoke ? ["ignore", "pipe", "pipe"] : "inherit",
});

let smokeOutput = "";
let supervisedExitStarted = false;

if (superviseWindowsSmoke) {
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    smokeOutput = `${smokeOutput}${chunk}`.slice(-64_000);
    const match = smokeOutput.match(/ORGCHART_ELECTRON_SMOKE (\{[^\r\n]+\})/);
    if (!match || supervisedExitStarted) return;
    supervisedExitStarted = true;
    let passed = false;
    try {
      passed = JSON.parse(match[1]).passed === true;
    } catch {
      passed = false;
    }
    setTimeout(() => {
      if (child.pid) {
        spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
          timeout: 5_000,
        });
      }
      process.exit(passed ? 0 : 1);
    }, 500);
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("exit", (code, signal) => {
  if (supervisedExitStarted) return;
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
