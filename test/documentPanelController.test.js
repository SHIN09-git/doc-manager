import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/core/eventBus.js";
import { createDocumentPanelController } from "../src/modules/documents/documentPanelController.js";

function element(initial = {}) {
  return {
    value: "",
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
  const ui = options.ui || { selectedDocId: "doc-1" };
  const els = {
    newDocBtn: element(),
    importInput: element(),
    docDropZone: element(),
    docList: element(),
    exportDocBtn: element(),
    backupBtn: element(),
    ...options.els,
  };
  const documentManager = {
    createDocument: (seed) => {
      calls.push(["create", seed]);
      return { id: "created-doc", ...seed };
    },
    duplicateCurrentDocument: () => {
      calls.push(["duplicate-current"]);
      return { id: "copy-current" };
    },
    duplicateDocument: (docId) => {
      calls.push(["duplicate", docId]);
      return { id: `${docId}-copy` };
    },
    moveDocument: (sourceId, targetId, placement) => {
      calls.push(["move", sourceId, targetId, placement]);
      return true;
    },
    moveDocumentToTop: (docId) => {
      calls.push(["top", docId]);
      return true;
    },
    moveDocumentToBottom: (docId) => {
      calls.push(["bottom", docId]);
      return true;
    },
    deleteCurrentDocument: () => {
      calls.push(["delete-current", ui.selectedDocId]);
      return true;
    },
    restoreDocument: (docId) => {
      calls.push(["restore", docId]);
      return { id: docId };
    },
    restoreAllDocumentsFromTrash: () => {
      calls.push(["restore-all"]);
      return 2;
    },
    permanentlyDeleteDocument: (docId) => {
      calls.push(["permanent-delete", docId]);
      return true;
    },
    clearTrashDocuments: () => {
      calls.push(["clear-trash"]);
      return 3;
    },
    importDocumentFiles: async (files) => {
      calls.push(["import", files.map((file) => file.name)]);
      return files.length;
    },
    exportCurrentDocument: async () => {
      calls.push(["export"]);
      if (options.exportError) throw new Error(options.exportError);
      return "当前文档.docx";
    },
    exportWorkspaceBackup: () => {
      calls.push(["backup"]);
      return "backup.json";
    },
    ...options.documentManager,
  };
  let trashBound = 0;
  let dropBound = 0;
  const controller = createDocumentPanelController({
    ui,
    els,
    documentManager,
    trashController: { bindEvents: () => { trashBound += 1; } },
    setupFileDrop: (_target, handler) => {
      dropBound += 1;
      calls.push(["drop-bound", handler.name]);
    },
    saveEditor: (silent) => calls.push(["save", silent]),
    persist: () => calls.push(["persist"]),
    eventBus: { emit: (eventName) => events.push(eventName) },
    switchMainView: (view) => calls.push(["view", view]),
    isMobileWorkspace: () => Boolean(options.mobile),
    setMobileView: (view) => calls.push(["mobile", view]),
    toast: (message, type) => toasts.push({ message, type }),
  });
  return {
    controller,
    ui,
    els,
    calls,
    events,
    toasts,
    get trashBound() {
      return trashBound;
    },
    get dropBound() {
      return dropBound;
    },
  };
}

test("document panel binds top actions, drops, and trash controller", async () => {
  const file = { name: "通知.docx" };
  const harness = createHarness();

  harness.controller.bindEvents();

  assert.equal(harness.dropBound, 2);
  assert.equal(harness.trashBound, 1);

  harness.els.newDocBtn.listeners.click();
  await harness.els.importInput.listeners.change({ target: { files: [file], value: "chosen" } });
  await harness.els.exportDocBtn.listeners.click();
  harness.els.backupBtn.listeners.click();

  assert.deepEqual(harness.calls.filter((call) => call[0] !== "drop-bound"), [
    ["view", "editor"],
    ["create", {}],
    ["import", ["通知.docx"]],
    ["export"],
    ["backup"],
  ]);
});

test("selectDocument saves current editor and opens the editor view", () => {
  const harness = createHarness({ mobile: true });

  const selected = harness.controller.selectDocument("doc-2");

  assert.equal(selected, "doc-2");
  assert.equal(harness.ui.selectedDocId, "doc-2");
  assert.deepEqual(harness.calls, [
    ["save", false],
    ["view", "editor"],
    ["mobile", "editor"],
    ["persist"],
  ]);
  assert.deepEqual(harness.events, [EVENTS.RENDER_DOC_LIST, EVENTS.RENDER_EDITOR]);
});

test("card actions delegate to document manager with the intended ids", () => {
  const harness = createHarness();

  harness.controller.duplicateDocument("doc-1");
  harness.controller.moveDocument("doc-1", "doc-2", "after");
  harness.controller.moveDocumentToTop("doc-1");
  harness.controller.moveDocumentToBottom("doc-1");
  harness.controller.deleteDocument("doc-2");
  harness.controller.restoreDocument("doc-3");
  harness.controller.restoreAllTrashDocuments();
  harness.controller.permanentlyDeleteDocument("doc-4");
  harness.controller.clearTrashDocuments();

  assert.equal(harness.ui.selectedDocId, "doc-2");
  assert.deepEqual(harness.calls, [
    ["duplicate", "doc-1"],
    ["move", "doc-1", "doc-2", "after"],
    ["top", "doc-1"],
    ["bottom", "doc-1"],
    ["delete-current", "doc-2"],
    ["restore", "doc-3"],
    ["restore-all"],
    ["permanent-delete", "doc-4"],
    ["clear-trash"],
  ]);
});

test("importDocuments resets the file input after import", async () => {
  const file = { name: "材料.md" };
  const harness = createHarness();
  const input = { files: [file], value: "C:\\fake\\材料.md" };

  const imported = await harness.controller.importDocuments({ target: input });

  assert.equal(imported, undefined);
  assert.equal(input.value, "");
  assert.deepEqual(harness.calls, [["import", ["材料.md"]]]);
});

test("exportCurrentDocument reports friendly errors", async () => {
  const harness = createHarness({ exportError: "生成失败" });

  const result = await harness.controller.exportCurrentDocument();

  assert.equal(result, null);
  assert.deepEqual(harness.calls, [["export"]]);
  assert.deepEqual(harness.toasts, [{ message: "导出 Word 文档失败：生成失败", type: "error" }]);
});
