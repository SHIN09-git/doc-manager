import { clone, createId, now, sanitizeFileName } from "../../utils/helpers.js";
import { buildUnsupportedFileMessage, canImportFile, readImportFileText } from "../../utils/fileReaders.js";
import { filterImportableFilesBySize } from "../../utils/importGuards.js";
import { guessTypeFromName } from "../../utils/validation.js";
import { EVENTS } from "../../core/eventBus.js";
import { createDocxBlob, DOCX_MIME, prepareDocumentExport } from "./docxExporter.js";

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
    confirmLargeImport = (message) => globalThis.window?.confirm?.(message) ?? true,
    withImportProgress = async (_message, task) => task({ update: () => {} }),
  } = deps;

  function getCurrentDoc() {
    return state.docs.find((doc) => doc.id === ui.selectedDocId) || null;
  }

  function isDeleted(doc) {
    return Boolean(doc?.deletedAt);
  }

  function getSelectableDocuments() {
    return state.docs.filter((doc) => !isDeleted(doc));
  }

  function selectFirstDocumentIfNeeded() {
    const docs = getSelectableDocuments();
    if (!ui.selectedDocId || !docs.some((doc) => doc.id === ui.selectedDocId)) {
      ui.selectedDocId = docs[0]?.id || null;
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
    if (!source || isDeleted(source)) return null;
    const copy = {
      ...clone(source),
      id: createId(),
      title: `${source.title || "未命名文档"} 副本`,
      deletedAt: "",
      deletedFromFolderId: "",
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

  function moveDocument(sourceId, targetId, placement = "before") {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const source = state.docs.find((doc) => doc.id === sourceId);
    const target = state.docs.find((doc) => doc.id === targetId);
    if (!source || !target || isDeleted(source) || isDeleted(target)) return false;
    saveEditor(false);
    const sourceIndex = state.docs.findIndex((doc) => doc.id === sourceId);
    state.docs.splice(sourceIndex, 1);
    const targetIndex = state.docs.findIndex((doc) => doc.id === targetId);
    const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    state.docs.splice(insertIndex, 0, source);
    persist();
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    toast(`已调整文档顺序：${source.title || "未命名文档"}`);
    return true;
  }

  function moveDocumentToTop(docId) {
    const doc = state.docs.find((item) => item.id === docId);
    if (!doc || isDeleted(doc)) return false;
    const firstActive = state.docs.find((item) => !isDeleted(item));
    if (!firstActive || firstActive.id === doc.id) return false;
    return moveDocument(doc.id, firstActive.id, "before");
  }

  function moveDocumentToBottom(docId) {
    const doc = state.docs.find((item) => item.id === docId);
    if (!doc || isDeleted(doc)) return false;
    const activeDocs = state.docs.filter((item) => !isDeleted(item));
    const lastActive = activeDocs.at(-1);
    if (!lastActive || lastActive.id === doc.id) return false;
    return moveDocument(doc.id, lastActive.id, "after");
  }

  function deleteCurrentDocument(confirmDelete = (message) => window.confirm(message)) {
    const current = getCurrentDoc();
    if (!current || isDeleted(current)) return false;
    const ok = confirmDelete(`将“${current.title || "未命名文档"}”移入垃圾箱？`);
    if (!ok) return false;
    const oldLocation = getDocumentLocation(current);
    current.deletedAt = now();
    current.deletedFromFolderId = current.folderId || "";
    current.updatedAt = now();
    ui.selectedDocId = getSelectableDocuments()[0]?.id || null;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已将文档移入垃圾箱：${oldLocation}`, "warn");
    return true;
  }

  function restoreDocument(docId) {
    const doc = state.docs.find((item) => item.id === docId);
    if (!doc || !isDeleted(doc)) return null;
    doc.deletedAt = "";
    doc.deletedFromFolderId = "";
    doc.updatedAt = now();
    ui.selectedDocId = doc.id;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已从垃圾箱恢复：${getDocumentLocation(doc)}`);
    return doc;
  }

  function restoreAllDocumentsFromTrash() {
    const trashedDocs = state.docs.filter((item) => isDeleted(item));
    if (trashedDocs.length === 0) return 0;
    trashedDocs.forEach((doc) => {
      doc.deletedAt = "";
      doc.deletedFromFolderId = "";
      doc.updatedAt = now();
    });
    ui.selectedDocId = trashedDocs[0].id;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已从垃圾箱恢复 ${trashedDocs.length} 份文档`);
    return trashedDocs.length;
  }

  function permanentlyDeleteDocument(docId, confirmDelete = (message) => window.confirm(message)) {
    const doc = state.docs.find((item) => item.id === docId);
    if (!doc || !isDeleted(doc)) return false;
    const ok = confirmDelete(`永久删除“${doc.title || "未命名文档"}”？此操作无法恢复。`);
    if (!ok) return false;
    state.docs = state.docs.filter((item) => item.id !== doc.id);
    if (ui.selectedDocId === doc.id) {
      ui.selectedDocId = getSelectableDocuments()[0]?.id || null;
    }
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已永久删除文档：${doc.title || "未命名文档"}`, "warn");
    return true;
  }

  function clearTrashDocuments(confirmDelete = (message) => window.confirm(message)) {
    const trashedDocs = state.docs.filter((item) => isDeleted(item));
    if (trashedDocs.length === 0) return 0;
    const ok = confirmDelete(`永久清空垃圾箱中的 ${trashedDocs.length} 份文档？此操作无法恢复。`);
    if (!ok) return 0;
    const trashIds = new Set(trashedDocs.map((doc) => doc.id));
    state.docs = state.docs.filter((doc) => !trashIds.has(doc.id));
    if (ui.selectedDocId && trashIds.has(ui.selectedDocId)) {
      ui.selectedDocId = getSelectableDocuments()[0]?.id || null;
    }
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已清空垃圾箱：${trashedDocs.length} 份文档`, "warn");
    return trashedDocs.length;
  }

  async function importDocumentFiles(files) {
    if (!files || files.length === 0) return 0;
    const { accepted: importFiles, skipped: sizeSkipped } = await filterImportableFilesBySize(files, {
      confirm: confirmLargeImport,
      notify: toast,
    });
    if (importFiles.length === 0) return 0;

    const folderId = ui.selectedFolderId !== "all" ? ui.selectedFolderId : state.folders[0]?.id || createDefaultFolder();
    saveEditor(false);
    let importedCount = 0;
    const skippedFiles = [];
    await withImportProgress(`正在导入 ${importFiles.length} 个文件`, async (progress) => {
      for (const [index, file] of importFiles.entries()) {
        progress.update(`正在读取 ${file.name}`, Math.round((index / importFiles.length) * 78) + 10);
        if (!canImportFile(file.name)) {
          skippedFiles.push(file.name);
          continue;
        }
        let content = "";
        try {
          content = await readImportFileText(file);
        } catch (error) {
          skippedFiles.push(file.name);
          console.warn("导入文件失败", file.name, error);
          continue;
        }
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
      progress.update("正在保存导入结果", 92);
    });
    if (importedCount === 0 && skippedFiles.length > 0) {
      toast(`未导入文件：${buildUnsupportedFileMessage(skippedFiles[0])}`, "warn");
      return 0;
    }
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    const folder = state.folders.find((item) => item.id === folderId);
    const skippedCount = skippedFiles.length + sizeSkipped.length;
    toast(`已导入 ${importedCount} 份文档到：${getFolderLocation(folder)}${skippedCount ? `，已跳过 ${skippedCount} 个暂不支持、过大或读取失败的文件` : ""}`);
    return importedCount;
  }

  async function exportCurrentDocument() {
    saveEditor(false);
    const doc = getCurrentDoc();
    if (!doc) return null;
    const type = getType(doc.type).name;
    const exportDoc = prepareDocumentExport(doc);
    const fileName = `${sanitizeFileName(exportDoc.title || "未命名文档")}.docx`;
    const blob = await createDocxBlob(exportDoc);
    downloadBlob(fileName, blob, DOCX_MIME);
    toast(`已导出 ${type} Word 文档到：${getDownloadLocation(fileName)}`);
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
    moveDocument,
    moveDocumentToTop,
    moveDocumentToBottom,
    deleteCurrentDocument,
    restoreDocument,
    restoreAllDocumentsFromTrash,
    permanentlyDeleteDocument,
    clearTrashDocuments,
    getCurrentDoc,
    selectFirstDocumentIfNeeded,
    importDocumentFiles,
    exportCurrentDocument,
    exportWorkspaceBackup,
  };
}
