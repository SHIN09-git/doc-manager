export function createFindReplaceController(deps = {}) {
  const {
    els = {},
    toast = () => {},
    recordEditorUndoPoint = () => {},
    saveEditor = () => {},
  } = deps;

  function bindEvents() {
    els.replaceToggleBtn?.addEventListener("click", toggleReplaceBar);
    els.findNextBtn?.addEventListener("click", findNext);
    els.replaceNextBtn?.addEventListener("click", replaceNext);
    els.replaceAllBtn?.addEventListener("click", replaceAll);
    els.findInput?.addEventListener("input", updateFindStatus);
    els.contentEditor?.addEventListener("input", updateFindStatus);
    els.findInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      findNext();
    });
  }

  function toggleReplaceBar() {
    const shouldOpen = els.replaceBar.hidden;
    els.replaceBar.hidden = !shouldOpen;
    els.replaceBar.classList.toggle("collapsed", !shouldOpen);
    els.replaceToggleBtn.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) {
      els.findInput.focus();
      updateFindStatus();
    }
    return shouldOpen;
  }

  function getMatches(findText = els.findInput?.value || "") {
    const text = String(findText || "");
    if (!text) return [];
    const content = els.contentEditor?.value || "";
    const matches = [];
    let index = content.indexOf(text);
    while (index !== -1) {
      matches.push(index);
      index = content.indexOf(text, index + text.length);
    }
    return matches;
  }

  function getNextMatchIndex(findText = els.findInput?.value || "") {
    const matches = getMatches(findText);
    if (matches.length === 0) return { index: -1, matchNumber: 0, total: 0 };
    const startAt = els.contentEditor?.selectionEnd || 0;
    const nextIndex = matches.findIndex((matchIndex) => matchIndex >= startAt);
    const matchNumber = nextIndex === -1 ? 1 : nextIndex + 1;
    return {
      index: nextIndex === -1 ? matches[0] : matches[nextIndex],
      matchNumber,
      total: matches.length,
    };
  }

  function selectMatch(index, findText) {
    const editor = els.contentEditor;
    editor.focus();
    editor.setSelectionRange(index, index + findText.length);
  }

  function getSelectedFindMatch(findText = els.findInput?.value || "") {
    const editor = els.contentEditor;
    const start = editor.selectionStart || 0;
    const end = editor.selectionEnd || start;
    if (start === end) return null;
    if (editor.value.slice(start, end) !== findText) return null;
    const matchNumber = getMatches(findText).findIndex((index) => index === start) + 1;
    return { start, end, matchNumber };
  }

  function updateFindStatus() {
    if (!els.findStatus) return;
    const findText = els.findInput?.value || "";
    if (!findText) {
      els.findStatus.textContent = "输入查找内容";
      return;
    }
    const matches = getMatches(findText);
    if (matches.length === 0) {
      els.findStatus.textContent = "0 处匹配";
      return;
    }
    const selected = getSelectedFindMatch(findText);
    if (selected?.matchNumber > 0) {
      els.findStatus.textContent = `第 ${selected.matchNumber} / 共 ${matches.length} 处`;
      return;
    }
    els.findStatus.textContent = `共 ${matches.length} 处`;
  }

  function findNext() {
    const findText = els.findInput.value;
    if (!findText) {
      toast("请输入查找内容", "warn");
      els.findInput.focus();
      updateFindStatus();
      return -1;
    }
    const match = getNextMatchIndex(findText);
    if (match.index === -1) {
      toast("没有找到匹配内容", "warn");
      updateFindStatus();
      return -1;
    }
    selectMatch(match.index, findText);
    updateFindStatus();
    toast(`已找到第 ${match.matchNumber} / 共 ${match.total} 处：第 ${match.index + 1} 个字符处`);
    return match.index;
  }

  function replaceNext() {
    const findText = els.findInput.value;
    const replacement = els.replaceInput.value;
    if (!findText) {
      toast("请输入查找内容", "warn");
      els.findInput.focus();
      updateFindStatus();
      return false;
    }
    const editor = els.contentEditor;
    const content = editor.value;
    const currentMatch = getSelectedFindMatch(findText);
    const nextMatch = currentMatch ? { index: currentMatch.start } : getNextMatchIndex(findText);
    const index = nextMatch.index;
    if (index === -1) {
      toast("没有找到匹配内容", "warn");
      updateFindStatus();
      return false;
    }
    const end = currentMatch?.end ?? index + findText.length;
    recordEditorUndoPoint();
    editor.value = content.slice(0, index) + replacement + content.slice(end);
    editor.focus();
    editor.setSelectionRange(index, index + replacement.length);
    saveEditor(true);
    updateFindStatus();
    return true;
  }

  function replaceAll() {
    const findText = els.findInput.value;
    const replacement = els.replaceInput.value;
    if (!findText) {
      toast("请输入查找内容", "warn");
      els.findInput.focus();
      updateFindStatus();
      return 0;
    }
    const editor = els.contentEditor;
    const count = getMatches(findText).length;
    if (count === 0) {
      toast("没有找到匹配内容", "warn");
      updateFindStatus();
      return 0;
    }
    recordEditorUndoPoint();
    editor.value = editor.value.split(findText).join(replacement);
    saveEditor(true);
    updateFindStatus();
    toast(`已替换 ${count} 处`);
    return count;
  }

  return {
    bindEvents,
    toggleReplaceBar,
    getMatches,
    getNextMatchIndex,
    updateFindStatus,
    findNext,
    replaceNext,
    replaceAll,
  };
}
