import assert from "node:assert/strict";
import test from "node:test";
import {
  clampConfidence,
  coerceArray,
  guessTypeFromName,
  isSupportedTextFile,
} from "../src/utils/validation.js";

test("isSupportedTextFile only accepts configured text extensions", () => {
  assert.equal(isSupportedTextFile("通知.md"), true);
  assert.equal(isSupportedTextFile("图片.png"), false);
});

test("guessTypeFromName infers common document types", () => {
  assert.equal(guessTypeFromName("会议纪要.txt"), "minutes");
  assert.equal(guessTypeFromName("活动方案.md"), "plan");
  assert.equal(guessTypeFromName("普通通知.txt"), "notice");
});

test("coerceArray removes empty values and wraps scalars", () => {
  assert.deepEqual(coerceArray(["a", "", null, "b"]), ["a", "b"]);
  assert.deepEqual(coerceArray("单项"), ["单项"]);
});

test("clampConfidence clamps invalid bounds", () => {
  assert.equal(clampConfidence(1.4), 1);
  assert.equal(clampConfidence(-0.2), 0);
  assert.equal(clampConfidence("bad"), 0.5);
});
