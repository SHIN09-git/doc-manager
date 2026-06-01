import { isFileDragData } from "../../utils/dragDrop.js";
import { getDropImportTarget } from "../../utils/dropRouting.js";

export function createImportDropController(deps = {}) {
  const {
    els = {},
    documentRef = () => globalThis.document,
    windowRef = () => globalThis.window,
    resolveDropTarget = getDropImportTarget,
    importDocumentFiles = async () => {},
    importStyleDropFiles = async () => {},
    importPptPromptFiles = async () => {},
  } = deps;

  function setupFileDrop(target, handler) {
    if (!target) return false;
    ["dragenter", "dragover"].forEach((eventName) => {
      target.addEventListener(eventName, (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        target.classList.add("drag-over");
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      target.addEventListener(eventName, () => target.classList.remove("drag-over"));
    });
    target.addEventListener("drop", async (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("drag-over");
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0) {
        await handler(files);
      }
    });
    return true;
  }

  function setupDocumentDrop(target, handler) {
    if (!target) return false;
    ["dragenter", "dragover"].forEach((eventName) => {
      target.addEventListener(eventName, (event) => {
        if (!isDocumentDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        target.classList.add("drag-over");
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      target.addEventListener(eventName, () => target.classList.remove("drag-over"));
    });
    target.addEventListener("drop", (event) => {
      if (!isDocumentDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("drag-over");
      const docId = event.dataTransfer?.getData("application/x-mowen-doc-id");
      if (docId) handler(docId);
    });
    return true;
  }

  function preventWindowFileNavigation() {
    ["dragover", "drop"].forEach((eventName) => {
      windowRef()?.addEventListener?.(eventName, async (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (eventName !== "drop") return;
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length === 0) return;
        await importFilesFromGlobalDrop(files);
      });
    });
  }

  async function importFilesFromGlobalDrop(files) {
    const activePanelId = documentRef()?.querySelector?.(".tab-panel.active")?.id || "";
    const target = resolveDropTarget(activePanelId, {
      skillBuilderOpen: Boolean(els.skillBuilderModal && !els.skillBuilderModal.hidden),
    });
    if (target === "ppt") {
      await importPptPromptFiles(files);
      return "ppt";
    }
    if (target === "style" || target === "skill-builder") {
      await importStyleDropFiles(files);
      return target;
    }
    await importDocumentFiles(files);
    return "document";
  }

  function isFileDrag(event) {
    return isFileDragData(event?.dataTransfer);
  }

  function isDocumentDrag(event) {
    return Array.from(event?.dataTransfer?.types || []).includes("application/x-mowen-doc-id");
  }

  return {
    setupFileDrop,
    setupDocumentDrop,
    preventWindowFileNavigation,
    importFilesFromGlobalDrop,
    isFileDrag,
    isDocumentDrag,
  };
}
