import assert from "node:assert/strict";
import test from "node:test";
import { decodeTextBuffer } from "../src/utils/textEncoding.js";

test("decodeTextBuffer keeps utf-8 Chinese text readable", () => {
  const bytes = new TextEncoder().encode("通知\n正文");
  assert.equal(decodeTextBuffer(bytes), "通知\n正文");
});

test("decodeTextBuffer falls back to GB18030 for Windows Chinese txt files", () => {
  const gb18030Bytes = Uint8Array.from([0xcd, 0xa8, 0xd6, 0xaa, 0x0a, 0xd5, 0xfd, 0xce, 0xc4]);
  assert.equal(decodeTextBuffer(gb18030Bytes), "通知\n正文");
});

test("decodeTextBuffer handles utf-16le files with BOM", () => {
  const bytes = Uint8Array.from([0xff, 0xfe, 0x1a, 0x90, 0xe5, 0x77]);
  assert.equal(decodeTextBuffer(bytes), "通知");
});
