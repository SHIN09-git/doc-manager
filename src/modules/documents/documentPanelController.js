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
    setupFileDrop(els.docDropZone, importDocumentFiles);
    setupFileDrop(els.docList, importDocumentFiles);
    els.exportDocBtn?.addEventListener("click", exportCurrentDocument);
    els.backupBtn?.addEventListener("click", exportWorkspaceBackup);
    trashController.bindEvents();
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

  async function exportCurrentDocument() {
    try {
      return await documentManager.exportCurrentDocument();
    } catch (error) {
      toast(`导出 Word 文档失败：${error.message || "请稍后重试"}`, "error");
      return null;
    }
  }

  function exportWorkspaceBackup() {
    return documentManager.exportWorkspaceBackup();
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
  };
}
