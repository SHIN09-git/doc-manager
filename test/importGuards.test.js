import assert from "node:assert/strict";
import test from "node:test";
import {
  filterImportableFilesBySize,
  formatFileSize,
  getImportFileSizeStatus,
} from "../src/utils/importGuards.js";

test("formatFileSize keeps file sizes readable", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5 MB");
});

test("getImportFileSizeStatus allows small files", () => {
  assert.equal(getImportFileSizeStatus({ name: "a.txt", size: 100 }, { warningBytes: 1000, maxBytes: 2000 }).action, "allow");
});

test("getImportFileSizeStatus asks before importing large files", () => {
  const status = getImportFileSizeStatus({ name: "large.docx", size: 1500 }, { warningBytes: 1000, maxBytes: 2000 });

  assert.equal(status.action, "confirm");
  assert.match(status.message, /large\.docx/);
});

test("getImportFileSizeStatus blocks files above the hard limit", () => {
  const status = getImportFileSizeStatus({ name: "huge.pptx", size: 3000 }, { warningBytes: 1000, maxBytes: 2000 });

  assert.equal(status.action, "block");
  assert.match(status.message, /已跳过/);
});

test("filterImportableFilesBySize can cancel large files", async () => {
  const notifications = [];
  const result = await filterImportableFilesBySize(
    [
      { name: "small.txt", size: 100 },
      { name: "large.txt", size: 1500 },
    ],
    {
      warningBytes: 1000,
      maxBytes: 2000,
      confirm: () => false,
      notify: (message, tone) => notifications.push({ message, tone }),
    },
  );

  assert.deepEqual(result.accepted.map((file) => file.name), ["small.txt"]);
  assert.equal(result.skipped[0].reason, "cancelled");
  assert.match(notifications[0].message, /已跳过大文件/);
});
