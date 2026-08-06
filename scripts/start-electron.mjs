import { spawn } from "node:child_process";
import electronPath from "electron";

const smokeTest = process.argv.includes("--smoke");
const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ORGCHART_NODE_BIN: process.execPath,
    ...(smokeTest ? { ORGCHART_ELECTRON_SMOKE: "1" } : {}),
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
