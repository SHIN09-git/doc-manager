import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStorageBootstrap,
  clearLegacyLocalStorageState,
  readLegacyLocalStorageState,
  readStorageBootstrap,
  shouldPreferLocalStorageFallback,
  writeLegacyLocalStorageState,
  writeStorageBootstrap,
} from "../src/core/storageBootstrap.js";
import { STORAGE_BOOTSTRAP_KEY, STORAGE_KEY } from "../src/config/constants.js";

test("writeStorageBootstrap records the active storage backend", () => {
  const storage = createMemoryStorage();
  const snapshot = {
    selectedFolderId: "folder-1",
    selectedDocId: "doc-1",
    docs: [{ id: "doc-1" }],
    styles: [{ id: "style-1" }, { id: "style-2" }],
  };

  assert.equal(writeStorageBootstrap(snapshot, "localStorage", storage), true);

  const bootstrap = JSON.parse(storage.getItem(STORAGE_BOOTSTRAP_KEY));
  assert.equal(bootstrap.storage, "localStorage");
  assert.equal(bootstrap.selectedFolderId, "folder-1");
  assert.equal(bootstrap.selectedDocId, "doc-1");
  assert.equal(bootstrap.docCount, 1);
  assert.equal(bootstrap.skillCount, 2);
  assert.equal(shouldPreferLocalStorageFallback(bootstrap), true);
});

test("readStorageBootstrap returns null for broken bootstrap JSON", () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_BOOTSTRAP_KEY, "{broken");

  assert.equal(readStorageBootstrap(storage), null);
});

test("legacy localStorage state can be written, read, and cleared", () => {
  const storage = createMemoryStorage();
  const snapshot = { docs: [{ id: "doc-1" }], styles: [] };

  assert.equal(writeLegacyLocalStorageState(snapshot, storage), true);
  assert.deepEqual(readLegacyLocalStorageState(storage), snapshot);

  assert.equal(clearLegacyLocalStorageState(storage), true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test("buildStorageBootstrap defaults to IndexedDB mode", () => {
  const bootstrap = buildStorageBootstrap({ docs: [], styles: [] });

  assert.equal(bootstrap.storage, "indexedDB");
  assert.equal(bootstrap.selectedFolderId, "all");
  assert.equal(shouldPreferLocalStorageFallback(bootstrap), false);
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
