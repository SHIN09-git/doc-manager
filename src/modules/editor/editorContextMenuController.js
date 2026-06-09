import { copyTextToClipboard } from "../../utils/helpers.js";

export function createEditorContextMenuController(deps = {}) {
  const {
    state,
    ui,
    els,
    toast = () => {},
    generationController,
    getCurrentDoc = () => null,
    isSkillEnabled = () => true,
    recordEditorUndoPoint = () => {},
    saveEditor = () => {},
    getSelectionOrLine = () => ({ start: 0, end: 0, text: "" }),
    getPanelElement = () => globalThis.document?.querySelector?.(".editor-panel"),
    createIcons = () => globalThis.window?.lucide?.createIcons?.(),
    clipboard = () => globalThis.navigator?.clipboard,
    documentRef = () => globalThis.document,
    setTimeoutRef = (callback, delay) => globalThis.window?.setTimeout?.(callback, delay) ?? setTimeout(callback, delay),
  } = deps;

  function bindEvents() {
    els.contentEditor?.addEventListener("contextmenu", show);
    els.editorMenu?.addEventListener("click", handleAction);
    els.editorMenu?.addEventListener("keydown", handleKeydown);
  }

  function show(event) {
    event.preventDefault();
    ui.editorMenuReturnFocus = documentRef()?.activeElement || null;
    els.contentEditor.focus();
    syncSkillSelectDefault();
    const panel = getPanelElement();
    const panelRect = panel?.getBoundingClientRect?.() || { left: 0, top: 0, width: 360, height: 240 };
    const menu = els.editorMenu;
    menu.hidden = false;

    const width = menu.offsetWidth || 196;
    const height = menu.offsetHeight || 164;
    const left = Math.min(Math.max(8, event.clientX - panelRect.left), panelRect.width - width - 8);
    const top = Math.min(Math.max(8, event.clientY - panelRect.top), panelRect.height - height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    createIcons();
    setTimeoutRef(() => getMenuItems()[0]?.focus?.(), 0);
  }

  function hide(options = {}) {
    if (!els.editorMenu || els.editorMenu.hidden) return;
    els.editorMenu.hidden = true;
    if (options.restoreFocus) {
      const target = ui.editorMenuReturnFocus?.isConnected ? ui.editorMenuReturnFocus : els.contentEditor;
      target?.focus?.();
    }
    ui.editorMenuReturnFocus = null;
  }

  async function handleAction(event) {
    const button = event.target.closest("button[data-editor-action]");
    if (!button) return;
    const action = button.dataset.editorAction;
    if (action === "copy") {
      await copyText();
    }
    if (action === "delete") {
      deleteText();
    }
    if (action === "rewrite") {
      await generationController.rewriteSelection({
        triggerButton: button,
        mode: button.dataset.rewriteMode || "preserve",
        skillId: els.editorSkillSelect.value,
      });
    }
    if (action === "format") {
      formatDocument();
    }
    if (action === "insert-skill") {
      insertSkill(els.editorSkillSelect.value);
    }
    hide({ restoreFocus: true });
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      hide({ restoreFocus: true });
      return;
    }
    if (event.key === "Tab") {
      hide({ restoreFocus: false });
      return;
    }
    if (event.target === els.editorSkillSelect) return;
    const items = getMenuItems();
    if (items.length === 0) return;
    const currentIndex = items.indexOf(documentRef()?.activeElement);
    const keyMap = {
      ArrowDown: currentIndex < 0 ? 0 : (currentIndex + 1) % items.length,
      ArrowRight: currentIndex < 0 ? 0 : (currentIndex + 1) % items.length,
      ArrowUp: currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length,
      ArrowLeft: currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in keyMap)) return;
    event.preventDefault();
    items[keyMap[event.key]]?.focus?.();
  }

  function syncSkillSelectDefault() {
    if (!els.editorSkillSelect) return;
    const preferred = els.styleSelect?.value || getCurrentDoc()?.styleId || "";
    const hasPreferred = Array.from(els.editorSkillSelect.options || []).some((option) => option.value === preferred);
    if (hasPreferred) {
      els.editorSkillSelect.value = preferred;
    }
  }

  function getMenuItems() {
    return Array.from(els.editorMenu?.querySelectorAll("button[data-editor-action]") || []);
  }

  async function copyText() {
    const selection = getSelectionOrLine();
    if (!selection.text.trim()) {
      toast("没有可复制的内容", "warn");
      return false;
    }
    const copied = await copyTextToClipboard(selection.text, {
      navigator: { clipboard: clipboard() },
      document: documentRef(),
    });
    toast(copied ? "已复制内容" : "复制失败，请手动复制选中内容", copied ? "info" : "warn");
    return copied;
  }

  function deleteText() {
    const selection = getSelectionOrLine();
    if (!selection.text) {
      toast("没有可删除的内容", "warn");
      return false;
    }
    const content = els.contentEditor.value;
    recordEditorUndoPoint();
    els.contentEditor.value = content.slice(0, selection.start) + content.slice(selection.end);
    els.contentEditor.focus();
    els.contentEditor.setSelectionRange(selection.start, selection.start);
    saveEditor(true);
    return true;
  }

  function formatDocument() {
    const editor = els.contentEditor;
    const formatted = editor.value
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (formatted === editor.value) {
      toast("当前格式已经比较规整");
      return false;
    }
    recordEditorUndoPoint();
    editor.value = formatted;
    saveEditor(true);
    return true;
  }

  function insertSkill(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return false;
    if (!isSkillEnabled(skill)) {
      toast(`@${skill.handle} 尚未启用`, "warn");
      return false;
    }
    recordEditorUndoPoint();
    insertTextAtCursor(els.contentEditor, `@${skill.handle} `);
    saveEditor(true);
    toast(`已插入 @${skill.handle}`);
    return true;
  }

  return {
    bindEvents,
    show,
    hide,
    handleAction,
    handleKeydown,
    syncSkillSelectDefault,
    copyText,
    deleteText,
    formatDocument,
    insertSkill,
  };
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || start;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.focus();
  textarea.setSelectionRange(start + text.length, start + text.length);
}
