import { EVENTS } from "../../core/eventBus.js";

export function createDocumentPanelController(deps = {}) {
  const {
    ui = {},
    els = {},
    documentManager,
    trashController = { bindEvents: () => {} },
    setupFileDrop = () => {},
    saveEditor = () => {},
    persist = () => {},
    eventBus = { emit: () => {} },
    switchMainView = () => {},
    isMobileWorkspace = () => false,
    setMobileView = () => {},
    toast = () => {},
  } = deps;

  function bindEvents() {
    els.newDocBtn?.addEventListener("click", createDocument);
    els.importInput?.addEventListener("change", importDocuments);
    els.docDropZone?.addEventListener("keydown", openDocumentPickerFromKeyboard);
    setupFileDrop(els.docDropZone, importDocumentFiles);
    setupFileDrop(els.docList, importDocumentFiles);
    els.exportDocBtn?.addEventListener("click", exportCurrentDocument);
    els.backupBtn?.addEventListener("click", exportWorkspaceBackup);
    els.restoreBackupBtn?.addEventListener("click", () => els.restoreBackupInput?.click?.());
    els.restoreBackupInput?.addEventListener("change", restoreWorkspaceBackup);
    trashController.bindEvents();
  }

  function openDocumentPickerFromKeyboard(event) {
    if (!event || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault?.();
    els.importInput?.click?.();
  }

  function selectDocument(docId) {
    saveEditor(false);
    ui.selectedDocId = docId;
    switchMainView("editor");
    if (isMobileWorkspace()) setMobileView("editor");
    persist();
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    eventBus.emit(EVENTS.RENDER_EDITOR);
    return docId;
  }

  function createDocument(seed = {}) {
    switchMainView("editor");
    return documentManager.createDocument(seed);
  }

  function duplicateCurrentDocument() {
    return documentManager.duplicateCurrentDocument();
  }

  function duplicateDocument(docId) {
    return documentManager.duplicateDocument(docId);
  }

  function moveDocument(sourceId, targetId, placement) {
    return documentManager.moveDocument(sourceId, targetId, placement);
  }

  function moveDocumentToTop(docId) {
    return documentManager.moveDocumentToTop(docId);
  }

  function moveDocumentToBottom(docId) {
    return documentManager.moveDocumentToBottom(docId);
  }

  function deleteDocument(docId) {
    ui.selectedDocId = docId;
    return documentManager.deleteCurrentDocument();
  }

  function deleteCurrentDocument() {
    return documentManager.deleteCurrentDocument();
  }

  function restoreDocument(docId) {
    return documentManager.restoreDocument(docId);
  }

  function restoreAllTrashDocuments() {
    return documentManager.restoreAllDocumentsFromTrash();
  }

  function permanentlyDeleteDocument(docId) {
    return documentManager.permanentlyDeleteDocument(docId);
  }

  function clearTrashDocuments() {
    return documentManager.clearTrashDocuments();
  }

  async function importDocuments(event) {
    const files = Array.from(event?.target?.files || []);
    await importDocumentFiles(files);
    if (event?.target) event.target.value = "";
  }

  async function importDocumentFiles(files) {
    return documentManager.importDocumentFiles(files);
  }

  async function exportCurrentDocument(options = {}) {
    // 点击事件直接绑定到这里时，第一个参数是 Event，不能当作导出选项
    const exportOptions = options && typeof options === "object" && "layout" in options ? { layout: options.layout } : {};
    try {
      return await documentManager.exportCurrentDocument(exportOptions);
    } catch (error) {
      toast(`导出 Word 文档失败：${error.message || "请稍后重试"}`, "error");
      return null;
    }
  }

  function exportWorkspaceBackup() {
    return documentManager.exportWorkspaceBackup();
  }

  async function restoreWorkspaceBackup(event) {
    const file = event?.target?.files?.[0] || null;
    try {
      return await documentManager.restoreWorkspaceBackupFile(file);
    } catch (error) {
      toast(`恢复备份失败：${error.message || "备份文件不可用"}`, "error");
      return null;
    } finally {
      if (event?.target) event.target.value = "";
    }
  }

  return {
    bindEvents,
    selectDocument,
    createDocument,
    duplicateCurrentDocument,
    duplicateDocument,
    moveDocument,
    moveDocumentToTop,
    moveDocumentToBottom,
    deleteDocument,
    deleteCurrentDocument,
    restoreDocument,
    restoreAllTrashDocuments,
    permanentlyDeleteDocument,
    clearTrashDocuments,
    importDocuments,
    importDocumentFiles,
    exportCurrentDocument,
    exportWorkspaceBackup,
    restoreWorkspaceBackup,
  };
}
