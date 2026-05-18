import assert from "node:assert/strict";
import test from "node:test";
import { getDropImportTarget } from "../src/utils/dropRouting.js";

test("getDropImportTarget routes active PPT panel drops to PPT material import", () => {
  assert.equal(getDropImportTarget("pptPanel"), "ppt");
});

test("getDropImportTarget routes active style panel drops to example import", () => {
  assert.equal(getDropImportTarget("stylePanel"), "style");
});

test("getDropImportTarget uses document import as the default route", () => {
  assert.equal(getDropImportTarget("docPanel"), "documents");
  assert.equal(getDropImportTarget(""), "documents");
});
