#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const supportedCommands = new Set(["build", "dev", "start"]);
const command = process.argv[2];

if (!supportedCommands.has(command)) {
  console.error("Usage: node scripts/run-vinext.mjs <build|dev|start>");
  process.exit(2);
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const vinextCli = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const result = spawnSync(process.execPath, [vinextCli, command], {
  cwd: projectRoot,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH:
      process.env.WRANGLER_LOG_PATH ?? path.join(projectRoot, ".wrangler", "wrangler.log"),
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Could not start vinext: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
