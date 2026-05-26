import crypto from "node:crypto";

export const ENCRYPTED_BACKUP_FORMAT = "mowen-backup-aes-256-gcm-v1";

export function encryptBackupPayload(payload, key, metadata = {}) {
  assertBackupKey(key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveBackupKey(key), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8")),
    cipher.final(),
  ]);
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    algorithm: "aes-256-gcm",
    kdf: "sha256",
    encrypted_at: new Date().toISOString(),
    metadata,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: encrypted.toString("base64url"),
  };
}

export function decryptBackupPayload(envelope, key) {
  assertBackupKey(key);
  if (!isEncryptedBackupEnvelope(envelope)) {
    throw new Error("Unsupported encrypted backup format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveBackupKey(key), Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedBackupEnvelope(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.format === ENCRYPTED_BACKUP_FORMAT &&
    value.algorithm === "aes-256-gcm" &&
    value.iv &&
    value.tag &&
    value.ciphertext,
  );
}

function assertBackupKey(key) {
  if (!String(key || "").trim()) throw new Error("BACKUP_ENCRYPTION_KEY is required for encrypted backups");
}

function deriveBackupKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest();
}
