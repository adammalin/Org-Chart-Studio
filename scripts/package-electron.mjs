import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const target = process.argv[2];
const targetConfig =
  target === "mac"
    ? {
        platform: "darwin",
        arch: "arm64",
        assets: [
          { extension: ".dmg", output: `OrgChart-Studio-Mac-arm64-v${packageJson.version}.dmg` },
          { extension: ".zip", output: `OrgChart-Studio-Mac-arm64-v${packageJson.version}.zip` },
        ],
      }
    : target === "windows"
      ? {
          platform: "win32",
          arch: "x64",
          assets: [
            {
              extension: ".exe",
              nameIncludes: "Setup",
              output: `OrgChart-Studio-Windows-x64-Setup-v${packageJson.version}.exe`,
            },
          ],
        }
      : null;

if (!targetConfig) throw new Error("Usage: node scripts/package-electron.mjs <mac|windows>");

const forgeCli = path.join(
  projectRoot,
  "node_modules",
  "@electron-forge",
  "cli",
  "dist",
  "electron-forge.js",
);
const result = spawnSync(
  process.execPath,
  [forgeCli, "make", "--platform", targetConfig.platform, "--arch", targetConfig.arch],
  { cwd: projectRoot, env: process.env, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);

const makeRoot = path.join(projectRoot, "out", "make");
const releaseRoot = path.join(projectRoot, "releases");
mkdirSync(releaseRoot, { recursive: true });
const allFiles = collectFiles(makeRoot);

for (const asset of targetConfig.assets) {
  const candidates = allFiles.filter((filePath) => {
    const name = path.basename(filePath);
    return (
      name.toLowerCase().endsWith(asset.extension) &&
      (!asset.nameIncludes || name.includes(asset.nameIncludes))
    );
  });
  const versionMatches = candidates.filter((filePath) =>
    path.basename(filePath).includes(packageJson.version),
  );
  const matches = versionMatches.length === 1 ? versionMatches : candidates;
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${asset.extension} artifact, found ${matches.length}:\n${matches.join("\n")}`,
    );
  }
  const destination = path.join(releaseRoot, asset.output);
  if (existsSync(destination)) {
    throw new Error(`Release artifact already exists. Move it aside first: ${destination}`);
  }
  copyFileSync(matches[0], destination);
  const digest = createHash("sha256").update(readFileSync(destination)).digest("hex");
  writeFileSync(`${destination}.sha256`, `${digest}  ${asset.output}\n`);
  console.log(`Created ${destination}`);
}

function collectFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const candidate = path.join(root, entry);
    if (statSync(candidate).isDirectory()) files.push(...collectFiles(candidate));
    else files.push(candidate);
  }
  return files;
}
