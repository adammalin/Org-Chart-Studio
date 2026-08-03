/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG_FILE_NAME = "storage-locations.json";
const DEFAULT_DATA_FOLDER_NAME = "local-worker-data";
const MAX_ENCRYPTED_BACKUP_BYTES = 100 * 1024 * 1024;

function normalized(value) {
  const absolute = path.resolve(value);
  const resolved = fs.existsSync(absolute) ? fs.realpathSync.native(absolute) : absolute;
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(parentPath, candidatePath) {
  const parent = normalized(parentPath);
  const candidate = normalized(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathsOverlap(firstPath, secondPath) {
  return isPathInside(firstPath, secondPath) || isPathInside(secondPath, firstPath);
}

function samePath(firstPath, secondPath) {
  return normalized(firstPath) === normalized(secondPath);
}

function isCloudSyncedPath(candidatePath) {
  const parts = normalized(candidatePath)
    .split(path.sep)
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  return parts.some(
    (part) =>
      part === "cloudstorage" ||
      part === "mobile documents" ||
      part === "icloud drive" ||
      part === "dropbox" ||
      part.startsWith("dropbox ") ||
      part === "onedrive" ||
      part.startsWith("onedrive-") ||
      part.startsWith("onedrive "),
  );
}

function configPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

function defaultDataDirectory(userDataPath) {
  return path.join(userDataPath, DEFAULT_DATA_FOLDER_NAME);
}

function emptyConfig() {
  return {
    version: 1,
    dataDirectory: null,
    backupDirectory: null,
    pendingDataDirectory: null,
    lastMigration: null,
  };
}

function readStorageConfig(userDataPath) {
  const target = configPath(userDataPath);
  if (!fs.existsSync(target)) return emptyConfig();
  let value;
  try {
    value = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`Storage settings could not be read: ${error.message}`);
  }
  if (!value || value.version !== 1) {
    throw new Error("Storage settings use an unsupported format.");
  }
  return {
    ...emptyConfig(),
    ...value,
  };
}

function writeStorageConfig(userDataPath, value) {
  fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
  const target = configPath(userDataPath);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Some Windows filesystems do not implement POSIX modes.
  }
}

function assertDirectoryExists(candidatePath, label) {
  if (!candidatePath || typeof candidatePath !== "string") {
    throw new Error(`${label} was not selected.`);
  }
  const resolved = fs.realpathSync(candidatePath);
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label} must be a folder.`);
  }
  return resolved;
}

function assertOutsideProject(candidatePath, projectRoot) {
  if (pathsOverlap(projectRoot, candidatePath)) {
    throw new Error("Choose a folder outside the OrgChart Studio source repository.");
  }
}

function activeDataDirectory(userDataPath, config) {
  return config.dataDirectory
    ? path.resolve(config.dataDirectory)
    : defaultDataDirectory(userDataPath);
}

function storageSettingsSnapshot({ userDataPath, projectRoot }) {
  const config = readStorageConfig(userDataPath);
  const dataDirectory = activeDataDirectory(userDataPath, config);
  const pendingDataDirectory = config.pendingDataDirectory
    ? path.resolve(config.pendingDataDirectory)
    : null;
  const backupDirectory = config.backupDirectory
    ? path.resolve(config.backupDirectory)
    : null;
  return {
    dataDirectory,
    backupDirectory,
    pendingDataDirectory,
    restartRequired: Boolean(pendingDataDirectory),
    dataDirectoryIsDefault: samePath(dataDirectory, defaultDataDirectory(userDataPath)),
    dataDirectoryIsCloudSynced: isCloudSyncedPath(dataDirectory),
    backupIsCloudSynced: backupDirectory ? isCloudSyncedPath(backupDirectory) : false,
    dataDirectoryIsOutsideRepository: !pathsOverlap(projectRoot, dataDirectory),
    lastMigration: config.lastMigration,
  };
}

function scheduleDataDirectoryMigration({
  userDataPath,
  projectRoot,
  selectedDirectory,
}) {
  const selected = assertDirectoryExists(selectedDirectory, "The live data folder");
  assertOutsideProject(selected, projectRoot);
  if (isCloudSyncedPath(selected)) {
    throw new Error(
      "The live data folder cannot be inside OneDrive, Dropbox, iCloud, or another cloud-sync folder. Choose a local folder and use the separate backup folder for encrypted cloud copies.",
    );
  }

  const config = readStorageConfig(userDataPath);
  const current = activeDataDirectory(userDataPath, config);
  if (samePath(selected, current)) {
    config.pendingDataDirectory = null;
    writeStorageConfig(userDataPath, config);
    return storageSettingsSnapshot({ userDataPath, projectRoot });
  }
  if (pathsOverlap(selected, current)) {
    throw new Error("Choose a live data folder that is separate from the current data folder.");
  }
  if (config.backupDirectory && pathsOverlap(selected, config.backupDirectory)) {
    throw new Error("The live data folder and backup folder must be different locations.");
  }
  if (fs.readdirSync(selected).length > 0) {
    throw new Error("Choose an empty folder for the live chart data migration.");
  }

  config.pendingDataDirectory = selected;
  writeStorageConfig(userDataPath, config);
  return storageSettingsSnapshot({ userDataPath, projectRoot });
}

function setBackupDirectory({ userDataPath, projectRoot, selectedDirectory }) {
  const selected = assertDirectoryExists(selectedDirectory, "The backup folder");
  assertOutsideProject(selected, projectRoot);
  const config = readStorageConfig(userDataPath);
  const current = activeDataDirectory(userDataPath, config);
  if (
    pathsOverlap(selected, current) ||
    (config.pendingDataDirectory && pathsOverlap(selected, config.pendingDataDirectory))
  ) {
    throw new Error("The backup folder and live data folder must be different locations.");
  }
  config.backupDirectory = selected;
  writeStorageConfig(userDataPath, config);
  return storageSettingsSnapshot({ userDataPath, projectRoot });
}

function fileDigest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function directoryManifest(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const entries = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stats = fs.lstatSync(absolute);
      if (stats.isSymbolicLink()) {
        throw new Error("Live chart data contains a symbolic link and cannot be migrated safely.");
      }
      if (stats.isDirectory()) {
        visit(absolute);
      } else if (stats.isFile()) {
        entries.push({
          path: path.relative(rootPath, absolute),
          bytes: stats.size,
          sha256: fileDigest(absolute),
        });
      }
    }
  };
  visit(rootPath);
  return entries;
}

function applyPendingDataMigration({ userDataPath, projectRoot }) {
  const config = readStorageConfig(userDataPath);
  if (!config.pendingDataDirectory) {
    return storageSettingsSnapshot({ userDataPath, projectRoot });
  }

  const source = activeDataDirectory(userDataPath, config);
  const destination = path.resolve(config.pendingDataDirectory);
  assertOutsideProject(destination, projectRoot);
  if (isCloudSyncedPath(destination)) {
    throw new Error("The pending live data folder is now inside a cloud-sync location.");
  }
  if (config.backupDirectory && pathsOverlap(destination, config.backupDirectory)) {
    throw new Error("The pending live data folder now overlaps the backup folder.");
  }
  if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
    throw new Error("The selected live data folder no longer exists.");
  }
  if (fs.readdirSync(destination).length > 0) {
    throw new Error("The selected live data folder is no longer empty.");
  }

  const staging = `${destination}.migration-${process.pid}-${Date.now()}`;
  const sourceManifest = directoryManifest(source);
  try {
    fs.mkdirSync(staging, { recursive: false, mode: 0o700 });
    if (fs.existsSync(source)) {
      fs.cpSync(source, staging, {
        recursive: true,
        errorOnExist: true,
        preserveTimestamps: true,
      });
    }
    const copiedManifest = directoryManifest(staging);
    if (JSON.stringify(copiedManifest) !== JSON.stringify(sourceManifest)) {
      throw new Error("The copied chart data did not pass its checksum verification.");
    }
    fs.rmdirSync(destination);
    fs.renameSync(staging, destination);
  } catch (error) {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  config.dataDirectory = destination;
  config.pendingDataDirectory = null;
  config.lastMigration = {
    completedAt: new Date().toISOString(),
    from: source,
    to: destination,
    sourceRetained: fs.existsSync(source),
  };
  writeStorageConfig(userDataPath, config);
  return storageSettingsSnapshot({ userDataPath, projectRoot });
}

function sanitizeBackupFileName(fileName) {
  if (typeof fileName !== "string") throw new Error("A backup filename is required.");
  const baseName = path.basename(fileName);
  if (
    baseName !== fileName ||
    !/^orgchart-studio-backup-[A-Za-z0-9_-]+\.orgchart-backup$/.test(baseName)
  ) {
    throw new Error("The encrypted backup filename is invalid.");
  }
  return baseName;
}

function validateEncryptedBackup(encryptedJson) {
  if (typeof encryptedJson !== "string") {
    throw new Error("The encrypted backup must be serialized JSON.");
  }
  const byteLength = Buffer.byteLength(encryptedJson, "utf8");
  if (byteLength < 2 || byteLength > MAX_ENCRYPTED_BACKUP_BYTES) {
    throw new Error("The encrypted backup is empty or exceeds the 100 MB safety limit.");
  }
  let parsed;
  try {
    parsed = JSON.parse(encryptedJson);
  } catch {
    throw new Error("The encrypted backup is not valid JSON.");
  }
  if (
    parsed?.format !== "orgchart-studio-encrypted-backup" ||
    parsed?.version !== 1 ||
    parsed?.encryption?.cipher !== "AES-GCM" ||
    parsed?.encryption?.kdf !== "PBKDF2" ||
    typeof parsed?.encryption?.saltBase64 !== "string" ||
    typeof parsed?.encryption?.ivBase64 !== "string" ||
    typeof parsed?.ciphertextBase64 !== "string"
  ) {
    throw new Error("The file is not an OrgChart Studio encrypted backup envelope.");
  }
}

function saveEncryptedBackup({ userDataPath, fileName, encryptedJson }) {
  const config = readStorageConfig(userDataPath);
  if (!config.backupDirectory) {
    throw new Error("Choose a backup folder before saving directly from the desktop app.");
  }
  const directory = assertDirectoryExists(config.backupDirectory, "The backup folder");
  const safeName = sanitizeBackupFileName(fileName);
  validateEncryptedBackup(encryptedJson);
  const target = path.join(directory, safeName);
  const temporary = path.join(directory, `.${safeName}.tmp-${process.pid}-${Date.now()}`);
  if (fs.existsSync(target)) {
    throw new Error("A backup with this filename already exists. Create a new backup instead.");
  }
  fs.writeFileSync(temporary, `${encryptedJson}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  fs.renameSync(temporary, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Some Windows filesystems do not implement POSIX modes.
  }
  return { path: target, fileName: safeName, bytes: fs.statSync(target).size };
}

module.exports = {
  applyPendingDataMigration,
  defaultDataDirectory,
  directoryManifest,
  isCloudSyncedPath,
  isPathInside,
  pathsOverlap,
  readStorageConfig,
  saveEncryptedBackup,
  scheduleDataDirectoryMigration,
  setBackupDirectory,
  storageSettingsSnapshot,
};
