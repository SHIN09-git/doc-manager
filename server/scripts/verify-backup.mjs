import { readBackupFile } from "../src/utils/backupFile.js";

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: node server/scripts/verify-backup.mjs <backup-file.json|backup-file.json.gcm>");
  process.exit(1);
}

let report;
try {
  report = await readBackupFile(backupPath, { encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || "" });
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message || String(error),
    ...(error.details || {}),
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  backup: report.backup,
  encrypted: report.encrypted,
  exported_at: report.exported_at,
  table_counts: report.table_counts,
}, null, 2));
