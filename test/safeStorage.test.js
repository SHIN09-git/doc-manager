import assert from "node:assert/strict";
import test from "node:test";
import { readStorageValue, writeStorageValue } from "../src/utils/safeStorage.js";

test("safe storage reads and writes available browser storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  assert.equal(readStorageValue(storage, "missing", "fallback"), "fallback");
  assert.equal(writeStorageValue(storage, "theme", "dark"), true);
  assert.equal(readStorageValue(storage, "theme", "light"), "dark");
});

test("safe storage falls back when browser policy blocks access", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(readStorageValue(storage, "theme", "system"), "system");
  assert.equal(writeStorageValue(storage, "theme", "dark"), false);
});
