import assert from "node:assert/strict";
import test from "node:test";
import { createEditorContextMenuController } from "../src/modules/editor/editorContextMenuController.js";

function createEditor(value = "") {
  return {
    value,
    selectionStart: 0,
    selectionEnd: 0,
    focused: false,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
}

function createButton(action, extraDataset = {}, documentState = {}) {
  return {
    dataset: { editorAction: action, ...extraDataset },
    focusCount: 0,
    closest(selector) {
      return selector === "button[data-editor-action]" ? this : null;
    },
    focus() {
      this.focusCount += 1;
      documentState.activeElement = this;
    },
  };
}

function createHarness(options = {}) {
  const documentState = { activeElement: null };
  const buttons = options.buttons || [
    createButton("copy", {}, documentState),
    createButton("format", {}, documentState),
  ];
  const editor = createEditor(options.content || "");
  const editorMenu = {
    hidden: true,
    style: {},
    offsetWidth: 196,
    offsetHeight: 164,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    querySelectorAll(selector) {
      return selector === "button[data-editor-action]" ? buttons : [];
    },
  };
  const skillSelect = {
    value: options.skillSelectValue || "",
    options: options.skillOptions || [],
  };
  const toasts = [];
  const saved = [];
  let undoCount = 0;
  const controller = createEditorContextMenuController({
    state: options.state || { styles: [] },
    ui: options.ui || { editorMenuReturnFocus: null },
    els: {
      contentEditor: editor,
      editorMenu,
      editorSkillSelect: skillSelect,
      styleSelect: options.styleSelect || { value: "" },
    },
    toast: (message, type) => toasts.push({ message, type }),
    generationController: options.generationController || { rewriteSelection: async () => {} },
    getCurrentDoc: options.getCurrentDoc || (() => null),
    isSkillEnabled: options.isSkillEnabled || (() => true),
    recordEditorUndoPoint: () => { undoCount += 1; },
    saveEditor: (silent) => saved.push(silent),
    getSelectionOrLine: options.getSelectionOrLine || (() => ({ start: 0, end: 0, text: "" })),
    getPanelElement: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }) }),
    createIcons: () => {},
    clipboard: () => options.clipboard || { writeText: async () => {} },
    documentRef: () => documentState,
    setTimeoutRef: (callback) => callback(),
  });
  return {
    controller,
    editor,
    editorMenu,
    skillSelect,
    buttons,
    documentState,
    toasts,
    saved,
    get undoCount() {
      return undoCount;
    },
  };
}

test("editor context menu binds editor and menu events", () => {
  const harness = createHarness();

  harness.controller.bindEvents();

  assert.equal(typeof harness.editor.listeners.contextmenu, "function");
  assert.equal(typeof harness.editorMenu.listeners.click, "function");
  assert.equal(typeof harness.editorMenu.listeners.keydown, "function");
});

test("formatDocument trims line edges and collapses extra blank lines", () => {
  const harness = createHarness({ content: "  第一行  \r\n\r\n\r\n 第二行\t" });

  const formatted = harness.controller.formatDocument();

  assert.equal(formatted, true);
  assert.equal(harness.editor.value, "第一行\n\n第二行");
  assert.equal(harness.undoCount, 1);
  assert.deepEqual(harness.saved, [true]);
});

test("deleteText removes the current selection and saves the editor", () => {
  const harness = createHarness({
    content: "abcdef",
    getSelectionOrLine: () => ({ start: 2, end: 4, text: "cd" }),
  });

  const deleted = harness.controller.deleteText();

  assert.equal(deleted, true);
  assert.equal(harness.editor.value, "abef");
  assert.equal(harness.editor.selectionStart, 2);
  assert.equal(harness.editor.selectionEnd, 2);
  assert.equal(harness.undoCount, 1);
  assert.deepEqual(harness.saved, [true]);
});

test("insertSkill inserts enabled handle at the cursor", () => {
  const harness = createHarness({
    content: "请生成正文",
    state: { styles: [{ id: "skill-1", handle: "notice" }] },
  });
  harness.editor.setSelectionRange(1, 1);

  const inserted = harness.controller.insertSkill("skill-1");

  assert.equal(inserted, true);
  assert.equal(harness.editor.value, "请@notice 生成正文");
  assert.equal(harness.editor.selectionStart, 9);
  assert.equal(harness.undoCount, 1);
  assert.deepEqual(harness.saved, [true]);
  assert.equal(harness.toasts.at(-1).message, "已插入 @notice");
});

test("insertSkill blocks disabled handles without mutating content", () => {
  const harness = createHarness({
    content: "正文",
    state: { styles: [{ id: "skill-1", handle: "notice" }] },
    isSkillEnabled: () => false,
  });

  const inserted = harness.controller.insertSkill("skill-1");

  assert.equal(inserted, false);
  assert.equal(harness.editor.value, "正文");
  assert.equal(harness.undoCount, 0);
  assert.equal(harness.saved.length, 0);
  assert.deepEqual(harness.toasts.at(-1), { message: "@notice 尚未启用", type: "warn" });
});

test("handleAction passes rewrite mode and selected skill to generation controller", async () => {
  const calls = [];
  const documentState = {};
  const rewriteButton = createButton("rewrite", { rewriteMode: "shorten" }, documentState);
  const harness = createHarness({
    buttons: [rewriteButton],
    skillSelectValue: "skill-1",
    generationController: {
      rewriteSelection: async (payload) => calls.push(payload),
    },
  });
  harness.editorMenu.hidden = false;

  await harness.controller.handleAction({ target: rewriteButton });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].triggerButton, rewriteButton);
  assert.equal(calls[0].mode, "shorten");
  assert.equal(calls[0].skillId, "skill-1");
  assert.equal(harness.editorMenu.hidden, true);
});

test("handleKeydown moves focus through menu items and restores focus on escape", () => {
  const returnFocus = { isConnected: true, focusCount: 0, focus() { this.focusCount += 1; } };
  const ui = { editorMenuReturnFocus: returnFocus };
  const harness = createHarness({ ui });
  harness.editorMenu.hidden = false;
  harness.documentState.activeElement = harness.buttons[0];

  harness.controller.handleKeydown({
    key: "ArrowDown",
    target: harness.buttons[0],
    preventDefault() {
      this.prevented = true;
    },
  });
  assert.equal(harness.documentState.activeElement, harness.buttons[1]);

  harness.controller.handleKeydown({
    key: "Escape",
    target: harness.buttons[1],
    preventDefault() {
      this.prevented = true;
    },
  });
  assert.equal(harness.editorMenu.hidden, true);
  assert.equal(returnFocus.focusCount, 1);
  assert.equal(ui.editorMenuReturnFocus, null);
});

test("syncSkillSelectDefault prefers current select value or document style", () => {
  const harness = createHarness({
    skillSelectValue: "",
    styleSelect: { value: "skill-from-select" },
    skillOptions: [{ value: "skill-from-doc" }, { value: "skill-from-select" }],
    getCurrentDoc: () => ({ styleId: "skill-from-doc" }),
  });

  harness.controller.syncSkillSelectDefault();

  assert.equal(harness.skillSelect.value, "skill-from-select");

  const docFallback = createHarness({
    skillSelectValue: "",
    styleSelect: { value: "" },
    skillOptions: [{ value: "skill-from-doc" }],
    getCurrentDoc: () => ({ styleId: "skill-from-doc" }),
  });
  docFallback.controller.syncSkillSelectDefault();
  assert.equal(docFallback.skillSelect.value, "skill-from-doc");
});
