import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_PRIVATE_BACKUP_BYTES = 100 * 1024 * 1024;

function validateBackup(backup, chartId) {
  if (
    backup?.format !== "orgchart-studio-library-backup" ||
    ![1, 2, 3, 4].includes(backup?.schemaVersion) ||
    backup?.scope !== "selected" ||
    backup?.chartCount !== 1 ||
    !Array.isArray(backup?.charts) ||
    backup.charts.length !== 1 ||
    backup.charts[0]?.id !== chartId ||
    !Array.isArray(backup?.sourceFiles)
  ) {
    throw new Error("OrgChart Studio returned an invalid selected-chart backup.");
  }
}

function ensurePrivateDirectory(directory) {
  if (fs.existsSync(directory)) {
    const stats = fs.lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("The private source-recheck backup location is unsafe.");
    }
  } else {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  if (process.platform !== "win32") fs.chmodSync(directory, 0o700);
}

export function writePrivateSourceRecheckBackup({ backup, runtimePath, chartId }) {
  validateBackup(backup, chartId);
  const serialized = `${JSON.stringify(backup)}\n`;
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength < 2 || byteLength > MAX_PRIVATE_BACKUP_BYTES) {
    throw new Error("The private source-recheck backup is empty or exceeds 100 MB.");
  }

  const directory = path.join(path.dirname(runtimePath), "source-recheck-backups");
  ensurePrivateDirectory(directory);
  const safeChartId = chartId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `orgchart-studio-pre-source-recheck-${safeChartId}-${stamp}.orgchart-backup`;
  const target = path.join(directory, fileName);
  const temporary = path.join(directory, `.${fileName}.tmp-${process.pid}`);
  fs.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
  fs.renameSync(temporary, target);
  if (process.platform !== "win32") fs.chmodSync(target, 0o600);
  return {
    path: target,
    fileName,
    bytes: byteLength,
    sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
    protection: "private-local-unencrypted",
  };
}
