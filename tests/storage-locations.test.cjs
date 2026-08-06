/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyPendingDataMigration,
  defaultDataDirectory,
  isCloudSyncedPath,
  pathsOverlap,
  saveBackup,
  saveEncryptedBackup,
  scheduleDataDirectoryMigration,
  setBackupDirectory,
  storageSettingsSnapshot,
} = require("../electron/storage-locations.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgchart-storage-test-"));
  const projectRoot = path.join(root, "repository");
  const userDataPath = path.join(root, "application-support");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  return {
    root,
    projectRoot,
    userDataPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("path safety detects overlaps and common cloud-sync roots", () => {
  assert.equal(pathsOverlap("/safe/data", "/safe/data/charts"), true);
  assert.equal(pathsOverlap("/safe/data", "/safe/backups"), false);
  assert.equal(isCloudSyncedPath("/Users/example/Library/CloudStorage/OneDrive-ORNL"), true);
  assert.equal(isCloudSyncedPath("/Users/example/Dropbox/OrgChart Backups"), true);
  assert.equal(isCloudSyncedPath("/Users/example/Documents/OrgChart Data"), false);
});

test("live data migration copies, verifies, switches, and retains the source", () => {
  const item = fixture();
  try {
    const source = defaultDataDirectory(item.userDataPath);
    const destination = path.join(item.root, "private-live-data");
    fs.mkdirSync(path.join(source, "d1"), { recursive: true });
    fs.writeFileSync(path.join(source, "d1", "chart.sqlite"), "private chart bytes");
    fs.mkdirSync(destination);

    const scheduled = scheduleDataDirectoryMigration({
      userDataPath: item.userDataPath,
      projectRoot: item.projectRoot,
      selectedDirectory: destination,
    });
    assert.equal(scheduled.restartRequired, true);
    assert.equal(scheduled.pendingDataDirectory, fs.realpathSync(destination));

    const migrated = applyPendingDataMigration({
      userDataPath: item.userDataPath,
      projectRoot: item.projectRoot,
    });
    assert.equal(migrated.dataDirectory, fs.realpathSync(destination));
    assert.equal(migrated.restartRequired, false);
    assert.equal(
      fs.readFileSync(path.join(destination, "d1", "chart.sqlite"), "utf8"),
      "private chart bytes",
    );
    assert.equal(fs.existsSync(path.join(source, "d1", "chart.sqlite")), true);
    assert.equal(migrated.lastMigration.sourceRetained, true);
  } finally {
    item.cleanup();
  }
});

test("live data folder rejects repositories, cloud folders, and non-empty targets", () => {
  const item = fixture();
  try {
    const insideRepository = path.join(item.projectRoot, "data");
    const nonEmpty = path.join(item.root, "not-empty");
    const cloud = path.join(item.root, "Dropbox", "live-data");
    fs.mkdirSync(insideRepository);
    fs.mkdirSync(nonEmpty);
    fs.writeFileSync(path.join(nonEmpty, "existing.txt"), "occupied");
    fs.mkdirSync(cloud, { recursive: true });

    assert.throws(
      () =>
        scheduleDataDirectoryMigration({
          userDataPath: item.userDataPath,
          projectRoot: item.projectRoot,
          selectedDirectory: insideRepository,
        }),
      /outside the OrgChart Studio source repository/,
    );
    assert.throws(
      () =>
        scheduleDataDirectoryMigration({
          userDataPath: item.userDataPath,
          projectRoot: item.projectRoot,
          selectedDirectory: cloud,
        }),
      /cannot be inside OneDrive, Dropbox/,
    );
    assert.throws(
      () =>
        scheduleDataDirectoryMigration({
          userDataPath: item.userDataPath,
          projectRoot: item.projectRoot,
          selectedDirectory: nonEmpty,
        }),
      /empty folder/,
    );
  } finally {
    item.cleanup();
  }
});

test("encrypted backups may be written to a separate cloud-sync folder", () => {
  const item = fixture();
  try {
    const backupDirectory = path.join(item.root, "Dropbox", "OrgChart Backups");
    fs.mkdirSync(backupDirectory, { recursive: true });
    const settings = setBackupDirectory({
      userDataPath: item.userDataPath,
      projectRoot: item.projectRoot,
      selectedDirectory: backupDirectory,
    });
    assert.equal(settings.backupIsCloudSynced, true);

    const encryptedJson = JSON.stringify({
      format: "orgchart-studio-encrypted-backup",
      version: 1,
      encryption: {
        cipher: "AES-GCM",
        kdf: "PBKDF2",
        saltBase64: "salt",
        ivBase64: "iv",
      },
      ciphertextBase64: "ciphertext",
    });
    const saved = saveEncryptedBackup({
      userDataPath: item.userDataPath,
      fileName: "orgchart-studio-backup-2026-08-03T12-00-00.orgchart-backup",
      encryptedJson,
    });
    assert.equal(saved.fileName.endsWith(".orgchart-backup"), true);
    assert.equal(
      JSON.parse(fs.readFileSync(saved.path, "utf8")).ciphertextBase64,
      "ciphertext",
    );
    const unencryptedJson = JSON.stringify({
      format: "orgchart-studio-library-backup",
      schemaVersion: 2,
      exportedAt: "2026-08-03T12:00:00.000Z",
      chartCount: 1,
      sourceFileCount: 0,
      charts: [{ id: "test-chart" }],
      chartVersions: [],
      sourceFiles: [],
    });
    assert.throws(
      () =>
        saveBackup({
          userDataPath: item.userDataPath,
          fileName: "orgchart-studio-backup-unencrypted-cloud.orgchart-backup",
          backupJson: unencryptedJson,
          encrypted: false,
        }),
      /cannot be saved.*cloud-sync/i,
    );

    const snapshot = storageSettingsSnapshot({
      userDataPath: item.userDataPath,
      projectRoot: item.projectRoot,
    });
    assert.equal(snapshot.backupDirectory, fs.realpathSync(backupDirectory));
    assert.equal(snapshot.dataDirectoryIsOutsideRepository, true);
  } finally {
    item.cleanup();
  }
});

test("an explicitly unencrypted backup may be written to a separate local folder", () => {
  const item = fixture();
  try {
    const backupDirectory = path.join(item.root, "local-backups");
    fs.mkdirSync(backupDirectory, { recursive: true });
    setBackupDirectory({
      userDataPath: item.userDataPath,
      projectRoot: item.projectRoot,
      selectedDirectory: backupDirectory,
    });
    const backupJson = JSON.stringify({
      format: "orgchart-studio-library-backup",
      schemaVersion: 4,
      exportedAt: "2026-08-03T12:00:00.000Z",
      chartCount: 1,
      sourceFileCount: 0,
      charts: [{ id: "test-chart" }],
      chartVersions: [],
      sourceFiles: [],
    });
    const saved = saveBackup({
      userDataPath: item.userDataPath,
      fileName: "orgchart-studio-backup-unencrypted-local.orgchart-backup",
      backupJson,
      encrypted: false,
    });
    const persisted = JSON.parse(fs.readFileSync(saved.path, "utf8"));
    assert.equal(persisted.schemaVersion, 4);
    assert.equal(persisted.chartCount, 1);
  } finally {
    item.cleanup();
  }
});

test("backup and live data folders cannot overlap", () => {
  const item = fixture();
  try {
    const dataDirectory = defaultDataDirectory(item.userDataPath);
    const nestedBackup = path.join(dataDirectory, "backups");
    fs.mkdirSync(nestedBackup, { recursive: true });
    assert.throws(
      () =>
        setBackupDirectory({
          userDataPath: item.userDataPath,
          projectRoot: item.projectRoot,
          selectedDirectory: nestedBackup,
        }),
      /must be different locations/,
    );
  } finally {
    item.cleanup();
  }
});

test("a new live data folder cannot be nested inside the active data folder", () => {
  const item = fixture();
  try {
    const dataDirectory = defaultDataDirectory(item.userDataPath);
    const nestedDirectory = path.join(dataDirectory, "new-location");
    fs.mkdirSync(nestedDirectory, { recursive: true });
    assert.throws(
      () =>
        scheduleDataDirectoryMigration({
          userDataPath: item.userDataPath,
          projectRoot: item.projectRoot,
          selectedDirectory: nestedDirectory,
        }),
      /separate from the current data folder/,
    );
  } finally {
    item.cleanup();
  }
});
