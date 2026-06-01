import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/core/eventBus.js";
import {
  createDocumentTypeController,
  normalizeCustomType,
  normalizeCustomTypes,
} from "../src/modules/documents/documentTypeController.js";

function element(initial = {}) {
  return {
    value: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    title: "",
    listeners: {},
    ...initial,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createHarness(options = {}) {
  const calls = [];
  const events = [];
  const toasts = [];
  const prompts = [...(options.prompts || [])];
  const confirms = [...(options.confirms || [])];
  const state = {
    customTypes: [],
    docs: [],
    ...options.state,
  };
  const els = {
    typeSelect: element({ value: options.selectedType || "notice" }),
    customTypeActions: element({ hidden: true }),
    addTypeBtn: element(),
    renameTypeBtn: element(),
    deleteTypeBtn: element(),
    ...options.els,
  };
  const controller = createDocumentTypeController({
    state,
    els,
    toast: (message, type) => toasts.push({ message, type }),
    saveEditor: (silent) => calls.push(["save", silent]),
    queueEditorSave: () => calls.push(["queue-save"]),
    persist: () => calls.push(["persist"]),
    eventBus: { emit: (eventName) => events.push(eventName) },
    getCurrentDoc: () => options.currentDoc || null,
    windowRef: {
      prompt: () => prompts.shift(),
      confirm: () => (confirms.length ? confirms.shift() : true),
    },
  });
  return { controller, state, els, calls, events, toasts, prompts, confirms };
}

test("normalizeCustomType keeps legacy data safe and bounded", () => {
  const type = normalizeCustomType(
    { id: "notice", name: "  一个很长很长很长很长很长的类型名称  ", structure: "" },
    { createId: () => "id-1", now: () => "2026-01-01T00:00:00.000Z" },
  );

  assert.equal(type.id, "custom-type-id-1");
  assert.ok(type.name.length <= 24);
  assert.equal(type.name, "一个很长很长很长很长很长的类型名称");
  assert.equal(type.structure, "按该自定义类型的写作场景组织结构，保持表达清晰规范");
  assert.equal(type.createdAt, "2026-01-01T00:00:00.000Z");
});

test("normalizeCustomTypes deduplicates ids without dropping valid legacy types", () => {
  let id = 0;
  const types = normalizeCustomTypes(
    [
      { id: "notice", name: "调研报告" },
      { id: "same", name: "活动复盘" },
      { id: "same", name: "制度说明" },
      { id: "", name: "" },
    ],
    { createId: () => `id-${(id += 1)}`, now: () => "2026-01-01T00:00:00.000Z" },
  );

  assert.deepEqual(types.map((type) => type.name), ["调研报告", "活动复盘", "制度说明"]);
  assert.equal(new Set(types.map((type) => type.id)).size, 3);
  assert.ok(!types.some((type) => type.id === "notice"));
});

test("renderTypeSelect shows built-in and custom groups with scoped actions", () => {
  const harness = createHarness({
    state: { customTypes: [{ id: "type-research", name: "调研报告", structure: "背景、问题、建议" }] },
  });

  harness.controller.renderTypeSelect("type-research");

  assert.equal(harness.els.typeSelect.value, "type-research");
  assert.match(harness.els.typeSelect.innerHTML, /内置类型/);
  assert.match(harness.els.typeSelect.innerHTML, /自定义类型/);
  assert.match(harness.els.typeSelect.innerHTML, /调研报告/);
  assert.equal(harness.els.customTypeActions.hidden, false);
  assert.equal(harness.els.renameTypeBtn.disabled, false);
  assert.equal(harness.els.deleteTypeBtn.disabled, false);

  harness.controller.renderTypeSelect("custom");

  assert.equal(harness.els.typeSelect.value, "custom");
  assert.equal(harness.els.customTypeActions.hidden, false);
  assert.equal(harness.els.renameTypeBtn.disabled, true);
  assert.equal(harness.els.deleteTypeBtn.disabled, true);
});

test("bindEvents wires type changes and custom type buttons", () => {
  const harness = createHarness({ prompts: ["活动复盘", "背景、过程、成效、改进"] });

  harness.controller.bindEvents();
  harness.els.typeSelect.listeners.change();
  harness.els.addTypeBtn.listeners.click();

  assert.deepEqual(harness.calls, [["queue-save"], ["save", false], ["persist"]]);
  assert.equal(harness.state.customTypes[0].name, "活动复盘");
  assert.deepEqual(harness.events, [EVENTS.RENDER_DOC_LIST]);
});

test("addCustomType blocks duplicate names before mutating state", () => {
  const harness = createHarness({
    state: { customTypes: [{ id: "type-old", name: "活动复盘", structure: "旧结构" }] },
    prompts: ["活动复盘"],
  });

  const result = harness.controller.addCustomType();

  assert.equal(result, null);
  assert.equal(harness.state.customTypes.length, 1);
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.toasts[0].type, "warn");
});

test("renameCustomType updates selected custom type and keeps built-ins protected", () => {
  const harness = createHarness({
    selectedType: "type-old",
    state: { customTypes: [{ id: "type-old", name: "旧类型", structure: "旧结构" }] },
    prompts: ["新类型", "新结构"],
  });

  const renamed = harness.controller.renameCustomType();

  assert.equal(renamed.name, "新类型");
  assert.equal(renamed.structure, "新结构");
  assert.deepEqual(harness.calls, [["persist"]]);
  assert.deepEqual(harness.events, [EVENTS.RENDER_DOC_LIST]);

  const builtInHarness = createHarness({ selectedType: "custom" });
  assert.equal(builtInHarness.controller.renameCustomType(), null);
  assert.equal(builtInHarness.toasts[0].type, "warn");
});

test("deleteCustomType remaps affected documents to the built-in custom type", () => {
  const harness = createHarness({
    selectedType: "type-old",
    state: {
      customTypes: [{ id: "type-old", name: "旧类型", structure: "旧结构" }],
      docs: [
        { id: "doc-1", type: "type-old" },
        { id: "doc-2", type: "notice" },
      ],
    },
    confirms: [true],
  });

  const deleted = harness.controller.deleteCustomType();

  assert.equal(deleted, true);
  assert.deepEqual(harness.state.customTypes, []);
  assert.equal(harness.state.docs[0].type, "custom");
  assert.equal(harness.state.docs[1].type, "notice");
  assert.deepEqual(harness.calls, [["save", false], ["persist"]]);
  assert.deepEqual(harness.events, [EVENTS.RENDER_ALL]);
});
