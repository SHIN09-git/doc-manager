import { clone, createId, now, sanitizeFileName } from "../../utils/helpers.js";
import { MAX_IMPORT_FILE_BYTES } from "../../config/constants.js";
import { buildUnsupportedFileMessage, canImportFile, readImportFileText } from "../../utils/fileReaders.js";
import { filterImportableFilesBySize } from "../../utils/importGuards.js";
import { guessTypeFromName } from "../../utils/validation.js";
import { EVENTS } from "../../core/eventBus.js";
import { createDocxBlob, DOCX_MIME, prepareDocumentExport } from "./docxExporter.js";
import { createGongwenDocxBlob } from "./gongwenDocxExporter.js";
import { findPlaceholders } from "../../utils/placeholders.js";

export const EXPORT_LAYOUTS = {
  standard: { label: "通用版式", create: createDocxBlob },
  gongwen: { label: "公文版式（GB/T 9704）", create: createGongwenDocxBlob },
};

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
    restoreWorkspaceState = () => {},
    hasActiveTasks = () => false,
    toast,
    confirmRestore = (message) => globalThis.window?.confirm?.(message) ?? true,
    confirmLargeImport = (message) => globalThis.window?.confirm?.(message) ?? true,
    confirmExport = (message) => globalThis.window?.confirm?.(message) ?? true,
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
      writingGenre: seed.writingGenre || "",
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

  async function exportCurrentDocument({ layout = state.settings?.exportLayout } = {}) {
    saveEditor(false);
    const doc = getCurrentDoc();
    if (!doc) return null;
    const exportLayout = EXPORT_LAYOUTS[layout] ? layout : "standard";
    const placeholders = findPlaceholders(doc.content);
    if (placeholders.length) {
      const sample = [...new Set(placeholders.map((item) => item.text))].slice(0, 3).join("、");
      const message = `文档中还有 ${placeholders.length} 处待填内容（如${sample}），导出后需要在 Word 中手动补全。仍要导出吗？`;
      if (!confirmExport(message)) {
        toast("已取消导出，可在“待填”清单中逐项补全", "warn");
        return null;
      }
    }
    const type = getType(doc.type).name;
    const exportDoc = prepareDocumentExport(doc);
    const fileName = `${sanitizeFileName(exportDoc.title || "未命名文档")}.docx`;
    const blob = await EXPORT_LAYOUTS[exportLayout].create(exportDoc);
    if (downloadBlob(fileName, blob, DOCX_MIME) === false) {
      toast("浏览器未能开始下载，请检查下载权限后重试", "error");
      return null;
    }
    toast(`已按${EXPORT_LAYOUTS[exportLayout].label}导出 ${type} Word 文档到：${getDownloadLocation(fileName)}`);
    return fileName;
  }

  function exportWorkspaceBackup() {
    saveEditor(false);
    const backup = createWorkspaceBackupPayload(state, now());
    const fileName = `摹文拟笔工作台备份-${new Date().toISOString().slice(0, 10)}.json`;
    if (downloadBlob(fileName, JSON.stringify(backup, null, 2), "application/json;charset=utf-8") === false) {
      toast("浏览器未能开始下载，请检查下载权限后重试", "error");
      return null;
    }
    toast(`已导出备份到：${getDownloadLocation(fileName)}`);
    return fileName;
  }

  async function restoreWorkspaceBackupFile(file) {
    if (!file) return null;
    if (hasActiveTasks()) {
      throw new Error("请先取消正在进行的生成或导入任务，再恢复备份");
    }
    if (Number(file.size || 0) > MAX_IMPORT_FILE_BYTES) {
      throw new Error("备份文件超过 50 MB 安全上限");
    }
    const parsed = parseWorkspaceBackup(await file.text());
    parsed.settings.apiKey = String(state.settings?.apiKey || "");
    const docCount = parsed.docs.length;
    const writerCount = parsed.styles.length;
    const confirmed = await confirmRestore(`将用备份中的 ${docCount} 份文档和 ${writerCount} 个执笔人替换当前本机工作区。云端数据和本机 API Key 不会被覆盖。是否继续？`);
    if (!confirmed) {
      toast("已取消恢复备份", "warn");
      return null;
    }
    restoreWorkspaceState(parsed);
    selectFirstDocumentIfNeeded();
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已恢复本机工作区：${docCount} 份文档、${writerCount} 个执笔人`);
    return { docCount, writerCount };
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
    restoreWorkspaceBackupFile,
  };
}

export function createWorkspaceBackupPayload(state, exportedAt = new Date().toISOString()) {
  const settings = clone(state?.settings || {});
  settings.apiKey = "";
  return {
    exportedAt,
    app: "mowen-nibi-workbench",
    version: 2,
    scope: "local-workspace",
    secretsExcluded: ["settings.apiKey", "cloudSession"],
    data: {
      folders: clone(Array.isArray(state?.folders) ? state.folders : []),
      customTypes: clone(Array.isArray(state?.customTypes) ? state.customTypes : []),
      styles: clone(Array.isArray(state?.styles) ? state.styles : []),
      docs: clone(Array.isArray(state?.docs) ? state.docs : []),
      settings,
    },
  };
}

export function parseWorkspaceBackup(value) {
  let payload;
  try {
    payload = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("备份 JSON 格式不正确");
  }
  if (!payload || typeof payload !== "object" || payload.app !== "mowen-nibi-workbench") {
    throw new Error("这不是摹文拟笔工作台备份");
  }
  if (![1, 2].includes(Number(payload.version))) {
    throw new Error(`暂不支持备份版本 ${payload.version || "未知"}`);
  }
  const source = payload.data;
  if (!source || typeof source !== "object") throw new Error("备份缺少工作区数据");
  if (!Array.isArray(source.docs) || !Array.isArray(source.styles) || !Array.isArray(source.folders)) {
    throw new Error("备份中的文档、执笔人或标签结构不完整");
  }
  if (source.docs.length > 10_000 || source.styles.length > 1_000 || source.folders.length > 1_000) {
    throw new Error("备份中的项目数量超过安全上限");
  }
  if ([...source.docs, ...source.styles, ...source.folders].some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("备份中包含无效的工作区项目");
  }
  const settings = clone(source.settings && typeof source.settings === "object" ? source.settings : {});
  settings.apiKey = "";
  return {
    folders: clone(source.folders),
    customTypes: clone(Array.isArray(source.customTypes) ? source.customTypes : []),
    styles: clone(source.styles),
    docs: clone(source.docs),
    settings,
  };
}
