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
    showSaveStatus = () => {},
    toast,
  } = deps;

  function queueEditorSave() {
    if (!getCurrentDoc()) {
      window.clearTimeout(ui.saveTimer);
      showSaveStatus("");
      return;
    }
    showSaveStatus("保存中");
    window.clearTimeout(ui.saveTimer);
    ui.saveTimer = window.setTimeout(() => saveEditor(false), saveDelayMs);
  }

  function saveEditor(showToast) {
    const doc = getCurrentDoc();
    if (!doc) {
      showSaveStatus("");
      return;
    }
    doc.title = els.titleInput.value.trim() || "未命名文档";
    doc.type = els.typeSelect.value || "custom";
    doc.folderId = els.folderSelect.value || state.folders[0]?.id || createDefaultFolder();
    doc.styleId = els.styleSelect.value || "";
    doc.content = els.contentEditor.value;
    doc.updatedAt = now();
    ui.selectedDocId = doc.id;
    persist();
    showSaveStatus("已保存", { transient: true, title: `保存位置：${getDocumentLocation(doc)}` });
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
