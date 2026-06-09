import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspacePersistenceController } from "../src/core/workspacePersistenceController.js";

function createHarness(overrides = {}) {
  const calls = [];
  const state = overrides.state || {
    docs: [{ id: "doc-1", title: "工作汇报", folderId: "folder-1" }],
    folders: [{ id: "folder-1", name: "材料库", kind: "tag" }],
    styles: [{ id: "style-1", name: "通知执笔人", handle: "notice" }],
  };
  const ui = overrides.ui || {
    selectedFolderId: "folder-1",
    selectedDocId: "doc-1",
    persistPromise: Promise.resolve(),
  };
  const els = overrides.els || { storageLabel: { textContent: "" } };
  const controller = createWorkspacePersistenceController({
    state,
    ui,
    els,
    toast: (message, tone = "info") => calls.push(["toast", message, tone]),
    clone: (value) => JSON.parse(JSON.stringify(value)),
    logger: {
      error: (...args) => calls.push(["error", ...args]),
      warn: (...args) => calls.push(["warn", ...args]),
    },
    readWorkspaceState: overrides.readWorkspaceState || (async () => null),
    writeWorkspaceState: overrides.writeWorkspaceState || (async (snapshot) => calls.push(["write-indexeddb", snapshot])),
    readStorageBootstrap: overrides.readStorageBootstrap || (() => null),
    writeStorageBootstrap: overrides.writeStorageBootstrap || ((snapshot, mode = "indexedDB") => calls.push(["write-bootstrap", snapshot, mode])),
    clearLegacyLocalStorageState: overrides.clearLegacyLocalStorageState || (() => calls.push(["clear-legacy"])),
    readLegacyLocalStorageState: overrides.readLegacyLocalStorageState || (() => null),
    writeLegacyLocalStorageState: overrides.writeLegacyLocalStorageState || ((snapshot) => calls.push(["write-legacy", snapshot])),
    shouldPreferLocalStorageFallback: overrides.shouldPreferLocalStorageFallback || ((bootstrap) => bootstrap?.storage === "localStorage"),
  });

  return { controller, calls, state, ui, els };
}

test("persist writes the current selection to IndexedDB and clears legacy storage", async () => {
  const { controller, calls, state, ui } = createHarness();

  await controller.persist();

  assert.equal(state.selectedFolderId, "folder-1");
  assert.equal(state.selectedDocId, "doc-1");
  assert.equal(calls[0][0], "write-indexeddb");
  assert.equal(calls[0][1].selectedDocId, "doc-1");
  assert.equal(calls[1][0], "write-bootstrap");
  assert.equal(calls[1][2], "indexedDB");
  assert.deepEqual(calls[2], ["clear-legacy"]);
  assert.equal(ui.storageMode, "indexedDB");
});

test("persist falls back to localStorage when IndexedDB writes fail", async () => {
  const { controller, calls, ui } = createHarness({
    writeWorkspaceState: async () => {
      throw new Error("quota");
    },
  });

  await controller.persist();

  assert.equal(calls.some(([type]) => type === "error"), true);
  const legacyWrite = calls.find(([type]) => type === "write-legacy");
  assert.ok(legacyWrite);
  const bootstrapWrite = calls.find(([type, _snapshot, mode]) => type === "write-bootstrap" && mode === "localStorage");
  assert.ok(bootstrapWrite);
  assert.equal(ui.storageMode, "localStorage");
});

test("fallback storage failure shows a clear user-facing error", () => {
  const { controller, calls } = createHarness({
    writeLegacyLocalStorageState: () => {
      throw new Error("local quota");
    },
  });

  const ok = controller.tryLocalStorageFallback({ docs: [] });

  assert.equal(ok, false);
  assert.deepEqual(calls.at(-1), [
    "toast",
    "本机存储空间不足，部分最新更改可能无法保存。请导出备份或减少大型样本文件。",
    "error",
  ]);
});

test("fallback storage requires both snapshot and bootstrap writes", () => {
  const snapshotMissing = createHarness({
    writeLegacyLocalStorageState: () => false,
  });
  assert.equal(snapshotMissing.controller.tryLocalStorageFallback({ docs: [] }), false);
  assert.equal(snapshotMissing.calls.at(-1)[0], "toast");

  const bootstrapMissing = createHarness({
    writeStorageBootstrap: () => false,
  });
  assert.equal(bootstrapMissing.controller.tryLocalStorageFallback({ docs: [] }), false);
  assert.equal(bootstrapMissing.calls.at(-1)[0], "toast");
});

test("hydrateState prefers explicit localStorage fallback bootstrap data", async () => {
  const legacy = {
    selectedFolderId: "all",
    selectedDocId: "legacy-doc",
    docs: [{ id: "legacy-doc", title: "旧文档" }],
    folders: [],
  };
  const { controller, state, ui, els } = createHarness({
    readStorageBootstrap: () => ({ storage: "localStorage" }),
    readLegacyLocalStorageState: () => legacy,
  });

  await controller.hydrateState();

  assert.equal(state.selectedDocId, "legacy-doc");
  assert.equal(ui.selectedFolderId, "all");
  assert.equal(ui.selectedDocId, "legacy-doc");
  assert.equal(ui.storageMode, "localStorage");
  assert.equal(els.storageLabel.textContent, "本机文档库（localStorage 兜底）");
  assert.match(els.storageLabel.title, /localStorage 兜底/);
});

test("loadState migrates legacy localStorage data when IndexedDB is empty", async () => {
  const legacy = { docs: [{ id: "doc-old", title: "旧文档" }], folders: [] };
  const { controller, calls } = createHarness({
    readWorkspaceState: async () => null,
    readLegacyLocalStorageState: () => legacy,
  });

  const loaded = await controller.loadState();

  assert.deepEqual(loaded, legacy);
  assert.equal(calls[0][0], "write-indexeddb");
  assert.equal(calls[1][0], "write-bootstrap");
  assert.equal(calls[2][0], "clear-legacy");
});

test("loadState keeps localStorage mode when legacy migration fails", async () => {
  const legacy = { docs: [{ id: "doc-old", title: "旧文档" }], folders: [] };
  const { controller, ui } = createHarness({
    readWorkspaceState: async () => null,
    readLegacyLocalStorageState: () => legacy,
    writeWorkspaceState: async () => {
      throw new Error("quota");
    },
  });

  const loaded = await controller.loadState();

  assert.deepEqual(loaded, legacy);
  assert.equal(ui.storageMode, "localStorage");
  assert.match(controller.getStorageRootLocation(), /localStorage 兜底/);
});

test("location helpers keep document, writer, training, API, and download paths consistent", () => {
  const { controller } = createHarness({
    state: {
      folders: [
        { id: "real-folder", name: "校办资料", kind: "real" },
        { id: "tag-folder", name: "会议材料", kind: "tag" },
      ],
      docs: [],
      styles: [],
    },
  });

  assert.equal(controller.getStorageRootLocation(), "本机浏览器存储 / 摹文拟笔工作台");
  assert.equal(
    controller.getFolderLocation({ id: "real-folder", name: "校办资料", kind: "real" }),
    "本机真实文件夹 / 校办资料（浏览器授权目录）",
  );
  assert.equal(
    controller.getDocumentLocation({ title: "会议纪要", folderId: "tag-folder" }),
    "本机浏览器存储 / 摹文拟笔工作台 / 文档库 / 会议材料 / 会议纪要",
  );
  assert.equal(controller.getSkillLocation({ name: "会议纪要执笔人", handle: "meeting" }), "本机浏览器存储 / 摹文拟笔工作台 / 执笔人库 / @meeting");
  assert.equal(controller.getSkillTrainingLocation({ handle: "meeting" }), "本机浏览器存储 / 摹文拟笔工作台 / 执笔人库 / @meeting / 训练文本");
  assert.equal(controller.getApiSettingsLocation(), "本机浏览器存储 / 摹文拟笔工作台 / AI接口配置");
  assert.equal(controller.getDownloadLocation("backup.json"), "浏览器下载目录 / backup.json");
});
