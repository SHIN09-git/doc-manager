import assert from "node:assert/strict";
import test from "node:test";
import { createGongwenController } from "../src/modules/skills/gongwenController.js";
import { createGongwenWriter } from "../src/modules/skills/gongwenWriter.js";

function element(value = "") {
  return { value, hidden: true, innerHTML: "", listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; } };
}

test("checks are outside the editor, become stale on editing, and generation controls follow writer selection", () => {
  const els = Object.fromEntries([
    "gongwenGenreSelect", "gongwenCheckGenre", "gongwenCheckPanel", "gongwenCheckBody", "gongwenOptions",
    "contentEditor", "titleInput", "typeSelect", "styleSelect", "generatePrompt",
  ].map((key) => [key, element()]));
  els.contentEditor.value = "正文【时间】";
  els.gongwenCheckGenre.value = "工作方案";
  let writers = [];
  const controller = createGongwenController({ els, getCurrentDoc: () => ({ type: "plan" }), resolveInvokedSkills: () => writers });
  controller.bindEvents();
  assert.equal(els.gongwenOptions.hidden, true);
  writers = [createGongwenWriter()];
  els.generatePrompt.listeners.input();
  assert.equal(els.gongwenOptions.hidden, false);
  controller.onDocumentGenerated({ skills: writers, genre: "工作方案" });
  assert.equal(els.gongwenCheckPanel.hidden, false);
  assert.match(els.gongwenCheckBody.innerHTML, /待确认占位内容 1 处/);
  assert.equal(els.contentEditor.value, "正文【时间】");
  els.contentEditor.listeners.input();
  assert.equal(els.gongwenCheckPanel.hidden, true);
  controller.onDocumentGenerated({ skills: [] });
  assert.equal(els.gongwenCheckPanel.hidden, true);
});
