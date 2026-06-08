import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DATA } from "../src/db/jsonStore.js";
import { readBackupFile, validateBackupPayload, writeBackupFileAtomically } from "../src/utils/backupFile.js";

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

test("writeBackupFileAtomically writes a verifiable backup without temp leftovers", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mowen-backup-atomic-"));
  const backupPath = path.join(tempDir, "backup.json");
  try {
    const data = structuredClone(EMPTY_DATA);
    data.audit_logs.push({ id: "aud_1", action: "backup.test" });
    const content = `${JSON.stringify({ exported_at: "2026-06-09T00:00:00.000Z", data }, null, 2)}\n`;
    await writeBackupFileAtomically(backupPath, content);

    const report = await readBackupFile(backupPath);
    assert.equal(report.table_counts.audit_logs, 1);
    assert.deepEqual(await readdir(tempDir), ["backup.json"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
