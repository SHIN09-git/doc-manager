import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../src/config/env.js";
import { createStore } from "../src/db/storeFactory.js";
import { encryptBackupPayload } from "../src/utils/backupCrypto.js";
import { uploadBackupToObjectStorage } from "../src/utils/objectStorage.js";

let env;
let store;

try {
  env = loadEnv(process.env);
  store = createStore(env);
  await store.init();

  const data = await store.read();
  await mkdir(env.backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportedAt = new Date().toISOString();
  const backupPayload = `${JSON.stringify({ exported_at: exportedAt, data }, null, 2)}\n`;
  const encrypted = Boolean(env.backupEncryptionKey);
  const fileName = `mowen-backup-${stamp}${encrypted ? ".json.gcm" : ".json"}`;
  const filePath = path.join(env.backupDir, fileName);
  const fileContent = encrypted
    ? `${JSON.stringify(encryptBackupPayload(backupPayload, env.backupEncryptionKey, { exported_at: exportedAt }), null, 2)}\n`
    : backupPayload;
  await writeFile(filePath, fileContent, "utf8");
  const objectStorage = await uploadBackupToObjectStorage(env, { filePath, fileName });

  const cutoff = Date.now() - env.backupRetentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(env.backupDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("mowen-backup-") || !isBackupFile(entry.name)) continue;
    const full = path.join(env.backupDir, entry.name);
    const info = await stat(full);
    if (info.mtimeMs < cutoff) {
      await rm(full, { force: true });
      removed += 1;
    }
  }

  await store.close?.();
  console.log(JSON.stringify({
    ok: true,
    backup: filePath,
    encrypted,
    object_storage: objectStorage,
    removed_old_backups: removed,
  }));
} catch (error) {
  await notifyFailure(env, error);
  await store?.close?.().catch(() => {});
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exit(1);
}

function isBackupFile(fileName) {
  return fileName.endsWith(".json") || fileName.endsWith(".json.gcm");
}

async function notifyFailure(currentEnv, error) {
  const webhookUrl = currentEnv?.backupFailureWebhookUrl || process.env.BACKUP_FAILURE_WEBHOOK_URL || "";
  const webhookToken = currentEnv?.backupFailureWebhookToken || process.env.BACKUP_FAILURE_WEBHOOK_TOKEN || "";
  if (!webhookUrl) return;
  try {
    const headers = { "Content-Type": "application/json" };
    if (webhookToken) {
      headers.Authorization = `Bearer ${webhookToken}`;
    }
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "backup.failed",
        message: error.message || String(error),
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      throw new Error(`backup failure webhook returned ${response.status}`);
    }
  } catch (notifyError) {
    console.error(JSON.stringify({ type: "backup.failure_alert_failed", error: notifyError.message || String(notifyError) }));
  }
}
