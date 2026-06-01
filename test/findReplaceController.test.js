import assert from "node:assert/strict";
import test from "node:test";
import { createFindReplaceController } from "../src/modules/editor/findReplaceController.js";

function input(value = "") {
  return {
    value,
    focusCount: 0,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    focus() {
      this.focusCount += 1;
    },
  };
}

function editor(value = "") {
  return {
    ...input(value),
    selectionStart: 0,
    selectionEnd: 0,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
}

function button() {
  return {
    listeners: {},
    attributes: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function createHarness(options = {}) {
  const toasts = [];
  const saves = [];
  let undoCount = 0;
  const replaceBar = {
    hidden: true,
    toggles: [],
    classList: {
      toggle: (name, enabled) => replaceBar.toggles.push({ name, enabled }),
    },
  };
  const els = {
    replaceToggleBtn: button(),
    replaceBar,
    findInput: input(options.findText || ""),
    replaceInput: input(options.replacement || ""),
    findStatus: { textContent: "" },
    findNextBtn: button(),
    replaceNextBtn: button(),
    replaceAllBtn: button(),
    contentEditor: editor(options.content || ""),
  };
  const controller = createFindReplaceController({
    els,
    toast: (message, type) => toasts.push({ message, type }),
    recordEditorUndoPoint: () => { undoCount += 1; },
    saveEditor: (silent) => saves.push(silent),
  });
  return {
    controller,
    els,
    toasts,
    saves,
    get undoCount() {
      return undoCount;
    },
  };
}

test("find replace controller binds toolbar events and opens the panel", () => {
  const harness = createHarness({ content: "通知正文通知", findText: "通知" });

  harness.controller.bindEvents();
  const opened = harness.els.replaceToggleBtn.listeners.click();

  assert.equal(opened, true);
  assert.equal(harness.els.replaceBar.hidden, false);
  assert.deepEqual(harness.els.replaceBar.toggles, [{ name: "collapsed", enabled: false }]);
  assert.equal(harness.els.replaceToggleBtn.attributes["aria-expanded"], "true");
  assert.equal(harness.els.findInput.focusCount, 1);
  assert.equal(harness.els.findStatus.textContent, "共 2 处");
  assert.equal(typeof harness.els.findNextBtn.listeners.click, "function");
  assert.equal(typeof harness.els.replaceNextBtn.listeners.click, "function");
  assert.equal(typeof harness.els.replaceAllBtn.listeners.click, "function");
});

test("findNext selects the next match and wraps to the first match", () => {
  const harness = createHarness({ content: "通知正文通知", findText: "通知" });

  assert.equal(harness.controller.findNext(), 0);
  assert.equal(harness.els.contentEditor.selectionStart, 0);
  assert.equal(harness.els.contentEditor.selectionEnd, 2);
  assert.equal(harness.els.findStatus.textContent, "第 1 / 共 2 处");
  assert.equal(harness.toasts.at(-1).message, "已找到第 1 / 共 2 处：第 1 个字符处");

  assert.equal(harness.controller.findNext(), 4);
  assert.equal(harness.els.findStatus.textContent, "第 2 / 共 2 处");

  assert.equal(harness.controller.findNext(), 0);
  assert.equal(harness.els.findStatus.textContent, "第 1 / 共 2 处");
});

test("findNext reports empty and missing queries clearly", () => {
  const empty = createHarness({ content: "正文" });
  assert.equal(empty.controller.findNext(), -1);
  assert.deepEqual(empty.toasts.at(-1), { message: "请输入查找内容", type: "warn" });
  assert.equal(empty.els.findInput.focusCount, 1);
  assert.equal(empty.els.findStatus.textContent, "输入查找内容");

  const missing = createHarness({ content: "正文", findText: "通知" });
  assert.equal(missing.controller.findNext(), -1);
  assert.deepEqual(missing.toasts.at(-1), { message: "没有找到匹配内容", type: "warn" });
  assert.equal(missing.els.findStatus.textContent, "0 处匹配");
});

test("replaceNext replaces the selected match and saves once", () => {
  const harness = createHarness({ content: "通知正文通知", findText: "通知", replacement: "公告" });
  harness.els.contentEditor.setSelectionRange(0, 2);

  const replaced = harness.controller.replaceNext();

  assert.equal(replaced, true);
  assert.equal(harness.els.contentEditor.value, "公告正文通知");
  assert.equal(harness.els.contentEditor.selectionStart, 0);
  assert.equal(harness.els.contentEditor.selectionEnd, 2);
  assert.equal(harness.undoCount, 1);
  assert.deepEqual(harness.saves, [true]);
  assert.equal(harness.els.findStatus.textContent, "共 1 处");
});

test("replaceAll replaces every match and updates count status", () => {
  const harness = createHarness({ content: "通知正文通知", findText: "通知", replacement: "公告" });

  const count = harness.controller.replaceAll();

  assert.equal(count, 2);
  assert.equal(harness.els.contentEditor.value, "公告正文公告");
  assert.equal(harness.undoCount, 1);
  assert.deepEqual(harness.saves, [true]);
  assert.equal(harness.els.findStatus.textContent, "0 处匹配");
  assert.equal(harness.toasts.at(-1).message, "已替换 2 处");
});

test("enter in the find field triggers findNext", () => {
  const harness = createHarness({ content: "abc abc", findText: "abc" });
  harness.controller.bindEvents();
  const event = {
    key: "Enter",
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };

  harness.els.findInput.listeners.keydown(event);

  assert.equal(event.prevented, true);
  assert.equal(harness.els.contentEditor.selectionStart, 0);
  assert.equal(harness.els.findStatus.textContent, "第 1 / 共 2 处");
});
