import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { decryptBackupPayload, encryptBackupPayload, isEncryptedBackupEnvelope } from "../src/utils/backupCrypto.js";
import { buildObjectKey, buildS3PutRequest } from "../src/utils/objectStorage.js";

test("backup encryption round-trips with AES-GCM envelope", () => {
  const payload = JSON.stringify({ exported_at: "2026-05-24T00:00:00.000Z", data: { users: [] } });
  const encrypted = encryptBackupPayload(payload, "backup-secret-with-enough-length", { exported_at: "2026-05-24T00:00:00.000Z" });
  assert.equal(isEncryptedBackupEnvelope(encrypted), true);
  assert.equal(decryptBackupPayload(encrypted, "backup-secret-with-enough-length"), payload);
  assert.throws(() => decryptBackupPayload(encrypted, "wrong-secret"), /Unsupported state|authenticate/i);
});

test("backup object storage config validates required S3-compatible fields", () => {
  assert.throws(
    () => loadEnv({ BACKUP_OBJECT_STORAGE_MODE: "s3-compatible" }),
    /BACKUP_OBJECT_STORAGE_ENDPOINT/,
  );
  const env = loadEnv({
    BACKUP_OBJECT_STORAGE_MODE: "s3-compatible",
    BACKUP_OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
    BACKUP_OBJECT_STORAGE_BUCKET: "mowen-backups",
    BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
  });
  assert.equal(env.backupObjectStorageMode, "s3-compatible");
  assert.equal(env.backupObjectStorageRegion, "us-east-1");
});

test("S3-compatible backup upload request is signed and scoped to configured bucket", () => {
  const env = loadEnv({
    BACKUP_OBJECT_STORAGE_MODE: "s3-compatible",
    BACKUP_OBJECT_STORAGE_ENDPOINT: "https://storage.example.test/base",
    BACKUP_OBJECT_STORAGE_BUCKET: "mowen-backups",
    BACKUP_OBJECT_STORAGE_REGION: "auto",
    BACKUP_OBJECT_STORAGE_PREFIX: "daily",
    BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
  });
  const objectKey = buildObjectKey(env, "mowen-backup-2026.json.gcm");
  const request = buildS3PutRequest(env, {
    key: objectKey,
    body: Buffer.from("{}"),
    now: new Date("2026-05-24T01:02:03.000Z"),
  });

  assert.equal(objectKey, "daily/mowen-backup-2026.json.gcm");
  assert.equal(request.url, "https://storage.example.test/base/mowen-backups/daily/mowen-backup-2026.json.gcm");
  assert.equal(request.headers["x-amz-date"], "20260524T010203Z");
  assert.match(request.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=access-key\/20260524\/auto\/s3\/aws4_request/);
  assert.match(request.headers.Authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
});
