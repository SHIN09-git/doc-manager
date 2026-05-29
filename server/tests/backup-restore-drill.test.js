import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DATA } from "../src/db/jsonStore.js";
import { readBackupFile, validateBackupPayload } from "../src/utils/backupFile.js";

test("readBackupFile validates and normalizes backup data", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mowen-backup-file-"));
  const backupPath = path.join(tempDir, "backup.json");
  try {
    const data = structuredClone(EMPTY_DATA);
    data.users.push({ id: "usr_1", email: "owner@example.com" });
    data.documents.push({ id: "doc_1", title: "Test", content: "hello" });
    await writeFile(backupPath, `${JSON.stringify({ exported_at: "2026-05-29T00:00:00.000Z", data }, null, 2)}\n`, "utf8");

    const report = await readBackupFile(backupPath);
    assert.equal(report.encrypted, false);
    assert.equal(report.exported_at, "2026-05-29T00:00:00.000Z");
    assert.equal(report.table_counts.users, 1);
    assert.equal(report.table_counts.documents, 1);
    assert.equal(report.data.documents[0].version, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("validateBackupPayload reports missing required tables", () => {
  assert.throws(
    () => validateBackupPayload({ data: { users: [] } }),
    /missing required tables/,
  );
});
