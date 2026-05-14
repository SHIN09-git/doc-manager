import { now } from "../../utils/helpers.js";
import { EVENTS } from "../../core/eventBus.js";

export function createDocumentEditor(deps) {
  const {
    state,
    ui,
    els,
    saveDelayMs,
    getCurrentDoc,
    createDefaultFolder,
    getDocumentLocation,
    getFolderById,
    persist,
    eventBus,
    syncDocumentToRealFolder,
    toast,
  } = deps;

  function queueEditorSave() {
    els.saveState.textContent = "保存中";
    window.clearTimeout(ui.saveTimer);
    ui.saveTimer = window.setTimeout(() => saveEditor(false), saveDelayMs);
  }

  function saveEditor(showToast) {
    const doc = getCurrentDoc();
    if (!doc) return;
    doc.title = els.titleInput.value.trim() || "未命名文档";
    doc.type = els.typeSelect.value || "custom";
    doc.folderId = els.folderSelect.value || state.folders[0]?.id || createDefaultFolder();
    doc.styleId = els.styleSelect.value || "";
    doc.content = els.contentEditor.value;
    doc.updatedAt = now();
    ui.selectedDocId = doc.id;
    persist();
    els.saveState.textContent = "已保存";
    els.saveState.title = `保存位置：${getDocumentLocation(doc)}`;
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    if (showToast) {
      showSaveLocation(doc);
    }
  }

  function showSaveLocation(doc) {
    if (getFolderById(doc.folderId)?.kind === "real") {
      syncDocumentToRealFolder(doc)
        .then((location) => toast(`已保存到：${location}`))
        .catch((error) =>
          toast(`已保存到：${getDocumentLocation(doc)}；同步真实文件夹失败：${error.message}`, "warn"),
        );
      return;
    }
    toast(`已保存到：${getDocumentLocation(doc)}`);
  }

  return {
    queueEditorSave,
    saveEditor,
  };
}
