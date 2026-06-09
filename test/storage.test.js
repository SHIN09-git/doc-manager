import assert from "node:assert/strict";
import test from "node:test";
import { openHandleDb, openWorkspaceDb } from "../src/core/storage.js";

test("openWorkspaceDb reports unsupported IndexedDB clearly", async () => {
  const originalWindow = globalThis.window;
  const originalIndexedDb = globalThis.indexedDB;
  delete globalThis.indexedDB;
  globalThis.window = {};
  try {
    await assert.rejects(openWorkspaceDb(), /IndexedDB/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.indexedDB = originalIndexedDb;
  }
});

test("openHandleDb reports unsupported IndexedDB clearly", async () => {
  const originalWindow = globalThis.window;
  const originalIndexedDb = globalThis.indexedDB;
  delete globalThis.indexedDB;
  globalThis.window = {};
  try {
    await assert.rejects(openHandleDb(), /无法保存真实文件夹授权/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.indexedDB = originalIndexedDb;
  }
});
