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
    globalThis.clearTimeout(ui.saveTimer);
    ui.saveTimer = null;
    const doc = getCurrentDoc();
    if (!doc) {
      showSaveStatus("");
      return Promise.resolve(false);
    }
    if (doc.deletedAt) {
      showSaveStatus("在垃圾箱中", { title: "请先恢复文档再编辑或保存" });
      return Promise.resolve(false);
    }
    const next = {
      title: els.titleInput.value.trim() || "未命名文档",
      type: els.typeSelect.value || "custom",
      folderId: els.folderSelect.value || state.folders[0]?.id || createDefaultFolder(),
      styleId: els.styleSelect.value || "",
      content: els.contentEditor.value,
    };
    const changed = Object.keys(next).some((key) => doc[key] !== next[key]);
    const sequence = ++saveSequence;
    if (!changed && !showToast) {
      return Promise.resolve(ui.persistPromise).then((saved) => {
        if (sequence === saveSequence && getCurrentDoc()?.id === doc.id) {
          showSaveStatus(saved === false ? "未保存" : "已保存", { transient: saved !== false });
        }
        return saved !== false;
      });
    }
    showSaveStatus("保存中");
    if (doc.type !== next.type) doc.writingGenre = "";
    Object.assign(doc, next);
    if (changed) doc.updatedAt = now();
    ui.selectedDocId = doc.id;
    const persistence = Promise.resolve(persist());
    if (changed) eventBus.emit(EVENTS.RENDER_DOC_LIST);
    return persistence.then((saved) => {
      if (sequence !== saveSequence || getCurrentDoc()?.id !== doc.id) return saved !== false;
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
