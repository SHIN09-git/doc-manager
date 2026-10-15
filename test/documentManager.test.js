import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocumentManager,
  createWorkspaceBackupPayload,
  parseWorkspaceBackup,
} from "../src/modules/documents/documentManager.js";

function createHarness(options = {}) {
  const state = {
    settings: { apiKey: "current-local-key" },
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
  const restoredSnapshots = [];
  const downloads = [];
  const exportPrompts = [];
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
    downloadBlob: (fileName, blob) => {
      downloads.push({ fileName, blob });
      return true;
    },
    confirmExport: (message) => {
      exportPrompts.push(message);
      return options.confirmExport ?? true;
    },
    restoreWorkspaceState: (snapshot) => {
      restoredSnapshots.push(snapshot);
      Object.assign(state, snapshot);
    },
    hasActiveTasks: () => Boolean(options.activeTasks),
    confirmRestore: () => true,
    toast: (message) => toasts.push(message),
  });
  return { manager, state, ui, events, toasts, restoredSnapshots, downloads, exportPrompts };
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

test("workspace backups exclude local API keys and cloud session state", () => {
  const payload = createWorkspaceBackupPayload({
    folders: [],
    customTypes: [],
    styles: [],
    docs: [],
    settings: { baseUrl: "https://api.example.com", apiKey: "sk-secret" },
    cloud: { authenticated: true, user: { email: "owner@example.com" } },
  }, "2026-07-17T00:00:00.000Z");

  assert.equal(payload.version, 2);
  assert.equal(payload.data.settings.apiKey, "");
  assert.equal("cloud" in payload.data, false);
  assert.doesNotMatch(JSON.stringify(payload), /sk-secret|owner@example\.com/);
});

test("workspace backup parser accepts legacy backups but strips embedded API keys", () => {
  const parsed = parseWorkspaceBackup(JSON.stringify({
    app: "mowen-nibi-workbench",
    version: 1,
    data: {
      folders: [{ id: "folder-1" }],
      styles: [{ id: "writer-1" }],
      docs: [{ id: "doc-1" }],
      settings: { apiKey: "legacy-secret", model: "test" },
      cloud: { authenticated: true },
    },
  }));

  assert.equal(parsed.settings.apiKey, "");
  assert.equal(parsed.settings.model, "test");
  assert.equal("cloud" in parsed, false);
});

test("workspace backup restore replaces local state and reports counts", async () => {
  const harness = createHarness();
  const payload = createWorkspaceBackupPayload({
    folders: [{ id: "restored-folder" }],
    customTypes: [],
    styles: [{ id: "restored-writer" }],
    docs: [{ id: "restored-doc", title: "恢复文档", content: "正文" }],
    settings: {},
  });
  const text = JSON.stringify(payload);

  const result = await harness.manager.restoreWorkspaceBackupFile({
    name: "backup.json",
    size: text.length,
    text: async () => text,
  });

  assert.deepEqual(result, { docCount: 1, writerCount: 1 });
  assert.equal(harness.restoredSnapshots.length, 1);
  assert.equal(harness.state.docs[0].id, "restored-doc");
  assert.equal(harness.state.settings.apiKey, "current-local-key");
  assert.match(harness.toasts.at(-1), /已恢复本机工作区/);
});

test("workspace backup restore refuses to race an active generation task", async () => {
  const harness = createHarness({ activeTasks: true });

  await assert.rejects(
    () => harness.manager.restoreWorkspaceBackupFile({ size: 10, text: async () => "{}" }),
    /请先取消正在进行的生成或导入任务/,
  );
});

test("workspace backup parser rejects unrelated or incomplete JSON", () => {
  assert.throws(() => parseWorkspaceBackup("not json"), /JSON 格式/);
  assert.throws(() => parseWorkspaceBackup({ app: "other", version: 1, data: {} }), /不是摹文拟笔/);
  assert.throws(() => parseWorkspaceBackup({ app: "mowen-nibi-workbench", version: 2, data: {} }), /结构不完整/);
  assert.throws(() => parseWorkspaceBackup({
    app: "mowen-nibi-workbench",
    version: 2,
    data: { folders: [], styles: [], docs: ["invalid"] },
  }), /无效的工作区项目/);
});

test("exportCurrentDocument asks before exporting a document with unfilled placeholders", async () => {
  const { manager, state, downloads, exportPrompts, toasts } = createHarness({ confirmExport: false });
  state.docs[0].content = "请于【培训时间】到【培训地点】报到，【培训时间】不变。";

  const result = await manager.exportCurrentDocument();

  assert.equal(result, null);
  assert.equal(downloads.length, 0);
  assert.match(exportPrompts[0], /还有 3 处待填内容（如【培训时间】、【培训地点】）/);
  assert.match(toasts.at(-1), /已取消导出/);
});

test("exportCurrentDocument skips the reminder when nothing is left to fill", async () => {
  const { manager, downloads, exportPrompts, toasts } = createHarness();

  const fileName = await manager.exportCurrentDocument();

  assert.equal(fileName, "待删除文档.docx");
  assert.equal(downloads.length, 1);
  assert.equal(exportPrompts.length, 0);
  assert.match(toasts.at(-1), /已按通用版式导出/);
});

test("exportCurrentDocument uses the saved layout preference or an explicit layout", async () => {
  const { manager, state, downloads, toasts } = createHarness();
  state.settings.exportLayout = "gongwen";

  await manager.exportCurrentDocument();
  assert.match(toasts.at(-1), /已按公文版式（GB\/T 9704）导出/);

  await manager.exportCurrentDocument({ layout: "standard" });
  assert.match(toasts.at(-1), /已按通用版式导出/);

  await manager.exportCurrentDocument({ layout: "unknown" });
  assert.match(toasts.at(-1), /已按通用版式导出/);
  assert.equal(downloads.length, 3);
});
