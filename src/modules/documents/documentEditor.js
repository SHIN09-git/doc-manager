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
  let saveSequence = 0;

  function queueEditorSave() {
    const doc = getCurrentDoc();
    if (!doc || doc.deletedAt) {
      window.clearTimeout(ui.saveTimer);
      showSaveStatus(doc?.deletedAt ? "在垃圾箱中" : "");
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
      return Promise.resolve(false);
    }
    if (doc.deletedAt) {
      showSaveStatus("在垃圾箱中", { title: "请先恢复文档再编辑或保存" });
      return Promise.resolve(false);
    }
    showSaveStatus("保存中");
    doc.title = els.titleInput.value.trim() || "未命名文档";
    const nextType = els.typeSelect.value || "custom";
    if (doc.type !== nextType) doc.writingGenre = "";
    doc.type = nextType;
    doc.folderId = els.folderSelect.value || state.folders[0]?.id || createDefaultFolder();
    doc.styleId = els.styleSelect.value || "";
    doc.content = els.contentEditor.value;
    doc.updatedAt = now();
    ui.selectedDocId = doc.id;
    const sequence = ++saveSequence;
    const persistence = Promise.resolve(persist());
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    return persistence.then((saved) => {
      if (sequence !== saveSequence) return saved !== false;
      if (saved === false) {
        showSaveStatus("未保存", { title: "本机存储写入失败，请导出备份后重试" });
        return false;
      }
      showSaveStatus("已保存", { transient: true, title: `保存位置：${getDocumentLocation(doc)}` });
      if (showToast) showSaveLocation(doc);
      return true;
    });
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
