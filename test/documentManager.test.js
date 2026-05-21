import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentManager } from "../src/modules/documents/documentManager.js";

function createHarness() {
  const state = {
    folders: [{ id: "folder-1", name: "默认文件夹" }],
    styles: [],
    docs: [
      {
        id: "doc-1",
        title: "待删除文档",
        type: "notice",
        folderId: "folder-1",
        content: "正文",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "doc-2",
        title: "保留文档",
        type: "notice",
        folderId: "folder-1",
        content: "正文",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
  const ui = { selectedDocId: "doc-1", selectedFolderId: "all" };
  const events = [];
  const toasts = [];
  const manager = createDocumentManager({
    state,
    ui,
    saveEditor: () => {},
    persist: () => {},
    eventBus: { emit: (eventName) => events.push(eventName) },
    focusTitleInput: () => {},
    createDefaultFolder: () => "folder-1",
    getFolderLocation: (folder) => folder?.name || "默认文件夹",
    getDocumentLocation: (doc) => `文档库/${doc?.title}`,
    getDownloadLocation: (fileName) => `下载/${fileName}`,
    getType: () => ({ name: "通知" }),
    downloadBlob: () => {},
    toast: (message) => toasts.push(message),
  });
  return { manager, state, ui, events, toasts };
}

test("deleteCurrentDocument moves document to trash instead of removing it", () => {
  const { manager, state, ui, toasts } = createHarness();

  const deleted = manager.deleteCurrentDocument(() => true);

  assert.equal(deleted, true);
  assert.equal(state.docs.length, 2);
  assert.equal(Boolean(state.docs.find((doc) => doc.id === "doc-1").deletedAt), true);
  assert.equal(ui.selectedDocId, "doc-2");
  assert.match(toasts.at(-1), /移入垃圾箱/);
});

test("restoreDocument returns a trashed document to active view", () => {
  const { manager, state, ui } = createHarness();
  manager.deleteCurrentDocument(() => true);

  const restored = manager.restoreDocument("doc-1");

  assert.equal(restored.id, "doc-1");
  assert.equal(restored.deletedAt, "");
  assert.equal(ui.selectedDocId, "doc-1");
});

test("moveDocument reorders active documents explicitly", () => {
  const { manager, state } = createHarness();
  state.docs.push({
    id: "doc-3",
    title: "第三份文档",
    type: "notice",
    folderId: "folder-1",
    content: "正文",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(manager.moveDocument("doc-3", "doc-1", "before"), true);
  assert.deepEqual(state.docs.map((doc) => doc.id), ["doc-3", "doc-1", "doc-2"]);

  assert.equal(manager.moveDocumentToBottom("doc-3"), true);
  assert.deepEqual(state.docs.map((doc) => doc.id), ["doc-1", "doc-2", "doc-3"]);
});

test("permanentlyDeleteDocument removes only trashed documents", () => {
  const { manager, state, ui } = createHarness();

  assert.equal(manager.permanentlyDeleteDocument("doc-1", () => true), false);
  manager.deleteCurrentDocument(() => true);
  ui.selectedDocId = "doc-1";
  const removed = manager.permanentlyDeleteDocument("doc-1", () => true);

  assert.equal(removed, true);
  assert.equal(state.docs.some((doc) => doc.id === "doc-1"), false);
  assert.equal(state.docs.length, 1);
});

test("trash bulk actions restore and clear all deleted documents", () => {
  const { manager, state } = createHarness();
  manager.deleteCurrentDocument(() => true);

  assert.equal(manager.restoreAllDocumentsFromTrash(), 1);
  assert.equal(state.docs.filter((doc) => doc.deletedAt).length, 0);

  manager.deleteCurrentDocument(() => true);
  assert.equal(manager.clearTrashDocuments(() => true), 1);
  assert.equal(state.docs.some((doc) => doc.id === "doc-1"), false);
});
