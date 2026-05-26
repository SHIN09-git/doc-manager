import { readFile } from "node:fs/promises";
import { EMPTY_DATA } from "../src/db/jsonStore.js";
import { decryptBackupPayload, isEncryptedBackupEnvelope } from "../src/utils/backupCrypto.js";

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: node server/scripts/verify-backup.mjs <backup-file.json|backup-file.json.gcm>");
  process.exit(1);
}

let parsed;
let encrypted = false;
try {
  const raw = await readFile(backupPath, "utf8");
  parsed = JSON.parse(raw);
  if (isEncryptedBackupEnvelope(parsed)) {
    encrypted = true;
    const decrypted = decryptBackupPayload(parsed, process.env.BACKUP_ENCRYPTION_KEY || "");
    parsed = JSON.parse(decrypted);
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: `备份文件无法解析：${error.message}` }));
  process.exit(1);
}

const data = parsed?.data;
const requiredTables = Object.keys(EMPTY_DATA);
const missing = requiredTables.filter((table) => !Array.isArray(data?.[table]));
const counts = Object.fromEntries(requiredTables.map((table) => [table, Array.isArray(data?.[table]) ? data[table].length : 0]));

if (!data || missing.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    backup: backupPath,
    missing_tables: missing,
    table_counts: counts,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  backup: backupPath,
  encrypted,
  exported_at: parsed.exported_at || "",
  table_counts: counts,
}, null, 2));
