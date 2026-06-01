import assert from "node:assert/strict";
import test from "node:test";
import { createImportDropController } from "../src/modules/imports/importDropController.js";

function createTarget() {
  const classes = new Set();
  return {
    listeners: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createFileEvent(files = [{ name: "demo.txt" }]) {
  return {
    prevented: false,
    stopped: false,
    dataTransfer: { types: ["Files"], files },
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
}

function createDocumentEvent(docId = "doc-1") {
  return {
    prevented: false,
    stopped: false,
    dataTransfer: {
      types: ["application/x-mowen-doc-id"],
      dropEffect: "",
      getData(type) {
        return type === "application/x-mowen-doc-id" ? docId : "";
      },
    },
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
}

function createHarness(options = {}) {
  const calls = [];
  const windowListeners = {};
  const els = {
    skillBuilderModal: { hidden: options.skillBuilderOpen === false },
  };
  const controller = createImportDropController({
    els,
    documentRef: () => ({
      querySelector: () => options.activePanelId ? { id: options.activePanelId } : null,
    }),
    windowRef: () => ({
      addEventListener: (type, handler) => {
        windowListeners[type] = handler;
      },
    }),
    resolveDropTarget: (panelId, context) => options.resolveDropTarget?.(panelId, context) || panelId || "document",
    importDocumentFiles: async (files) => calls.push(["document", files.map((file) => file.name)]),
    importStyleDropFiles: async (files) => calls.push(["style", files.map((file) => file.name)]),
    importPptPromptFiles: async (files) => calls.push(["ppt", files.map((file) => file.name)]),
  });
  return { controller, calls, windowListeners, els };
}

test("setupFileDrop highlights file targets and forwards dropped files", async () => {
  const target = createTarget();
  const handled = [];
  const controller = createImportDropController();

  assert.equal(controller.setupFileDrop(target, async (files) => handled.push(files)), true);
  const dragEvent = createFileEvent();
  target.listeners.dragover(dragEvent);
  assert.equal(dragEvent.prevented, true);
  assert.equal(target.classList.contains("drag-over"), true);

  const dropEvent = createFileEvent([{ name: "a.txt" }, { name: "b.md" }]);
  await target.listeners.drop(dropEvent);
  assert.equal(dropEvent.prevented, true);
  assert.equal(dropEvent.stopped, true);
  assert.equal(target.classList.contains("drag-over"), false);
  assert.deepEqual(handled[0].map((file) => file.name), ["a.txt", "b.md"]);
});

test("setupDocumentDrop accepts document card drags and forwards the document id", () => {
  const target = createTarget();
  const handled = [];
  const controller = createImportDropController();

  assert.equal(controller.setupDocumentDrop(target, (docId) => handled.push(docId)), true);
  const dragEvent = createDocumentEvent("doc-2");
  target.listeners.dragover(dragEvent);
  assert.equal(dragEvent.prevented, true);
  assert.equal(dragEvent.dataTransfer.dropEffect, "copy");
  assert.equal(target.classList.contains("drag-over"), true);

  const dropEvent = createDocumentEvent("doc-2");
  target.listeners.drop(dropEvent);
  assert.equal(dropEvent.prevented, true);
  assert.equal(dropEvent.stopped, true);
  assert.deepEqual(handled, ["doc-2"]);
  assert.equal(target.classList.contains("drag-over"), false);
});

test("importFilesFromGlobalDrop routes files by active panel and builder modal state", async () => {
  const ppt = createHarness({ activePanelId: "ppt" });
  assert.equal(await ppt.controller.importFilesFromGlobalDrop([{ name: "slides.pptx" }]), "ppt");
  assert.deepEqual(ppt.calls, [["ppt", ["slides.pptx"]]]);

  const style = createHarness({
    activePanelId: "stylePanel",
    resolveDropTarget: (_panel, context) => context.skillBuilderOpen ? "skill-builder" : "style",
  });
  assert.equal(await style.controller.importFilesFromGlobalDrop([{ name: "writer.docx" }]), "skill-builder");
  assert.deepEqual(style.calls, [["style", ["writer.docx"]]]);

  const document = createHarness({ activePanelId: "" });
  assert.equal(await document.controller.importFilesFromGlobalDrop([{ name: "notice.txt" }]), "document");
  assert.deepEqual(document.calls, [["document", ["notice.txt"]]]);
});

test("preventWindowFileNavigation blocks browser file navigation and imports on drop", async () => {
  const harness = createHarness({ activePanelId: "document" });
  harness.controller.preventWindowFileNavigation();

  const dragEvent = createFileEvent([{ name: "ignored.txt" }]);
  await harness.windowListeners.dragover(dragEvent);
  assert.equal(dragEvent.prevented, true);
  assert.equal(harness.calls.length, 0);

  const dropEvent = createFileEvent([{ name: "notice.txt" }]);
  await harness.windowListeners.drop(dropEvent);
  assert.equal(dropEvent.prevented, true);
  assert.deepEqual(harness.calls, [["document", ["notice.txt"]]]);
});
