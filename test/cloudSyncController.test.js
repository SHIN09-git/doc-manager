import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/core/eventBus.js";
import { createCloudSyncController } from "../src/modules/cloud/cloudSyncController.js";

function element() {
  return {
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
  };
}

function createEls(overrides = {}) {
  return {
    cloudSaveDocBtn: element(),
    cloudPullDocsBtn: element(),
    cloudSaveWriterBtn: element(),
    cloudPullWritersBtn: element(),
    ...overrides,
  };
}

function createHarness(options = {}) {
  const state = {
    docs: [],
    folders: [{ id: "folder-1", name: "默认" }],
    styles: [],
    ...options.state,
  };
  const ui = { ...options.ui };
  const els = createEls(options.els);
  const requests = [];
  const calls = [];
  const toasts = [];
  const events = [];
  let idIndex = 0;
  const responses = options.responses || {};
  const controller = createCloudSyncController({
    state,
    ui,
    els,
    cloudRequest: async (path, requestOptions = {}) => {
      requests.push({ path, options: requestOptions });
      if (options.cloudRequest) return options.cloudRequest(path, requestOptions, requests.length);
      const response = responses[path];
      if (response instanceof Error) throw response;
      if (typeof response === "function") return response(path, requestOptions, requests.length);
      return response || {};
    },
    withLoading: async (button, label, task) => {
      calls.push(["loading", label, button]);
      return task();
    },
    persist: () => calls.push(["persist"]),
    eventBus: {
      emit: (event) => events.push(event),
    },
    toast: (message, type) => toasts.push({ message, type }),
    getCurrentDoc: () => options.getCurrentDoc?.() || state.docs.find((doc) => doc.id === ui.selectedDocId) || null,
    normalizeSkill: (style) => ({ ...style, normalized: true }),
    normalizeHandle: (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "-"),
    clone: (value) => ({ ...value }),
    createId: () => `local-${++idIndex}`,
    now: () => "2026-06-01T00:00:00.000Z",
    getCloudDocumentLocation: (document) => `云端 / 文档 / ${document.title || document.id}`,
    getCloudWriterLocation: (writer) => `云端 / 执笔人 / @${writer.handle || writer.id}`,
    windowRef: {
      prompt: () => options.promptChoice ?? "3",
    },
  });
  return { controller, state, ui, els, requests, calls, toasts, events };
}

function conflictError(remote, currentVersion = 3) {
  const error = new Error("version conflict");
  error.status = 409;
  error.payload = {
    error: {
      code: "version_conflict",
      details: { remote, current_version: currentVersion },
    },
  };
  return error;
}

test("bindEvents wires cloud sync controls once", async () => {
  const harness = createHarness({
    state: { docs: [{ id: "doc-1", title: "通知", content: "正文" }] },
    ui: { selectedDocId: "doc-1" },
    responses: { "/documents": { document: { id: "cloud-doc-1", title: "通知", version: 1 } } },
  });

  harness.controller.bindEvents();
  harness.controller.bindEvents();
  assert.equal(harness.els.cloudSaveDocBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudPullDocsBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudSaveWriterBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudPullWritersBtn.listeners.click.length, 1);

  await harness.els.cloudSaveDocBtn.listeners.click[0]();

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].path, "/documents");
});

test("cloudSaveCurrentDocument uploads the selected document and records cloud metadata", async () => {
  const harness = createHarness({
    state: {
      docs: [{ id: "doc-1", title: "周会通知", type: "notice", folderId: "folder-1", styleId: "style-1", content: "正文" }],
      styles: [{ id: "style-1" }],
    },
    ui: { selectedDocId: "doc-1" },
    responses: {
      "/documents": {
        document: { id: "cloud-doc-1", title: "周会通知", updated_at: "remote-time", version: 2 },
      },
    },
  });

  const data = await harness.controller.cloudSaveCurrentDocument();

  assert.equal(data.document.id, "cloud-doc-1");
  assert.equal(harness.requests[0].path, "/documents");
  assert.equal(harness.requests[0].options.method, "POST");
  assert.equal(JSON.parse(harness.requests[0].options.body).metadata.styleId, "style-1");
  assert.equal(harness.state.docs[0].cloudId, "cloud-doc-1");
  assert.equal(harness.state.docs[0].cloudVersion, 2);
  assert.ok(harness.calls.some((item) => item[0] === "persist"));
  assert.deepEqual(harness.events, [EVENTS.RENDER_EDITOR]);
  assert.match(harness.toasts.at(-1).message, /当前文档已同步到云端/);
});

test("cloudPullDocuments updates existing cloud documents and imports new ones", async () => {
  const harness = createHarness({
    state: {
      docs: [{ id: "doc-1", title: "旧标题", cloudId: "remote-1", content: "" }],
      styles: [{ id: "style-1" }],
    },
    responses: {
      "/documents": {
        documents: [
          { id: "remote-1", title: "新标题", type: "notice", content: "新正文", version: 4, metadata: { folderId: "folder-1", styleId: "style-1" } },
          { id: "remote-2", title: "云端新增", content: "新增正文", metadata: {} },
        ],
      },
    },
  });

  const result = await harness.controller.cloudPullDocuments();

  assert.equal(result.imported, 1);
  assert.equal(harness.state.docs.length, 2);
  assert.equal(harness.state.docs[0].title, "新标题");
  assert.equal(harness.state.docs[0].cloudVersion, 4);
  assert.equal(harness.state.docs[1].cloudId, "remote-2");
  assert.deepEqual(harness.events, [EVENTS.RENDER_DOC_LIST, EVENTS.RENDER_EDITOR]);
});

test("saveCloudResourceWithConflict can force overwrite the remote version", async () => {
  const remote = { id: "remote-1", version: 5 };
  const harness = createHarness({
    promptChoice: "1",
    cloudRequest: async (_path, requestOptions, callNumber) => {
      if (callNumber === 1) throw conflictError(remote, 5);
      return { document: { id: "remote-1", version: 6 }, body: JSON.parse(requestOptions.body) };
    },
  });

  const result = await harness.controller.saveCloudResourceWithConflict({
    localName: "本地文档",
    endpoint: "/documents/remote-1",
    method: "PUT",
    payload: { title: "本地", expected_version: 4 },
    remoteKey: "document",
  });

  assert.equal(result.body.force, true);
  assert.equal(harness.requests.length, 2);
  assert.equal(JSON.parse(harness.requests[1].options.body).force, true);
});

test("saveCloudResourceWithConflict can keep a local copy before pulling remote", async () => {
  const remote = { id: "remote-1", version: 5 };
  const calls = [];
  const harness = createHarness({
    promptChoice: "2",
    cloudRequest: async () => {
      throw conflictError(remote, 5);
    },
  });

  const result = await harness.controller.saveCloudResourceWithConflict({
    localName: "本地文档",
    endpoint: "/documents/remote-1",
    method: "PUT",
    payload: { title: "本地", expected_version: 4 },
    remoteKey: "document",
    createLocalCopy: (remoteDoc) => calls.push(["copy", remoteDoc.id]),
    applyRemote: (remoteDoc) => calls.push(["apply", remoteDoc.id]),
  });

  assert.deepEqual(result, { document: remote });
  assert.deepEqual(calls, [["copy", "remote-1"], ["apply", "remote-1"]]);
  assert.ok(harness.calls.some((item) => item[0] === "persist"));
  assert.equal(harness.toasts.at(-1).type, "warn");
});

test("cloudSaveCurrentWriter uploads the selected writer and keeps parsed skill json", async () => {
  const harness = createHarness({
    state: {
      styles: [{
        id: "style-1",
        name: "会议纪要",
        handle: "meeting",
        category: "公文写作",
        enabled: true,
        summary: "说明",
        skillJson: "{\"style_rules\":{\"must\":[\"分条\"]}}",
        qualityReport: { score: 90 },
      }],
    },
    ui: { selectedSkillCardId: "style-1" },
    responses: {
      "/writers": {
        writer: { id: "writer-1", handle: "meeting", updated_at: "remote-time", version: 3 },
      },
    },
  });

  await harness.controller.cloudSaveCurrentWriter();

  assert.equal(harness.requests[0].path, "/writers");
  const body = JSON.parse(harness.requests[0].options.body);
  assert.deepEqual(body.skill_json.style_rules.must, ["分条"]);
  assert.equal(body.quality_report.score, 90);
  assert.equal(harness.state.styles[0].cloudId, "writer-1");
  assert.deepEqual(harness.events, [EVENTS.RENDER_STYLE_LIST]);
  assert.match(harness.toasts.at(-1).message, /执笔人已同步到云端/);
});

test("cloudPullWriters upserts writers, maps versions, and selects an editing writer", async () => {
  const harness = createHarness({
    state: {
      styles: [{ id: "style-1", name: "旧名称", handle: "notice", examples: [{ id: "sample-1" }] }],
    },
    responses: {
      "/writers": {
        writers: [
          { id: "writer-1", name: "学校通知", handle: "notice", summary_md: "说明", skill_json: { a: 1 }, versions: [{ id: "v1", version: 2, skill_json: { a: 1 } }] },
          { id: "writer-2", name: "工作总结", handle: "summary", skill_json: { b: 2 } },
        ],
      },
    },
  });

  const result = await harness.controller.cloudPullWriters();

  assert.equal(result.imported, 1);
  assert.equal(harness.state.styles.length, 2);
  assert.equal(harness.state.styles[0].name, "学校通知");
  assert.equal(harness.state.styles[0].cloudId, "writer-1");
  assert.equal(harness.state.styles[0].examples.length, 1);
  assert.equal(harness.state.styles[0].versions[0].version, 2);
  assert.equal(harness.state.styles[0].versions[0].skillJson, JSON.stringify({ a: 1 }, null, 2));
  assert.equal(harness.state.styles[1].handle, "summary");
  assert.equal(harness.ui.editingStyle.id, "style-1");
  assert.deepEqual(harness.events, [EVENTS.RENDER_STYLE_SELECT, EVENTS.RENDER_STYLE_LIST, EVENTS.RENDER_STYLE_EDITOR]);
});

test("getCurrentCloudWriter prefers selected card, then editing writer, then first writer", () => {
  const harness = createHarness({
    state: {
      styles: [{ id: "first" }, { id: "editing" }, { id: "selected" }],
    },
    ui: { selectedSkillCardId: "selected", editingStyle: { id: "editing" } },
  });

  assert.equal(harness.controller.getCurrentCloudWriter().id, "selected");

  harness.ui.selectedSkillCardId = "";
  assert.equal(harness.controller.getCurrentCloudWriter().id, "editing");

  harness.ui.editingStyle = null;
  assert.equal(harness.controller.getCurrentCloudWriter().id, "first");
});
