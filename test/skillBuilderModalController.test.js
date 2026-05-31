import assert from "node:assert/strict";
import test from "node:test";
import { createSkillBuilderModalController } from "../src/modules/skills/skillBuilderModalController.js";
import { EVENTS } from "../src/core/eventBus.js";

function element(initial = {}) {
  return {
    value: "",
    checked: false,
    hidden: false,
    disabled: false,
    innerHTML: "",
    textContent: "",
    clickCount: 0,
    focusCount: 0,
    listeners: {},
    ...initial,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    click() {
      this.clickCount += 1;
    },
    focus() {
      this.focusCount += 1;
    },
  };
}

function createHarness(options = {}) {
  const state = options.state || {
    styles: [
      {
        id: "skill-1",
        name: "学校通知",
        handle: "notice",
        category: "公文写作",
        enabled: true,
        examples: [{ id: "ex-1", name: "旧样本.txt", text: "旧正文" }],
      },
    ],
    docs: [
      { id: "doc-1", title: "通知样本", content: "正文一" },
      { id: "doc-2", title: "空文档", content: "" },
      { id: "doc-3", title: "已删除", content: "正文三", deletedAt: "2026-01-01" },
    ],
  };
  const ui = options.ui || { editingStyle: null, skillBuilderReturnFocus: null };
  const els = {
    newStyleBtn: element(),
    styleFileInput: element(),
    styleDropZone: element(),
    closeSkillBuilderModalBtn: element(),
    skillBuilderCancelBtn: element(),
    skillBuilderModal: element({ hidden: true }),
    summarizeStyleBtn: element(),
    saveStyleBtn: element(),
    deleteStyleBtn: element(),
    styleNameInput: element(),
    skillHandleInput: element(),
    skillCategorySelect: element({ value: "公文写作" }),
    skillCustomCategoryInput: element(),
    skillCustomCategoryField: element({ hidden: true }),
    skillDescriptionInput: element(),
    addSourceDocsToSkillBtn: element(),
    skillEnabledInput: element({ checked: true }),
    skillAnalysisInput: element(),
    skillAggregationInput: element(),
    skillSourceDocSelect: element({ selectedOptions: [] }),
    skillBuilderModalTitle: element(),
    skillBuilderModeLabel: element(),
    ...options.els,
  };
  const events = [];
  const toasts = [];
  let hiddenDetailCount = 0;
  let renderedExamples = 0;
  let renderedDetailExamples = 0;
  let dropBound = 0;
  const documentState = { activeElement: options.activeElement || null };
  const controller = createSkillBuilderModalController({
    state,
    ui,
    els,
    eventBus: { emit: (eventName) => events.push(eventName) },
    toast: (message, type) => toasts.push({ message, type }),
    createEmptyStyle: () => ({ id: null, name: "", handle: "", category: "自定义", enabled: true, examples: [] }),
    flushSkillMarkdownEdits: options.flushSkillMarkdownEdits || (() => {}),
    hideSkillDetailMenu: () => { hiddenDetailCount += 1; },
    renderStyleExamples: () => { renderedExamples += 1; },
    renderSkillDetailExamples: () => { renderedDetailExamples += 1; },
    setupFileDrop: () => { dropBound += 1; },
    importStyleExamples: options.importStyleExamples || (() => {}),
    importStyleDropFiles: options.importStyleDropFiles || (() => {}),
    summarizeStyle: options.summarizeStyle || (() => {}),
    saveStyle: options.saveStyle || (() => {}),
    deleteStyle: options.deleteStyle || (() => {}),
    getFocusableElements: () => options.focusable || [],
    documentRef: () => documentState,
    setTimeoutRef: (callback) => callback(),
    createIcons: () => {},
  });
  return {
    controller,
    state,
    ui,
    els,
    events,
    toasts,
    documentState,
    get hiddenDetailCount() {
      return hiddenDetailCount;
    },
    get renderedExamples() {
      return renderedExamples;
    },
    get renderedDetailExamples() {
      return renderedDetailExamples;
    },
    get dropBound() {
      return dropBound;
    },
  };
}

test("skill builder modal opens existing skill in retrain mode", () => {
  const returnFocus = element();
  const harness = createHarness({ activeElement: returnFocus });

  harness.controller.open("skill-1");

  assert.equal(harness.ui.editingStyle.id, "skill-1");
  assert.notEqual(harness.ui.editingStyle, harness.state.styles[0]);
  assert.equal(harness.ui.skillBuilderReturnFocus, returnFocus);
  assert.equal(harness.hiddenDetailCount, 1);
  assert.deepEqual(harness.events, [EVENTS.RENDER_STYLE_EDITOR]);
  assert.equal(harness.els.skillBuilderModalTitle.textContent, "重训：学校通知");
  assert.match(harness.els.skillBuilderModeLabel.textContent, /已有 1 篇历史样本/);
  assert.equal(harness.els.saveStyleBtn.hidden, false);
  assert.equal(harness.els.deleteStyleBtn.hidden, false);
  assert.equal(harness.els.skillBuilderModal.hidden, false);
  assert.equal(harness.els.styleNameInput.focusCount, 1);
});

test("skill builder modal opens a blank new writer and hides edit-only buttons", () => {
  const harness = createHarness();

  harness.controller.open();

  assert.equal(harness.ui.editingStyle.id, null);
  assert.equal(harness.ui.editingStyle.handle, "");
  assert.equal(harness.els.skillBuilderModalTitle.textContent, "新建执笔人");
  assert.match(harness.els.skillBuilderModeLabel.textContent, /拖入同类正式文档/);
  assert.equal(harness.els.saveStyleBtn.hidden, true);
  assert.equal(harness.els.deleteStyleBtn.hidden, true);
});

test("custom category state expands when custom is selected or loaded", () => {
  const harness = createHarness();

  harness.controller.updateCategoryCustomState("活动方案");

  assert.equal(harness.els.skillCategorySelect.value, "自定义");
  assert.equal(harness.els.skillCustomCategoryInput.value, "活动方案");
  assert.equal(harness.els.skillCustomCategoryField.hidden, false);

  harness.els.skillCategorySelect.value = "公文写作";
  harness.controller.updateCategoryCustomState("公文写作");
  assert.equal(harness.els.skillCustomCategoryField.hidden, true);
});

test("document picker only exposes active documents with content", () => {
  const harness = createHarness();

  harness.controller.renderDocumentPicker();

  assert.equal(harness.els.skillSourceDocSelect.disabled, false);
  assert.equal(harness.els.addSourceDocsToSkillBtn.disabled, false);
  assert.match(harness.els.skillSourceDocSelect.innerHTML, /doc-1/);
  assert.doesNotMatch(harness.els.skillSourceDocSelect.innerHTML, /doc-2/);
  assert.doesNotMatch(harness.els.skillSourceDocSelect.innerHTML, /doc-3/);
});

test("adding selected workspace documents creates training examples without duplicates", () => {
  const harness = createHarness();
  harness.ui.editingStyle = { id: "skill-1", examples: [{ sourceDocId: "doc-9", name: "旧.txt" }] };
  harness.els.skillSourceDocSelect.selectedOptions = [{ value: "doc-1" }, { value: "doc-1" }];

  const added = harness.controller.addSelectedDocsAsExamples();

  assert.equal(added, 1);
  assert.equal(harness.ui.editingStyle.examples.length, 2);
  assert.equal(harness.ui.editingStyle.examples[1].sourceDocId, "doc-1");
  assert.equal(harness.ui.editingStyle.examples[1].importedFrom, "workspace-doc");
  assert.equal(harness.renderedExamples, 1);
  assert.equal(harness.renderedDetailExamples, 1);
  assert.equal(harness.toasts.at(-1).message, "已加入 1 份文档库样本");

  const duplicate = harness.controller.addSelectedDocsAsExamples();
  assert.equal(duplicate, 0);
  assert.equal(harness.toasts.at(-1).message, "所选文档已在训练样本中");
});

test("bindEvents wires modal controls and draft field syncing", () => {
  const calls = [];
  const harness = createHarness({
    summarizeStyle: () => calls.push("summarize"),
    saveStyle: () => calls.push("save"),
    deleteStyle: () => calls.push("delete"),
  });
  harness.ui.editingStyle = { name: "", handle: "", category: "", enabled: true };

  harness.controller.bindEvents();

  assert.equal(harness.dropBound, 1);
  harness.els.styleNameInput.value = "会议纪要";
  harness.els.styleNameInput.listeners.input();
  assert.equal(harness.ui.editingStyle.name, "会议纪要");
  assert.equal(harness.ui.editingStyle.handle, "会议纪要");
  assert.equal(harness.els.skillHandleInput.value, "会议纪要");

  harness.els.skillCategorySelect.value = "自定义";
  harness.els.skillCustomCategoryInput.value = "材料复盘";
  harness.els.skillCategorySelect.listeners.change();
  assert.equal(harness.ui.editingStyle.category, "材料复盘");
  assert.equal(harness.els.skillCustomCategoryInput.focusCount, 1);

  harness.els.skillEnabledInput.checked = false;
  harness.els.skillEnabledInput.listeners.change();
  assert.equal(harness.ui.editingStyle.enabled, false);
  assert.deepEqual(harness.events.slice(-2), [EVENTS.RENDER_STYLE_SELECT, EVENTS.RENDER_STYLE_LIST]);

  harness.els.summarizeStyleBtn.listeners.click();
  harness.els.saveStyleBtn.listeners.click();
  harness.els.deleteStyleBtn.listeners.click();
  assert.deepEqual(calls, ["summarize", "save", "delete"]);
});

test("modal keydown traps tab focus and escape closes with focus restore", () => {
  const first = element();
  const last = element();
  const returnFocus = element();
  const harness = createHarness({ activeElement: first, focusable: [first, last] });
  harness.ui.skillBuilderReturnFocus = returnFocus;
  harness.els.skillBuilderModal.hidden = false;

  harness.controller.handleKeydown({
    key: "Tab",
    shiftKey: true,
    preventDefault() {
      this.prevented = true;
    },
  });
  assert.equal(last.focusCount, 1);

  harness.documentState.activeElement = last;
  harness.controller.handleKeydown({
    key: "Tab",
    shiftKey: false,
    preventDefault() {
      this.prevented = true;
    },
  });
  assert.equal(first.focusCount, 1);

  harness.controller.handleKeydown({
    key: "Escape",
    preventDefault() {
      this.prevented = true;
    },
  });
  assert.equal(harness.els.skillBuilderModal.hidden, true);
  assert.equal(returnFocus.focusCount, 1);
});
