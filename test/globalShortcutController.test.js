import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalShortcutController } from "../src/ui/globalShortcutController.js";

function element() {
  return {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
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

function createEvent(key, target, options = {}) {
  return {
    key,
    target,
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey),
    isComposing: Boolean(options.isComposing),
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createHarness(options = {}) {
  const calls = [];
  const documentRef = createDocumentRef();
  const els = {
    titleInput: element(),
    contentEditor: element(),
    typeSelect: element(),
    folderSelect: element(),
    styleSelect: element(),
    saveDocBtn: element(),
    undoEditBtn: element(),
    skillBuilderModal: { hidden: options.builderHidden ?? true },
    apiKeyInput: element(),
  };
  const controller = createGlobalShortcutController({
    els,
    documentRef: () => documentRef,
    editorContextMenuController: { hide: (payload) => calls.push(["hide-menu", payload]) },
    skillMentionController: { hide: () => calls.push(["hide-mention"]) },
    layoutController: { closeResponsiveInspector: () => calls.push(["close-tools"]) },
    closeSkillBuilderModal: () => calls.push(["close-builder"]),
    saveEditor: (showToast) => calls.push(["save", showToast]),
    undoEditorChange: () => calls.push(["undo"]),
  });
  return { controller, documentRef, els, calls };
}

test("bindEvents wires document keydown and exposes shortcut labels", () => {
  const harness = createHarness();

  harness.controller.bindEvents();

  assert.equal(typeof harness.documentRef.listeners.keydown, "function");
  assert.match(harness.els.saveDocBtn.attrs["aria-keyshortcuts"], /S$/);
  assert.match(harness.els.undoEditBtn.attrs["aria-keyshortcuts"], /Z$/);
});

test("escape closes global overlays and an open skill builder modal", () => {
  const harness = createHarness({ builderHidden: false });

  const handled = harness.controller.handleKeydown(createEvent("Escape", harness.els.contentEditor));

  assert.equal(handled, true);
  assert.deepEqual(harness.calls, [
    ["hide-menu", { restoreFocus: true }],
    ["hide-mention"],
    ["close-builder"],
    ["close-tools"],
  ]);
});

test("primary save shortcut only handles document editor targets", () => {
  const harness = createHarness();

  const editorEvent = createEvent("s", harness.els.titleInput, { ctrlKey: true });
  assert.equal(harness.controller.handleKeydown(editorEvent), true);
  assert.equal(editorEvent.prevented, true);
  assert.deepEqual(harness.calls, [["save", true]]);

  const apiEvent = createEvent("s", harness.els.apiKeyInput, { ctrlKey: true });
  assert.equal(harness.controller.handleKeydown(apiEvent), false);
  assert.equal(apiEvent.prevented, false);
});

test("primary undo shortcut only handles the content editor", () => {
  const harness = createHarness();

  const undoEvent = createEvent("z", harness.els.contentEditor, { metaKey: true });
  assert.equal(harness.controller.handleKeydown(undoEvent), true);
  assert.equal(undoEvent.prevented, true);
  assert.deepEqual(harness.calls, [["undo"]]);

  const redoEvent = createEvent("z", harness.els.contentEditor, { metaKey: true, shiftKey: true });
  assert.equal(harness.controller.handleKeydown(redoEvent), false);
  const titleEvent = createEvent("z", harness.els.titleInput, { ctrlKey: true });
  assert.equal(harness.controller.handleKeydown(titleEvent), false);
});

test("composition and alternate shortcuts are left to the browser", () => {
  const harness = createHarness();

  assert.equal(harness.controller.handleKeydown(createEvent("s", harness.els.contentEditor, {
    ctrlKey: true,
    isComposing: true,
  })), false);
  assert.equal(harness.controller.handleKeydown(createEvent("s", harness.els.contentEditor, {
    ctrlKey: true,
    altKey: true,
  })), false);
  assert.deepEqual(harness.calls, []);
});
