import assert from "node:assert/strict";
import test from "node:test";
import {
  clampConfidence,
  coerceArray,
  guessTypeFromName,
  isLegacyPresentationFile,
  isLegacyWordFile,
  isSupportedImportFile,
  isSupportedPresentationFile,
  isSupportedTextFile,
  isSupportedWordFile,
} from "../src/utils/validation.js";

test("isSupportedTextFile only accepts configured text extensions", () => {
  assert.equal(isSupportedTextFile("通知.md"), true);
  assert.equal(isSupportedTextFile("图片.png"), false);
});

test("word import validation supports docx but not legacy doc", () => {
  assert.equal(isSupportedWordFile("通知.docx"), true);
  assert.equal(isSupportedImportFile("通知.docx"), true);
  assert.equal(isLegacyWordFile("旧版通知.doc"), true);
  assert.equal(isSupportedImportFile("旧版通知.doc"), false);
});

test("presentation import validation supports pptx but not legacy ppt", () => {
  assert.equal(isSupportedPresentationFile("汇报.pptx"), true);
  assert.equal(isSupportedImportFile("汇报.pptx"), true);
  assert.equal(isLegacyPresentationFile("旧版汇报.ppt"), true);
  assert.equal(isSupportedImportFile("旧版汇报.ppt"), false);
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
