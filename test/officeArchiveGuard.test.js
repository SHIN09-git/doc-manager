import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { UnsafeOfficeArchiveError, assertOfficeArchiveSafe } from "../src/utils/officeArchiveGuard.js";

test("office archive guard accepts a normal package and reports its declared size", async () => {
  const bytes = await createArchive([
    ["word/document.xml", "<w:document>正文</w:document>"],
    ["word/media/image.png", new Uint8Array([1, 2, 3])],
  ]);

  const result = assertOfficeArchiveSafe(bytes, "通知.docx");
  assert.ok(result.entryCount >= 2);
  assert.ok(result.uncompressedBytes > 3);
});

test("office archive guard rejects excessive entry counts before extraction", async () => {
  const bytes = await createArchive([
    ["word/document.xml", "正文"],
    ["word/styles.xml", "样式"],
  ]);

  assert.throws(
    () => assertOfficeArchiveSafe(bytes, "通知.docx", { maxEntries: 1 }),
    (error) => error instanceof UnsafeOfficeArchiveError && /内部文件数量/.test(error.message),
  );
});

test("office archive guard rejects an oversized declared XML entry", async () => {
  const bytes = await createArchive([["ppt/slides/slide1.xml", "small"]]);

  assert.throws(
    () => assertOfficeArchiveSafe(bytes, "汇报.pptx", { maxXmlEntryBytes: 4 }),
    (error) => error instanceof UnsafeOfficeArchiveError && /内部文本条目过大/.test(error.message),
  );
});

test("office archive guard rejects malformed packages with a clear error", () => {
  assert.throws(
    () => assertOfficeArchiveSafe(new Uint8Array([1, 2, 3]), "损坏.docx"),
    (error) => error instanceof UnsafeOfficeArchiveError && /结构不完整/.test(error.message),
  );
});

async function createArchive(entries) {
  const zip = new JSZip();
  entries.forEach(([name, value]) => zip.file(name, value));
  return zip.generateAsync({ type: "uint8array" });
}
