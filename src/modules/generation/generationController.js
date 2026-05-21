const EDITOR_REWRITE_PRESETS = {
  preserve: "保留原段落的事实、意思和信息顺序，只提升表达的规范性、清晰度和正式程度。",
  style: "保留事实和逻辑，把段落改写为所选执笔人的结构、语气、句式和格式习惯。",
  expand: "在不编造事实的前提下适度扩写，使背景、要求、衔接和执行口径更完整；缺失事实用可替换占位符。",
  shorten: "压缩为更短、更利落的正式表达，保留关键信息、责任对象、时间地点和办理要求。",
};

export function createGenerationController({
  els,
  ui,
  state,
  defaultSystemPrompt,
  toast,
  cancelActiveTask,
  withCancelableTask,
  throwIfTaskAborted,
  getCurrentDoc,
  getType,
  resolveInvokedSkills,
  formatSkillPrompt,
  callAiWithRetry,
  createDocument,
  deriveGeneratedTitle,
  recordEditorUndoPoint,
  saveEditor,
  getDocumentLocation,
  getSelectionOrLine,
}) {
  function bindEvents() {
    els.generateDocBtn?.addEventListener("click", () => generateDocument("new"));
    els.overwriteDraftBtn?.addEventListener("click", () => generateDocument("overwrite"));
    els.insertDraftBtn?.addEventListener("click", () => generateDocument("insert"));
  }

  async function generateDocument(mode = "new") {
    if (cancelActiveTask("document-generation")) return;
    const userPrompt = els.generatePrompt.value.trim();
    const docType = els.typeSelect.value || getCurrentDoc()?.type || "notice";
    const currentDoc = getCurrentDoc();
    if (!userPrompt) {
      toast("请输入起草提示词", "warn");
      return;
    }
    if (mode === "overwrite" && !currentDoc) {
      toast("请先选择要覆盖的当前文档", "warn");
      return;
    }

    const button = mode === "insert" ? els.insertDraftBtn : mode === "overwrite" ? els.overwriteDraftBtn : els.generateDocBtn;
    await withCancelableTask({
      key: "document-generation",
      button,
      busyText: "生成中",
      progressMessage: "AI 正在生成文档",
      cancelToast: "已取消本次文档生成",
    }, async ({ progress, signal }) => {
      progress.update("步骤 1/3：正在整理提示词", 18);
      const type = getType(docType);
      const invokedSkills = resolveInvokedSkills(userPrompt, els.styleSelect.value);
      const prompt = [
        "请根据用户提示词撰写一份中文正式文档。",
        `当前文档类型参考：${type.name}`,
        `常见结构参考：${type.structure}`,
        formatSkillPrompt(invokedSkills),
        `用户提示词：\n${userPrompt}`,
        "输出要求：严格执行被 @ 调用的执笔人规则；直接给出完整文档内容，不要解释写作过程；标题置于首行；事实不明处使用可替换占位符，不要编造。",
      ]
        .filter(Boolean)
        .join("\n\n");
      throwIfTaskAborted(signal);
      progress.update("步骤 2/3：正在请求 AI 生成正文", 42);
      const content = await callAiWithRetry([
        { role: "system", content: state.settings.systemPrompt || defaultSystemPrompt },
        { role: "user", content: prompt },
      ], { signal });
      throwIfTaskAborted(signal);
      progress.update("步骤 3/3：正在写入文档", 82);

      if (mode === "insert") {
        const current = getCurrentDoc() || createDocument({ title: deriveGeneratedTitle(content, userPrompt), type: docType });
        const separator = els.contentEditor.value.trim() ? "\n\n" : "";
        recordEditorUndoPoint();
        els.contentEditor.value = `${els.contentEditor.value}${separator}${content}`;
        saveEditor(true);
        ui.generatedDraft = content;
        toast("已插入到当前文档。");
        return current;
      }

      if (mode === "overwrite") {
        const title = deriveGeneratedTitle(content, userPrompt);
        recordEditorUndoPoint();
        els.titleInput.value = title;
        els.typeSelect.value = docType;
        if (invokedSkills[0]?.id) els.styleSelect.value = invokedSkills[0].id;
        els.contentEditor.value = content;
        saveEditor(true);
        ui.generatedDraft = content;
        toast(`已覆盖当前文档：${getDocumentLocation(getCurrentDoc())}`);
        return getCurrentDoc();
      }

      const title = deriveGeneratedTitle(content, userPrompt);
      const newDoc = createDocument({
        title,
        type: docType,
        styleId: invokedSkills[0]?.id || "",
        content,
      });
      ui.generatedDraft = content;
      toast(`已生成新文档到：${getDocumentLocation(newDoc)}`);
      return null;
    });
  }

  async function rewriteSelection(options = {}) {
    const {
      triggerButton = null,
      mode = "preserve",
      skillId = "",
    } = options;
    if (cancelActiveTask("paragraph-rewrite")) return;
    const selection = getSelectionOrLine();
    if (!selection.text.trim()) {
      toast("请选中或定位到需要重写的段落", "warn");
      return;
    }
    const doc = getCurrentDoc();
    const type = getType(doc?.type || "custom");
    const preset = EDITOR_REWRITE_PRESETS[mode] || EDITOR_REWRITE_PRESETS.preserve;
    const invokedSkills = resolveInvokedSkills(selection.text, skillId || els.styleSelect.value);
    const skillLabel = invokedSkills[0] ? `@${invokedSkills[0].handle}` : "通用规则";
    const runner = async ({ progress, signal }) => {
      progress.update("步骤 1/3：正在整理段落和执笔人规则", 20);
      const prompt = [
        "请改写下面这段正式文档内容。",
        `文档类型：${type.name}`,
        `改写预设：${preset}`,
        formatSkillPrompt(invokedSkills),
        "硬性要求：保留原段落事实信息，不新增未提供的人名、时间、地点、活动名称、数字和落款；事实缺失处使用可替换占位符；只输出改写后的段落，不解释过程。",
        `原段落：\n${selection.text}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      throwIfTaskAborted(signal);
      progress.update(`步骤 2/3：正在按 ${skillLabel} 改写`, 45);
      const rewritten = await callAiWithRetry([
        { role: "system", content: state.settings.systemPrompt || defaultSystemPrompt },
        { role: "user", content: prompt },
      ], { signal });
      throwIfTaskAborted(signal);
      progress.update("步骤 3/3：正在替换选中段落", 85);
      const content = els.contentEditor.value;
      recordEditorUndoPoint();
      els.contentEditor.value = content.slice(0, selection.start) + rewritten + content.slice(selection.end);
      els.contentEditor.focus();
      els.contentEditor.setSelectionRange(selection.start, selection.start + rewritten.length);
      saveEditor(true);
      toast(`段落已按 ${skillLabel} 改写`);
    };
    await withCancelableTask({
      key: "paragraph-rewrite",
      button: triggerButton,
      busyText: "改写中",
      progressMessage: "AI 正在改写选中段落",
      cancelToast: "已取消本次段落改写",
    }, runner);
  }

  return {
    bindEvents,
    generateDocument,
    rewriteSelection,
  };
}
