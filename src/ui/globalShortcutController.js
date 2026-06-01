export function createGlobalShortcutController(deps = {}) {
  const {
    els = {},
    documentRef = () => globalThis.document,
    editorContextMenuController = { hide: () => {} },
    skillMentionController = { hide: () => {} },
    layoutController = { closeResponsiveInspector: () => {} },
    closeSkillBuilderModal = () => {},
    saveEditor = () => {},
    undoEditorChange = () => {},
  } = deps;

  function bindEvents() {
    documentRef()?.addEventListener?.("keydown", handleKeydown);
    els.saveDocBtn?.setAttribute?.("aria-keyshortcuts", shortcutLabel("S"));
    els.undoEditBtn?.setAttribute?.("aria-keyshortcuts", shortcutLabel("Z"));
  }

  function handleKeydown(event) {
    if (!event || event.isComposing) return false;
    if (event.key === "Escape") {
      handleEscape();
      return true;
    }
    if (!isPrimaryShortcut(event)) return false;
    const key = String(event.key || "").toLowerCase();
    if (key === "s" && isDocumentEditorTarget(event.target)) {
      event.preventDefault?.();
      saveEditor(true);
      return true;
    }
    if (key === "z" && !event.shiftKey && event.target === els.contentEditor) {
      event.preventDefault?.();
      undoEditorChange();
      return true;
    }
    return false;
  }

  function handleEscape() {
    editorContextMenuController.hide?.({ restoreFocus: true });
    skillMentionController.hide?.();
    if (els.skillBuilderModal && !els.skillBuilderModal.hidden) {
      closeSkillBuilderModal();
    }
    layoutController.closeResponsiveInspector?.();
  }

  function isDocumentEditorTarget(target) {
    return [els.titleInput, els.contentEditor, els.typeSelect, els.folderSelect, els.styleSelect].includes(target);
  }

  return {
    bindEvents,
    handleKeydown,
    handleEscape,
    isDocumentEditorTarget,
  };
}

function isPrimaryShortcut(event) {
  return Boolean((event.ctrlKey || event.metaKey) && !event.altKey);
}

function shortcutLabel(key) {
  const isMac = /mac/i.test(globalThis.navigator?.platform || "");
  return `${isMac ? "Meta" : "Control"}+${key}`;
}
