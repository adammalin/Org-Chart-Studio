import fs from "node:fs";
import path from "node:path";

const appRoot = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!appRoot || !fs.existsSync(appRoot)) {
  throw new Error("Usage: node scripts/verify-packaged-app.mjs <packaged-resources-app-path>");
}

const requiredPaths = [
  "dist/server/index.js",
  "dist/server/wrangler.json",
  "dist/client",
  "electron/main.cjs",
  "electron/preload.cjs",
  "mcp/server.mjs",
  "scripts/configure-orgchart-mcp.mjs",
  "scripts/run-packaged-wrangler.cjs",
  "migrations",
  "node_modules/wrangler/wrangler-dist/cli.js",
  "node_modules/@modelcontextprotocol/sdk",
];
const forbiddenPaths = [
  ".git",
  ".github",
  ".githooks",
  ".openai",
  ".wrangler",
  "app",
  "backups",
  "chart-data",
  "db",
  "docs",
  "examples",
  "lib",
  "local-worker-data",
  "orgchart-data",
  "output",
  "packaging",
  "release-notes",
  "releases",
  "tests",
  "tmp",
  "types",
  "work",
];

for (const required of requiredPaths) {
  if (!fs.existsSync(path.join(appRoot, required))) {
    throw new Error(`Packaged app is missing required runtime content: ${required}`);
  }
}
for (const forbidden of forbiddenPaths) {
  if (fs.existsSync(path.join(appRoot, forbidden))) {
    throw new Error(`Packaged app contains source-only or private-data content: ${forbidden}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
if (
  packageJson.productName !== "ORNL OrgChart Studio" ||
  packageJson.main !== "electron/main.cjs"
) {
  throw new Error("Packaged application identity or entry point is incorrect.");
}

console.log(`Packaged application contents verified: ${appRoot}`);
