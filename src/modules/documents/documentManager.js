import { clone, createId, now, sanitizeFileName } from "../../utils/helpers.js";
import { guessTypeFromName } from "../../utils/validation.js";
import { EVENTS } from "../../core/eventBus.js";

export function createDocumentManager(deps) {
  const {
    state,
    ui,
    saveEditor,
    persist,
    eventBus,
    focusTitleInput,
    createDefaultFolder,
    getFolderLocation,
    getDocumentLocation,
    getDownloadLocation,
    getType,
    downloadBlob,
    toast,
  } = deps;

  function getCurrentDoc() {
    return state.docs.find((doc) => doc.id === ui.selectedDocId) || null;
  }

  function selectFirstDocumentIfNeeded() {
    if (!ui.selectedDocId || !state.docs.some((doc) => doc.id === ui.selectedDocId)) {
      ui.selectedDocId = state.docs[0]?.id || null;
    }
  }

  function resolveTargetFolder(seed = {}) {
    return (
      seed.folderId ||
      (ui.selectedFolderId !== "all" ? ui.selectedFolderId : state.folders[0]?.id) ||
      createDefaultFolder()
    );
  }

  function buildDocument(seed = {}) {
    return {
      id: createId(),
      title: seed.title || "未命名文档",
      type: seed.type || "notice",
      folderId: resolveTargetFolder(seed),
      styleId: seed.styleId || state.styles[0]?.id || "",
      content: seed.content || "",
      createdAt: now(),
      updatedAt: now(),
    };
  }

  function createDocument(seed = {}) {
    const doc = buildDocument(seed);
    saveEditor(false);
    state.docs.unshift(doc);
    ui.selectedDocId = doc.id;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    focusTitleInput();
    return doc;
  }

  function duplicateDocument(docId) {
    const source = state.docs.find((doc) => doc.id === docId);
    if (!source) return null;
    const copy = {
      ...clone(source),
      id: createId(),
      title: `${source.title || "未命名文档"} 副本`,
      createdAt: now(),
      updatedAt: now(),
    };
    state.docs.unshift(copy);
    ui.selectedDocId = copy.id;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已复制文档到：${getDocumentLocation(copy)}`);
    return copy;
  }

  function duplicateCurrentDocument() {
    const current = getCurrentDoc();
    return current ? duplicateDocument(current.id) : null;
  }

  function deleteCurrentDocument(confirmDelete = (message) => window.confirm(message)) {
    const current = getCurrentDoc();
    if (!current) return false;
    const ok = confirmDelete(`删除“${current.title || "未命名文档"}”？`);
    if (!ok) return false;
    const oldLocation = getDocumentLocation(current);
    state.docs = state.docs.filter((doc) => doc.id !== current.id);
    ui.selectedDocId = state.docs[0]?.id || null;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已从 ${oldLocation} 删除文档`, "warn");
    return true;
  }

  async function importDocumentFiles(files) {
    if (!files || files.length === 0) return 0;
    const folderId = ui.selectedFolderId !== "all" ? ui.selectedFolderId : state.folders[0]?.id || createDefaultFolder();
    saveEditor(false);
    let importedCount = 0;
    for (const file of files) {
      const content = await file.text();
      const doc = buildDocument({
        title: file.name.replace(/\.[^.]+$/, ""),
        type: guessTypeFromName(file.name),
        folderId,
        content,
      });
      state.docs.unshift(doc);
      ui.selectedDocId = doc.id;
      importedCount += 1;
    }
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    const folder = state.folders.find((item) => item.id === folderId);
    toast(`已导入 ${importedCount} 份文档到：${getFolderLocation(folder)}`);
    return importedCount;
  }

  function exportCurrentDocument() {
    saveEditor(false);
    const doc = getCurrentDoc();
    if (!doc) return null;
    const type = getType(doc.type).name;
    const content = `${doc.title}\n\n${doc.content}`;
    const fileName = `${sanitizeFileName(doc.title || "未命名文档")}.txt`;
    downloadBlob(fileName, content, "text/plain;charset=utf-8");
    toast(`已导出 ${type} 到：${getDownloadLocation(fileName)}`);
    return fileName;
  }

  function exportWorkspaceBackup() {
    saveEditor(false);
    const backup = {
      exportedAt: now(),
      app: "mowen-nibi-workbench",
      version: 1,
      data: state,
    };
    const fileName = `摹文拟笔工作台备份-${new Date().toISOString().slice(0, 10)}.json`;
    downloadBlob(fileName, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    toast(`已导出备份到：${getDownloadLocation(fileName)}`);
    return fileName;
  }

  return {
    createDocument,
    duplicateCurrentDocument,
    duplicateDocument,
    deleteCurrentDocument,
    getCurrentDoc,
    selectFirstDocumentIfNeeded,
    importDocumentFiles,
    exportCurrentDocument,
    exportWorkspaceBackup,
  };
}
