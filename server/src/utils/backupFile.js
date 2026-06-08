import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { EMPTY_DATA, normalizeData } from "../db/jsonStore.js";
import { decryptBackupPayload, isEncryptedBackupEnvelope } from "./backupCrypto.js";

export async function readBackupFile(backupPath, { encryptionKey = "" } = {}) {
  let parsed;
  let encrypted = false;
  try {
    parsed = JSON.parse(await readFile(backupPath, "utf8"));
    if (isEncryptedBackupEnvelope(parsed)) {
      encrypted = true;
      parsed = JSON.parse(decryptBackupPayload(parsed, encryptionKey));
    }
  } catch (error) {
    throw new Error(`Backup file cannot be parsed: ${error.message || String(error)}`);
  }
  return validateBackupPayload(parsed, { backupPath, encrypted });
}

export function validateBackupPayload(parsed, { backupPath = "", encrypted = false } = {}) {
  const data = parsed?.data;
  const requiredTables = Object.keys(EMPTY_DATA);
  const missingTables = requiredTables.filter((table) => !Array.isArray(data?.[table]));
  const tableCounts = Object.fromEntries(requiredTables.map((table) => [table, Array.isArray(data?.[table]) ? data[table].length : 0]));
  if (!data || missingTables.length > 0) {
    const error = new Error("Backup data is missing required tables");
    error.details = {
      backup: backupPath,
      missing_tables: missingTables,
      table_counts: tableCounts,
    };
    throw error;
  }
  return {
    backup: backupPath,
    encrypted,
    exported_at: parsed.exported_at || "",
    table_counts: tableCounts,
    data: normalizeData(data),
  };
}

export async function writeBackupFileAtomically(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tempPath, content, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => null);
    throw error;
  }
}
