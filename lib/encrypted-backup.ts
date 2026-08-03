import {
  ENCRYPTED_BACKUP_FORMAT,
  ENCRYPTED_BACKUP_VERSION,
  isEncryptedLibraryBackup,
  isLibraryBackup,
  type EncryptedLibraryBackup,
  type LibraryBackup,
} from "./backup-format";

const PBKDF2_ITERATIONS = 250_000;
const ADDITIONAL_DATA = new TextEncoder().encode(
  `${ENCRYPTED_BACKUP_FORMAT}:v${ENCRYPTED_BACKUP_VERSION}`,
);

export type BackupProtection = "encrypted" | "unencrypted";

export interface OpenedLibraryBackup {
  backup: LibraryBackup;
  protection: BackupProtection;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt.slice().buffer as ArrayBuffer,
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptLibraryBackup(
  backup: LibraryBackup,
  passphrase: string,
): Promise<EncryptedLibraryBackup> {
  if (!isLibraryBackup(backup)) throw new Error("The library backup is not valid.");
  if (passphrase.length < 12) {
    throw new Error("Use a backup passphrase containing at least 12 characters.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA },
    key,
    plaintext,
  );

  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    encryption: {
      cipher: "AES-GCM",
      keyLength: 256,
      kdf: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      saltBase64: bytesToBase64(salt),
      ivBase64: bytesToBase64(iv),
    },
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptLibraryBackup(
  value: unknown,
  passphrase: string,
): Promise<LibraryBackup> {
  if (!isEncryptedLibraryBackup(value)) {
    throw new Error("This is not an OrgChart Studio encrypted backup.");
  }

  try {
    const salt = base64ToBytes(value.encryption.saltBase64);
    const iv = base64ToBytes(value.encryption.ivBase64);
    const ciphertext = base64ToBytes(value.ciphertextBase64);
    const key = await deriveKey(passphrase, salt, value.encryption.iterations);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.slice().buffer as ArrayBuffer,
        additionalData: ADDITIONAL_DATA,
      },
      key,
      ciphertext.slice().buffer as ArrayBuffer,
    );
    const backup = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (!isLibraryBackup(backup)) throw new Error("The decrypted backup is not valid.");
    return backup;
  } catch {
    throw new Error("The backup could not be decrypted. Check the passphrase and file integrity.");
  }
}

export async function openLibraryBackup(
  value: unknown,
  passphrase = "",
): Promise<OpenedLibraryBackup> {
  if (isLibraryBackup(value)) {
    return { backup: value, protection: "unencrypted" };
  }
  if (!isEncryptedLibraryBackup(value)) {
    throw new Error("This is not a supported OrgChart Studio backup.");
  }
  if (!passphrase) {
    throw new Error("This backup is encrypted. Enter its passphrase to continue.");
  }
  return {
    backup: await decryptLibraryBackup(value, passphrase),
    protection: "encrypted",
  };
}
