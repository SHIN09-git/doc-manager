import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  classifyGongwenBlocks,
  createGongwenDocxArrayBuffer,
  measureTextWidth,
  splitHeadingRuns,
} from "../src/modules/documents/gongwenDocxExporter.js";

const NOTICE = [
  "各部门、各单位：",
  "",
  "为提升工作协同效率，现将专项培训有关事项通知如下。",
  "",
  "一、培训安排",
  "（一）培训时间。2026年5月20日上午9:00。",
  "1. 请提前十分钟签到。",
  "（1）携带笔记本。",
  "二、工作要求。请各部门高度重视，按要求组织参训。",
  "附件：培训日程安排表",
  "",
  "综合办公室",
  "2026年5月14日",
].join("\n");

test("classifyGongwenBlocks recognises addressee, heading levels, attachment and closing", () => {
  const kinds = classifyGongwenBlocks(NOTICE).map((block) => block.kind);
  assert.deepEqual(kinds, ["addressee", "body", "h1", "h2", "h3", "h4", "h1", "attachment", "signature", "date"]);
});

test("classifyGongwenBlocks drops blank lines and markdown markers", () => {
  const blocks = classifyGongwenBlocks("## 一、总体要求\n\n**加强**组织领导。\n- 落实责任");
  assert.deepEqual(blocks, [
    { kind: "h1", text: "一、总体要求" },
    { kind: "body", text: "加强组织领导。" },
    { kind: "body", text: "落实责任" },
  ]);
});

test("a closing line that reads like a sentence is not mistaken for the signature", () => {
  const kinds = classifyGongwenBlocks("正文第一段。\n请认真贯彻落实。\n二〇二六年五月十四日").map((block) => block.kind);
  assert.deepEqual(kinds, ["body", "body", "date"]);
});

test("splitHeadingRuns only styles the heading phrase of a numbered paragraph", () => {
  assert.deepEqual(splitHeadingRuns("二、工作要求。请各部门高度重视。"), { heading: "二、工作要求。", rest: "请各部门高度重视。" });
  assert.deepEqual(splitHeadingRuns("一、培训安排"), { heading: "一、培训安排", rest: "" });
  const longSentence = "一、请各部门安排相关人员准时参加并提前梳理本部门在实际工作中遇到的重点问题，形成书面材料";
  assert.deepEqual(splitHeadingRuns(longSentence), { heading: "", rest: longSentence });
});

test("measureTextWidth counts half-width characters as half a character", () => {
  assert.equal(measureTextWidth("2026年5月14日"), 6.5);
});

test("createGongwenDocxArrayBuffer writes GB/T 9704 page setup, fonts and odd/even page numbers", async () => {
  const buffer = await createGongwenDocxArrayBuffer({ title: "关于开展专项培训的通知", content: NOTICE });
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");
  const settingsXml = await zip.file("word/settings.xml").async("string");
  const fontTableXml = await zip.file("word/fontTable.xml").async("string");
  const oddFooter = await zip.file("word/footer1.xml").async("string");
  const evenFooter = await zip.file("word/footer2.xml").async("string");
  const contentTypes = await zip.file("[Content_Types].xml").async("string");

  assert.match(documentXml, /<w:pgMar w:top="2098" w:right="1474" w:bottom="1984" w:left="1587"/);
  assert.match(documentXml, /<w:docGrid w:type="linesAndChars" w:linePitch="579" w:charSpace="-849"\/>/);
  assert.match(documentXml, /w:eastAsia="方正小标宋简体"[^>]*\/><w:sz w:val="44"\/>/);
  assert.match(documentXml, /w:eastAsia="黑体"/);
  assert.match(documentXml, /w:eastAsia="楷体_GB2312"/);
  assert.match(documentXml, /w:firstLineChars="200"/);
  assert.match(documentXml, /<w:ind w:rightChars="400" w:right="1280"\/><w:jc w:val="right"\/><\/w:pPr><w:r>.*2026年5月14日/);
  assert.doesNotMatch(documentXml, /各部门、各单位：<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:spacing[^>]*\/><w:jc w:val="both"\/><\/w:pPr><\/w:p>/);
  assert.match(documentXml, /<w:keepNext\/>[^]*?培训日程安排表[^]*?<w:keepNext\/>[^]*?<w:keepNext\/>[^]*?综合办公室/, "closing should stay with the last body paragraph");
  assert.match(settingsXml, /<w:evenAndOddHeaders\/>/);
  assert.match(fontTableXml, /<w:font w:name="仿宋_GB2312"><w:altName w:val="仿宋"\/>/);
  assert.match(oddFooter, /<w:jc w:val="right"\/>.*PAGE/);
  assert.match(evenFooter, /<w:jc w:val="left"\/>.*PAGE/);
  assert.match(contentTypes, /footer2\.xml/);
});

test("createGongwenDocxArrayBuffer removes a duplicated title from the body", async () => {
  const buffer = await createGongwenDocxArrayBuffer({ title: "工作方案", content: "工作方案\n\n正文。" });
  const documentXml = await (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");
  assert.equal(documentXml.split("工作方案").length - 1, 1);
});
