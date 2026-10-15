import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentEditor } from "../src/modules/documents/documentEditor.js";

function createHarness({ persistResult = true } = {}) {
  const calls = [];
  const doc = {
    id: "doc-1",
    title: "旧标题",
    type: "custom",
    folderId: "folder-1",
    styleId: "",
    content: "旧正文",
  };
  const controller = createDocumentEditor({
    state: { folders: [{ id: "folder-1" }] },
    ui: { selectedDocId: "doc-1" },
    els: {
      titleInput: { value: "新标题" },
      typeSelect: { value: "notice" },
      folderSelect: { value: "folder-1" },
      styleSelect: { value: "writer-1" },
      contentEditor: { value: "新正文" },
    },
    saveDelayMs: 1,
    getCurrentDoc: () => doc,
    createDefaultFolder: () => "folder-1",
    getDocumentLocation: () => "本机文档库 / 新标题",
    getFolderById: () => ({ id: "folder-1", kind: "tag" }),
    persist: async () => persistResult,
    eventBus: { emit: (...args) => calls.push(["emit", ...args]) },
    syncDocumentToRealFolder: async () => "真实文件夹 / 新标题",
    showSaveStatus: (...args) => calls.push(["status", ...args]),
    toast: (...args) => calls.push(["toast", ...args]),
  });
  return { controller, calls, doc };
}

test("document save reports success only after persistence completes", async () => {
  const { controller, calls, doc } = createHarness();

  const saved = await controller.saveEditor(true);

  assert.equal(saved, true);
  assert.equal(doc.title, "新标题");
  assert.deepEqual(calls.filter(([type]) => type === "status").map(([, message]) => message), ["保存中", "已保存"]);
  assert.equal(calls.some(([type, message]) => type === "toast" && /本机文档库/.test(message)), true);
});

test("document save keeps a visible failure state when all persistence backends fail", async () => {
  const { controller, calls } = createHarness({ persistResult: false });

  const saved = await controller.saveEditor(true);

  assert.equal(saved, false);
  assert.deepEqual(calls.filter(([type]) => type === "status").map(([, message]) => message), ["保存中", "未保存"]);
  assert.equal(calls.some(([type]) => type === "toast"), false);
});
