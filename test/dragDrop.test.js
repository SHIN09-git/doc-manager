import assert from "node:assert/strict";
import test from "node:test";
import { isFileDragData } from "../src/utils/dragDrop.js";

test("isFileDragData detects standard file drag payloads", () => {
  assert.equal(isFileDragData({ types: ["Files"] }), true);
});

test("isFileDragData detects file items when types are incomplete", () => {
  assert.equal(isFileDragData({ types: [], items: [{ kind: "file" }] }), true);
});

test("isFileDragData ignores plain text drags", () => {
  assert.equal(isFileDragData({ types: ["text/plain"], items: [{ kind: "string" }] }), false);
});
