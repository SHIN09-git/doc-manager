import { EVENTS } from "../../core/eventBus.js";

function parseJsonSafely(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function createCloudSyncController(deps = {}) {
  const {
    state = {},
    ui = {},
    els = {},
    cloudRequest = async () => ({}),
    withLoading = async (_button, _label, task) => task(),
    persist = () => {},
    eventBus = { emit: () => {} },
    toast = () => {},
    getCurrentDoc = () => null,
    normalizeSkill = (skill) => skill,
    normalizeHandle = (value) => String(value || "").trim(),
    clone = (value) => JSON.parse(JSON.stringify(value)),
    createId = () => `id_${Date.now()}`,
    now = () => new Date().toISOString(),
    getCloudDocumentLocation = (document) => document?.title || document?.id || "",
    getCloudWriterLocation = (writer) => writer?.handle || writer?.id || "",
    windowRef = globalThis.window,
  } = deps;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    els.cloudSaveDocBtn?.addEventListener("click", cloudSaveCurrentDocument);
    els.cloudPullDocsBtn?.addEventListener("click", cloudPullDocuments);
    els.cloudSaveWriterBtn?.addEventListener("click", cloudSaveCurrentWriter);
    els.cloudPullWritersBtn?.addEventListener("click", cloudPullWriters);
  }

  async function cloudSaveCurrentDocument() {
    const doc = getCurrentDoc();
    if (!doc || doc.deletedAt) {
      toast("请先选择要同步的文档", "warn");
      return null;
    }
    return withLoading(els.cloudSaveDocBtn, "同步中", async () => {
      const payload = {
        title: doc.title || "未命名文档",
        type: doc.type || "custom",
        folder_id: doc.folderId || "",
        local_id: doc.id,
        content: doc.content || "",
        metadata: {
          localId: doc.id,
          type: doc.type || "",
          folderId: doc.folderId || "",
          styleId: doc.styleId || "",
        },
        expected_version: doc.cloudVersion || undefined,
      };
      const data = await saveCloudResourceWithConflict({
        localName: doc.title || "当前文档",
        endpoint: doc.cloudId ? `/documents/${doc.cloudId}` : "/documents",
        method: doc.cloudId ? "PUT" : "POST",
        payload,
        remoteKey: "document",
        applyRemote: (remoteDoc) => applyRemoteDocumentToLocal(doc, remoteDoc),
        createLocalCopy: (remoteDoc) => createDocumentCopyFromRemote(remoteDoc),
      });
      doc.cloudId = data.document.id;
      doc.cloudUpdatedAt = data.document.updated_at || now();
      doc.cloudVersion = data.document.version || 1;
      persist();
      eventBus.emit(EVENTS.RENDER_EDITOR);
      toast(`当前文档已同步到云端：${getCloudDocumentLocation(data.document)}`);
      return data;
    });
  }

  async function cloudPullDocuments() {
    return withLoading(els.cloudPullDocsBtn, "拉取中", async () => {
      const data = await cloudRequest("/documents", { method: "GET" });
      const documents = Array.isArray(data.documents) ? data.documents : [];
      let imported = 0;
      documents.forEach((remoteDoc) => {
        const existing = state.docs.find((doc) => doc.cloudId === remoteDoc.id);
        const metadata = remoteDoc.metadata || {};
        if (existing) {
          existing.title = remoteDoc.title || existing.title;
          existing.content = remoteDoc.content || "";
          existing.type = remoteDoc.type || metadata.type || existing.type || "custom";
          existing.folderId = metadata.folderId || existing.folderId || state.folders[0]?.id || "";
          existing.styleId = metadata.styleId || existing.styleId || state.styles[0]?.id || "";
          existing.cloudUpdatedAt = remoteDoc.updated_at || now();
          existing.cloudVersion = remoteDoc.version || 1;
          existing.updatedAt = now();
          existing.deletedAt = remoteDoc.deleted_at || "";
          return;
        }
        state.docs.push({
          id: createId(),
          title: remoteDoc.title || "云端文档",
          type: remoteDoc.type || metadata.type || "custom",
          folderId: metadata.folderId || state.folders[0]?.id || "",
          styleId: metadata.styleId || state.styles[0]?.id || "",
          content: remoteDoc.content || "",
          createdAt: remoteDoc.created_at || now(),
          updatedAt: remoteDoc.updated_at || now(),
          deletedAt: remoteDoc.deleted_at || "",
          deletedFromFolderId: "",
          cloudId: remoteDoc.id,
          cloudUpdatedAt: remoteDoc.updated_at || now(),
          cloudVersion: remoteDoc.version || 1,
        });
        imported += 1;
      });
      persist();
      eventBus.emit(EVENTS.RENDER_DOC_LIST);
      eventBus.emit(EVENTS.RENDER_EDITOR);
      toast(`已从云端拉取 ${documents.length} 份文档，新增 ${imported} 份`);
      return { documents, imported };
    });
  }

  async function saveCloudResourceWithConflict({ localName, endpoint, method, payload, remoteKey, applyRemote, createLocalCopy }) {
    try {
      return await cloudRequest(endpoint, { method, body: JSON.stringify(payload) });
    } catch (error) {
      if (error.status !== 409 || error.payload?.error?.code !== "version_conflict") throw error;
      const remote = error.payload?.error?.details?.remote;
      const currentVersion = error.payload?.error?.details?.current_version || remote?.version || "未知";
      const choice = windowRef?.prompt?.(
        `检测到云端版本冲突：${localName}\n云端版本：v${currentVersion}\n输入 1 覆盖云端；输入 2 另存本地副本后拉取云端；输入 3 仅拉取云端。`,
        "3",
      );
      if (choice === "1") {
        return cloudRequest(endpoint, {
          method,
          body: JSON.stringify({ ...payload, expected_version: undefined, force: true }),
        });
      }
      if (choice === "2") {
        createLocalCopy?.(remote);
        applyRemote?.(remote);
        persist();
        toast("已保留本地副本，并拉取云端版本", "warn");
        return { [remoteKey]: remote };
      }
      applyRemote?.(remote);
      persist();
      toast("已拉取云端版本，本地改动未覆盖云端", "warn");
      return { [remoteKey]: remote };
    }
  }

  function applyRemoteDocumentToLocal(doc, remoteDoc) {
    if (!remoteDoc) return;
    const metadata = remoteDoc.metadata || {};
    doc.title = remoteDoc.title || doc.title;
    doc.content = remoteDoc.content || "";
    doc.type = remoteDoc.type || metadata.type || doc.type || "custom";
    doc.folderId = metadata.folderId || doc.folderId || state.folders[0]?.id || "";
    doc.styleId = metadata.styleId || doc.styleId || state.styles[0]?.id || "";
    doc.cloudId = remoteDoc.id;
    doc.cloudUpdatedAt = remoteDoc.updated_at || now();
    doc.cloudVersion = remoteDoc.version || 1;
    doc.updatedAt = now();
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    eventBus.emit(EVENTS.RENDER_EDITOR);
  }

  function createDocumentCopyFromRemote(remoteDoc) {
    const current = getCurrentDoc();
    if (!current) return remoteDoc;
    state.docs.push({
      ...current,
      id: createId(),
      title: `${current.title || "本地副本"}（冲突副本）`,
      cloudId: "",
      cloudUpdatedAt: "",
      cloudVersion: "",
      createdAt: now(),
      updatedAt: now(),
    });
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    return remoteDoc;
  }

  async function cloudSaveCurrentWriter() {
    const style = getCurrentCloudWriter();
    if (!style) {
      toast("请先选择要同步的执笔人", "warn");
      return null;
    }
    return withLoading(els.cloudSaveWriterBtn, "同步中", async () => {
      const payload = {
        name: style.name || "未命名执笔人",
        handle: normalizeHandle(style.handle || style.name),
        category: style.category || "自定义",
        description: style.description || "",
        enabled: style.enabled !== false,
        summary_md: style.summary || "",
        skill_json: parseJsonSafely(style.skillJson || "{}", {}),
        quality_report: style.qualityReport || {},
        expected_version: style.cloudVersion || undefined,
      };
      const data = await saveCloudResourceWithConflict({
        localName: style.name || "当前执笔人",
        endpoint: style.cloudId ? `/writers/${style.cloudId}` : "/writers",
        method: style.cloudId ? "PUT" : "POST",
        payload,
        remoteKey: "writer",
        applyRemote: (remoteWriter) => applyRemoteWriterToLocal(style, remoteWriter),
        createLocalCopy: (remoteWriter) => createWriterCopyFromRemote(remoteWriter),
      });
      style.cloudId = data.writer.id;
      style.cloudUpdatedAt = data.writer.updated_at || now();
      style.cloudVersion = data.writer.version || 1;
      style.updatedAt = now();
      persist();
      eventBus.emit(EVENTS.RENDER_STYLE_LIST);
      toast(`执笔人已同步到云端：${getCloudWriterLocation(data.writer)}`);
      return data;
    });
  }

  function applyRemoteWriterToLocal(style, remoteWriter) {
    if (!remoteWriter) return;
    const next = normalizeSkill({
      ...style,
      name: remoteWriter.name || style.name,
      handle: remoteWriter.handle || style.handle,
      category: remoteWriter.category || style.category || "自定义",
      description: remoteWriter.description || style.description || "",
      enabled: remoteWriter.enabled !== false,
      summary: remoteWriter.summary_md || style.summary || "",
      skillJson: JSON.stringify(remoteWriter.skill_json || {}, null, 2),
      qualityReport: remoteWriter.quality_report || style.qualityReport || null,
      versions: style.versions || [],
      cloudId: remoteWriter.id,
      cloudUpdatedAt: remoteWriter.updated_at || now(),
      cloudVersion: remoteWriter.version || 1,
      updatedAt: now(),
    });
    Object.assign(style, next);
    if (ui.editingStyle?.id === style.id) ui.editingStyle = clone(style);
    eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
  }

  function createWriterCopyFromRemote(remoteWriter) {
    const style = getCurrentCloudWriter();
    if (!style) return remoteWriter;
    state.styles.push(normalizeSkill({
      ...style,
      id: createId(),
      name: `${style.name || "本地副本"}（冲突副本）`,
      handle: normalizeHandle(`${style.handle || style.name || "copy"}${state.styles.length + 1}`),
      cloudId: "",
      cloudUpdatedAt: "",
      cloudVersion: "",
      createdAt: now(),
      updatedAt: now(),
    }));
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    return remoteWriter;
  }

  async function cloudPullWriters() {
    return withLoading(els.cloudPullWritersBtn, "拉取中", async () => {
      const data = await cloudRequest("/writers", { method: "GET" });
      const writers = Array.isArray(data.writers) ? data.writers : [];
      let imported = 0;
      writers.forEach((remoteWriter) => {
        const existing = state.styles.find((style) => style.cloudId === remoteWriter.id || style.handle === remoteWriter.handle);
        const next = normalizeSkill({
          ...(existing || {}),
          id: existing?.id || createId(),
          name: remoteWriter.name || existing?.name || "云端执笔人",
          handle: remoteWriter.handle || existing?.handle || "",
          category: remoteWriter.category || existing?.category || "自定义",
          description: remoteWriter.description || existing?.description || "",
          enabled: remoteWriter.enabled !== false,
          summary: remoteWriter.summary_md || existing?.summary || "",
          skillJson: JSON.stringify(remoteWriter.skill_json || {}, null, 2),
          qualityReport: remoteWriter.quality_report || existing?.qualityReport || null,
          versions: Array.isArray(remoteWriter.versions) ? remoteWriter.versions.map(mapRemoteWriterVersion) : existing?.versions || [],
          examples: existing?.examples || [],
          createdAt: remoteWriter.created_at || existing?.createdAt || now(),
          updatedAt: remoteWriter.updated_at || now(),
          cloudId: remoteWriter.id,
          cloudUpdatedAt: remoteWriter.updated_at || now(),
          cloudVersion: remoteWriter.version || 1,
        });
        if (existing) Object.assign(existing, next);
        else {
          state.styles.push(next);
          imported += 1;
        }
      });
      if (!ui.editingStyle && state.styles[0]) ui.editingStyle = clone(state.styles[0]);
      persist();
      eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
      eventBus.emit(EVENTS.RENDER_STYLE_LIST);
      eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
      toast(`已从云端拉取 ${writers.length} 个执笔人，新增 ${imported} 个`);
      return { writers, imported };
    });
  }

  function mapRemoteWriterVersion(version) {
    return {
      id: version.id || createId(),
      version: Number(version.version || 1),
      createdAt: version.created_at || now(),
      summary: version.summary_md || "",
      skillJson: JSON.stringify(version.skill_json || {}, null, 2),
      qualityReport: version.quality_report || null,
      sourceExamples: [],
      analyses: [],
      analysis: "",
      aggregation: "",
      aggregationData: null,
      testDoc: "",
      testReport: "",
    };
  }

  function getCurrentCloudWriter() {
    return (
      state.styles.find((style) => style.id === ui.selectedSkillCardId) ||
      state.styles.find((style) => style.id === ui.editingStyle?.id) ||
      state.styles[0] ||
      null
    );
  }

  return {
    bindEvents,
    cloudSaveCurrentDocument,
    cloudPullDocuments,
    saveCloudResourceWithConflict,
    applyRemoteDocumentToLocal,
    createDocumentCopyFromRemote,
    cloudSaveCurrentWriter,
    applyRemoteWriterToLocal,
    createWriterCopyFromRemote,
    cloudPullWriters,
    mapRemoteWriterVersion,
    getCurrentCloudWriter,
  };
}
