import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EMPTY_DATA, JsonStore } from "../src/db/jsonStore.js";
import { readBackupFile } from "../src/utils/backupFile.js";

const backupPath = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]);
const keepTemp = process.argv.includes("--keep");

if (!backupPath) {
  console.error("Usage: node server/scripts/drill-backup-restore.mjs <backup-file.json|backup-file.json.gcm> [--keep]");
  process.exit(1);
}

let tempDir = "";
try {
  const backup = await readBackupFile(backupPath, { encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || "" });
  tempDir = await mkdtemp(path.join(os.tmpdir(), "mowen-restore-drill-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  await store.init();
  await store.write((data) => {
    for (const table of Object.keys(EMPTY_DATA)) {
      data[table] = backup.data[table] || [];
    }
  });
  const restored = await store.read();
  const restoredCounts = Object.fromEntries(Object.keys(EMPTY_DATA).map((table) => [table, restored[table].length]));
  const mismatchedTables = Object.keys(EMPTY_DATA).filter((table) => restoredCounts[table] !== backup.table_counts[table]);
  if (mismatchedTables.length > 0) {
    throw new Error(`Restore drill count mismatch: ${mismatchedTables.join(", ")}`);
  }
  console.log(JSON.stringify({
    ok: true,
    drill: "json-store-restore",
    backup: backup.backup,
    encrypted: backup.encrypted,
    exported_at: backup.exported_at,
    temp_dir: keepTemp ? tempDir : "",
    table_counts: restoredCounts,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    backup: backupPath,
    error: error.message || String(error),
    ...(error.details || {}),
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempDir && !keepTemp) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}
