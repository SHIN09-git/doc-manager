import { EVENTS } from "../../core/eventBus.js";
import { clone, createId, escapeHtml, normalizeHandle, now } from "../../utils/helpers.js";

export const BUILT_IN_SKILL_CATEGORIES = ["公文写作", "文风格式", "材料整理", "段落改写", "自定义"];

export function createSkillBuilderModalController(deps = {}) {
  const {
    state = { styles: [], docs: [] },
    ui = {},
    els = {},
    eventBus = { emit: () => {} },
    toast = () => {},
    createEmptyStyle = () => ({}),
    flushSkillMarkdownEdits = () => {},
    hideSkillDetailMenu = () => {},
    renderStyleExamples = () => {},
    renderSkillDetailExamples = () => {},
    setupFileDrop = () => {},
    importStyleExamples = () => {},
    importStyleDropFiles = () => {},
    summarizeStyle = () => {},
    saveStyle = () => {},
    deleteStyle = () => {},
    getFocusableElements = () => [],
    documentRef = () => globalThis.document,
    setTimeoutRef = (callback, delay = 0) => globalThis.window?.setTimeout?.(callback, delay) ?? setTimeout(callback, delay),
    createIcons = () => globalThis.window?.lucide?.createIcons?.(),
  } = deps;

  function bindEvents() {
    els.newStyleBtn?.addEventListener("click", () => open());
    els.styleFileInput?.addEventListener("change", importStyleExamples);
    if (els.styleDropZone) {
      setupFileDrop(els.styleDropZone, importStyleDropFiles);
      els.styleDropZone.addEventListener("click", (event) => {
        event.preventDefault();
        els.styleFileInput?.click?.();
      });
      els.styleDropZone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          els.styleFileInput?.click?.();
        }
      });
    }
    els.closeSkillBuilderModalBtn?.addEventListener("click", () => close());
    els.skillBuilderCancelBtn?.addEventListener("click", () => close());
    els.skillBuilderModal?.addEventListener("mousedown", (event) => {
      if (event.target === els.skillBuilderModal) close();
    });
    els.skillBuilderModal?.addEventListener("keydown", handleKeydown);
    els.summarizeStyleBtn?.addEventListener("click", summarizeStyle);
    els.saveStyleBtn?.addEventListener("click", saveStyle);
    els.deleteStyleBtn?.addEventListener("click", deleteStyle);
    els.styleNameInput?.addEventListener("input", syncNameInput);
    els.skillCategorySelect?.addEventListener("change", handleCategoryChange);
    els.skillCustomCategoryInput?.addEventListener("input", () => {
      if (ui.editingStyle) ui.editingStyle.category = getSelectedCategory();
    });
    els.skillDescriptionInput?.addEventListener("input", () => {
      if (ui.editingStyle) ui.editingStyle.description = els.skillDescriptionInput.value;
    });
    els.addSourceDocsToSkillBtn?.addEventListener("click", addSelectedDocsAsExamples);
    els.skillEnabledInput?.addEventListener("change", () => {
      if (ui.editingStyle) ui.editingStyle.enabled = els.skillEnabledInput.checked;
      eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
      eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    });
    els.skillAnalysisInput?.addEventListener("input", () => {
      if (ui.editingStyle) ui.editingStyle.analysis = els.skillAnalysisInput.value;
    });
    els.skillAggregationInput?.addEventListener("input", () => {
      if (ui.editingStyle) ui.editingStyle.aggregation = els.skillAggregationInput.value;
    });
  }

  function open(skillId = null) {
    flushSkillMarkdownEdits();
    const skill = skillId ? state.styles.find((item) => item.id === skillId) : null;
    const activeElement = documentRef()?.activeElement;
    ui.skillBuilderReturnFocus = activeElement && typeof activeElement.focus === "function" ? activeElement : null;
    ui.editingStyle = clone(skill || createEmptyStyle());
    if (!skill) {
      ui.editingStyle.handle = normalizeHandle(ui.editingStyle.name || "");
    }
    hideSkillDetailMenu();
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    renderDocumentPicker();
    updateCategoryCustomState(ui.editingStyle.category);
    if (els.skillBuilderModalTitle) {
      els.skillBuilderModalTitle.textContent = skill ? `重训：${skill.name || "未命名执笔人"}` : "新建执笔人";
    }
    if (els.skillBuilderModeLabel) {
      els.skillBuilderModeLabel.textContent = skill
        ? `已有 ${(skill.examples || []).length} 篇历史样本将一并参与训练，可移除后重训。`
        : "拖入同类正式文档，生成可复用的写作规则。";
    }
    if (els.saveStyleBtn) els.saveStyleBtn.hidden = !skill;
    if (els.deleteStyleBtn) els.deleteStyleBtn.hidden = !skill;
    if (els.skillBuilderModal) els.skillBuilderModal.hidden = false;
    setTimeoutRef(() => {
      els.styleNameInput?.focus?.();
      createIcons();
    }, 0);
  }

  function close({ restoreFocus = true } = {}) {
    if (!els.skillBuilderModal || els.skillBuilderModal.hidden) return;
    els.skillBuilderModal.hidden = true;
    if (restoreFocus && ui.skillBuilderReturnFocus) {
      ui.skillBuilderReturnFocus.focus?.();
    }
    ui.skillBuilderReturnFocus = null;
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(els.skillBuilderModal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = documentRef()?.activeElement;
    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus?.();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus?.();
    }
  }

  function getSelectedCategory() {
    if (els.skillCategorySelect?.value === "自定义") {
      return els.skillCustomCategoryInput?.value.trim() || "自定义";
    }
    return els.skillCategorySelect?.value || "自定义";
  }

  function updateCategoryCustomState(category = getSelectedCategory()) {
    if (!els.skillCustomCategoryInput || !els.skillCategorySelect) return;
    const shouldUseCustom = !BUILT_IN_SKILL_CATEGORIES.includes(category) || els.skillCategorySelect.value === "自定义";
    if (!BUILT_IN_SKILL_CATEGORIES.includes(category)) {
      els.skillCategorySelect.value = "自定义";
      els.skillCustomCategoryInput.value = category || "";
    }
    if (els.skillCustomCategoryField) els.skillCustomCategoryField.hidden = !shouldUseCustom;
  }

  function renderDocumentPicker() {
    if (!els.skillSourceDocSelect) return;
    const docs = (state.docs || []).filter((doc) => !doc.deletedAt && String(doc.content || "").trim());
    if (docs.length === 0) {
      els.skillSourceDocSelect.innerHTML = '<option disabled>文档库暂无可用正文</option>';
      els.skillSourceDocSelect.disabled = true;
      if (els.addSourceDocsToSkillBtn) els.addSourceDocsToSkillBtn.disabled = true;
      return;
    }
    els.skillSourceDocSelect.disabled = false;
    if (els.addSourceDocsToSkillBtn) els.addSourceDocsToSkillBtn.disabled = false;
    els.skillSourceDocSelect.innerHTML = docs
      .map((doc) => `<option value="${escapeHtml(doc.id)}">${escapeHtml(doc.title || "未命名文档")}</option>`)
      .join("");
  }

  function addSelectedDocsAsExamples() {
    if (!ui.editingStyle) {
      toast("请先打开执笔人生成窗口", "warn");
      return 0;
    }
    const selectedIds = Array.from(els.skillSourceDocSelect?.selectedOptions || []).map((option) => option.value);
    if (selectedIds.length === 0) {
      toast("请先选择要加入训练的文档", "warn");
      return 0;
    }
    ui.editingStyle.examples = Array.isArray(ui.editingStyle.examples) ? ui.editingStyle.examples : [];
    const existingSourceIds = new Set(ui.editingStyle.examples.map((example) => example.sourceDocId).filter(Boolean));
    let addedCount = 0;
    selectedIds.forEach((docId) => {
      if (existingSourceIds.has(docId)) return;
      const doc = state.docs.find((item) => item.id === docId && !item.deletedAt);
      if (!doc || !String(doc.content || "").trim()) return;
      ui.editingStyle.examples.push({
        id: createId(),
        sourceDocId: doc.id,
        name: `${doc.title || "未命名文档"}.txt`,
        text: doc.content,
        addedAt: now(),
        importedFrom: "workspace-doc",
      });
      existingSourceIds.add(docId);
      addedCount += 1;
    });
    if (addedCount === 0) {
      toast("所选文档已在训练样本中", "warn");
      return 0;
    }
    renderStyleExamples();
    renderSkillDetailExamples();
    toast(`已加入 ${addedCount} 份文档库样本`);
    return addedCount;
  }

  function syncNameInput() {
    if (!ui.editingStyle) return;
    ui.editingStyle.name = els.styleNameInput.value;
    ui.editingStyle.handle = normalizeHandle(els.styleNameInput.value);
    if (els.skillHandleInput) els.skillHandleInput.value = ui.editingStyle.handle;
  }

  function handleCategoryChange() {
    updateCategoryCustomState();
    if (ui.editingStyle) ui.editingStyle.category = getSelectedCategory();
    if (els.skillCategorySelect.value === "自定义") {
      setTimeoutRef(() => els.skillCustomCategoryInput?.focus?.(), 0);
    }
  }

  return {
    bindEvents,
    open,
    close,
    handleKeydown,
    getSelectedCategory,
    updateCategoryCustomState,
    renderDocumentPicker,
    addSelectedDocsAsExamples,
  };
}
