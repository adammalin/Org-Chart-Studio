import assert from "node:assert/strict";
import test from "node:test";
import {
  LIBRARY_BACKUP_FORMAT,
  LIBRARY_BACKUP_VERSION,
  type LibraryBackup,
} from "../lib/backup-format";
import { decryptLibraryBackup, encryptLibraryBackup } from "../lib/encrypted-backup";
import { seedChartDocuments } from "../lib/chart-library";

function fixture(): LibraryBackup {
  const charts = seedChartDocuments().slice(0, 1);
  return {
    format: LIBRARY_BACKUP_FORMAT,
    schemaVersion: LIBRARY_BACKUP_VERSION,
    exportedAt: "2026-07-31T20:00:00.000Z",
    chartCount: charts.length,
    sourceFileCount: 0,
    versionCount: 1,
    charts,
    chartVersions: [
      {
        id: "version-fixture-1",
        chartId: charts[0].id,
        version: 1,
        label: "Initial fixture",
        createdAt: charts[0].createdAt,
        restoredFromVersion: null,
        nodes: charts[0].nodes,
        edges: charts[0].edges,
      },
    ],
    sourceFiles: [],
  };
}

test("legacy schema version 1 backups remain recognizable", async () => {
  const current = fixture();
  const legacy: LibraryBackup = {
    ...current,
    schemaVersion: 1,
    versionCount: undefined,
    chartVersions: undefined,
  };
  const encrypted = await encryptLibraryBackup(legacy, "correct horse battery staple");
  const decrypted = await decryptLibraryBackup(encrypted, "correct horse battery staple");

  assert.equal(decrypted.schemaVersion, 1);
  assert.equal(decrypted.chartVersions, undefined);
});

test("an encrypted library backup round-trips without changing chart data", async () => {
  const backup = fixture();
  const encrypted = await encryptLibraryBackup(backup, "correct horse battery staple");
  const decrypted = await decryptLibraryBackup(encrypted, "correct horse battery staple");

  assert.equal(encrypted.format, "orgchart-studio-encrypted-backup");
  assert.equal(encrypted.encryption.cipher, "AES-GCM");
  assert.equal(encrypted.encryption.keyLength, 256);
  assert.equal(encrypted.encryption.iterations, 250_000);
  assert.deepEqual(decrypted, backup);
});

test("a wrong passphrase cannot decrypt a library backup", async () => {
  const encrypted = await encryptLibraryBackup(fixture(), "correct horse battery staple");

  await assert.rejects(
    decryptLibraryBackup(encrypted, "incorrect passphrase"),
    /could not be decrypted/i,
  );
});

test("authenticated encryption rejects a modified backup", async () => {
  const encrypted = await encryptLibraryBackup(fixture(), "correct horse battery staple");
  const finalCharacter = encrypted.ciphertextBase64.at(-1) === "A" ? "B" : "A";
  const tampered = {
    ...encrypted,
    ciphertextBase64: `${encrypted.ciphertextBase64.slice(0, -1)}${finalCharacter}`,
  };

  await assert.rejects(
    decryptLibraryBackup(tampered, "correct horse battery staple"),
    /could not be decrypted/i,
  );
});

test("short backup passphrases are rejected", async () => {
  await assert.rejects(encryptLibraryBackup(fixture(), "too short"), /at least 12/i);
});
