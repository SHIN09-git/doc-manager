import assert from "node:assert/strict";
import test from "node:test";
import { openWorkspaceDb } from "../src/core/storage.js";

test("openWorkspaceDb reports unsupported IndexedDB clearly", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    await assert.rejects(openWorkspaceDb(), /IndexedDB/);
  } finally {
    globalThis.window = originalWindow;
  }
});
