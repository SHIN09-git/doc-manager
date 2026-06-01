import assert from "node:assert/strict";
import test from "node:test";
import { createSkillMentionController } from "../src/modules/skills/skillMentionController.js";

function createClassList() {
  const values = new Set();
  return {
    contains(name) {
      return values.has(name);
    },
    toggle(name, active) {
      if (active) values.add(name);
      else values.delete(name);
    },
  };
}

function createTextarea(value = "") {
  return {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    listeners: {},
    focused: false,
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
    getBoundingClientRect() {
      return { left: 20, top: 40 };
    },
  };
}

function createMentionPanel() {
  return {
    hidden: true,
    style: {},
    attrs: {},
    buttons: [],
    listeners: {},
    _innerHTML: "",
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    querySelectorAll(selector) {
      return selector === "[data-insert-skill]" ? this.buttons : [];
    },
    set innerHTML(value) {
      this._innerHTML = value;
      this.buttons = Array.from(value.matchAll(/id="([^"]+)"[\s\S]*?data-insert-skill="([^"]*)"/g)).map(
        ([, id, skillId]) => createMentionButton(id, skillId),
      );
    },
    get innerHTML() {
      return this._innerHTML;
    },
  };
}

function createMentionButton(id, skillId) {
  return {
    id,
    dataset: { insertSkill: skillId },
    attrs: {},
    classList: createClassList(),
    closest(selector) {
      return selector === "[data-insert-skill]" ? this : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    scrollIntoView() {},
  };
}

function createDocumentRef() {
  return {
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createHarness(options = {}) {
  const generatePrompt = createTextarea(options.prompt || "");
  const contentEditor = createTextarea(options.content || "");
  const panel = createMentionPanel();
  const documentState = createDocumentRef();
  const ui = {};
  const calls = [];
  const controller = createSkillMentionController({
    state: {
      styles: options.styles || [
        { id: "notice", name: "Notice Writer", handle: "notice", category: "docs", description: "Formal notices", enabled: true },
        { id: "summary", name: "Summary Writer", handle: "summary", category: "docs", description: "Concise summaries", enabled: true },
        { id: "disabled", name: "Disabled", handle: "disabled", category: "docs", enabled: false },
      ],
    },
    ui,
    els: { generatePrompt, contentEditor, skillMentionPanel: panel },
    isSkillEnabled: (skill) => skill.enabled !== false,
    recordEditorUndoPoint: () => calls.push("undo"),
    saveEditor: (showToast) => calls.push(["save", showToast]),
    documentRef: () => documentState,
    windowRef: () => ({ innerHeight: 720 }),
  });
  return { controller, generatePrompt, contentEditor, panel, documentState, ui, calls };
}

test("getCurrentMention detects the handle query before the cursor", () => {
  const harness = createHarness();
  const textarea = createTextarea("请使用 @not");
  assert.deepEqual(harness.controller.getCurrentMention(textarea), {
    start: 4,
    end: 8,
    query: "not",
  });

  textarea.value = "email@example.com";
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
  assert.equal(harness.controller.getCurrentMention(textarea), null);
});

test("showFor renders enabled matching writers and prepares listbox semantics", () => {
  const harness = createHarness({ prompt: "Use @sum" });
  harness.controller.bindEvents();

  const matches = harness.controller.showFor(harness.generatePrompt);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "summary");
  assert.equal(harness.panel.hidden, false);
  assert.equal(harness.panel.attrs.role, "listbox");
  assert.equal(harness.panel.buttons[0].attrs["aria-selected"], "true");
  assert.equal(harness.ui.mentionRange.query, "sum");
});

test("keyboard navigation inserts the highlighted writer into the prompt", () => {
  const harness = createHarness({ prompt: "Use @" });
  harness.controller.showFor(harness.generatePrompt);

  harness.controller.handleTargetKeydown(createKeyboardEvent("ArrowDown"), harness.generatePrompt);
  assert.equal(harness.panel.buttons[1].classList.contains("is-active"), true);
  harness.controller.handleTargetKeydown(createKeyboardEvent("Enter"), harness.generatePrompt);

  assert.equal(harness.generatePrompt.value, "Use @summary ");
  assert.equal(harness.generatePrompt.focused, true);
  assert.equal(harness.panel.hidden, true);
});

test("inserting into the editor records undo and saves without a toast", () => {
  const harness = createHarness({ content: "改写 @not" });
  harness.controller.showFor(harness.contentEditor);

  assert.equal(harness.controller.insert("notice"), true);

  assert.equal(harness.contentEditor.value, "改写 @notice ");
  assert.deepEqual(harness.calls, ["undo", ["save", false]]);
});

test("panel mouse selection and outside click close behave predictably", () => {
  const harness = createHarness({ prompt: "Use @not" });
  harness.controller.bindEvents();
  harness.controller.showFor(harness.generatePrompt);

  const event = {
    target: harness.panel.buttons[0],
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  harness.panel.listeners.mousedown(event);
  assert.equal(event.prevented, true);
  assert.equal(harness.generatePrompt.value, "Use @notice ");

  harness.generatePrompt.value = "Use @sum";
  harness.generatePrompt.selectionStart = harness.generatePrompt.value.length;
  harness.generatePrompt.selectionEnd = harness.generatePrompt.value.length;
  harness.controller.showFor(harness.generatePrompt);
  assert.equal(harness.panel.hidden, false);
  harness.documentState.listeners.click({
    target: {
      closest: () => null,
      matches: () => false,
    },
  });
  assert.equal(harness.panel.hidden, true);
});

function createKeyboardEvent(key) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}
