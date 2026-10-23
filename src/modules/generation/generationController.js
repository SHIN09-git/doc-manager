import { isGongwenWriter, resolveGongwenGenre } from "../skills/gongwenWriter.js";
import { findPlaceholders } from "../../utils/placeholders.js";

const EDITOR_REWRITE_PRESETS = {
  preserve: "保留原段落的事实、意思和信息顺序，只提升表达的规范性、清晰度和正式程度。",
  style: "保留事实和逻辑，把段落改写为所选执笔人的结构、语气、句式和格式习惯。",
  expand: "在不编造事实的前提下适度扩写，使背景、要求、衔接和执行口径更完整；缺失事实用可替换占位符。",
  shorten: "压缩为更短、更利落的正式表达，保留关键信息、责任对象、时间地点和办理要求。",
};

const REVISION_CONTEXT_LIMIT = 600;

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
  getReferenceContext = () => ({ text: "", items: [] }),
  skillInputForm = null,
  onDocumentGenerated = () => {},
}) {
  function bindEvents() {
    els.generateDocBtn?.addEventListener("click", () => generateDocument("new"));
    els.overwriteDraftBtn?.addEventListener("click", () => generateDocument("overwrite"));
    els.insertDraftBtn?.addEventListener("click", () => generateDocument("insert"));
    els.aiRevisionBtn?.addEventListener("click", () => reviseSelectionByInstruction());
    els.aiRevisionPrompt?.addEventListener("keydown", handleRevisionPromptKeydown);
    els.aiRevisionBar?.addEventListener("click", handleRevisionPreset);
    ["select", "click", "keyup", "input"].forEach((eventName) => {
      els.contentEditor?.addEventListener(eventName, syncRevisionTarget);
    });
    syncRevisionTarget();
  }

  function handleRevisionPromptKeydown(event) {
    if (event.key !== "Enter" || !event.ctrlKey) return;
    event.preventDefault();
    reviseSelectionByInstruction();
  }

  function handleRevisionPreset(event) {
    const button = event.target?.closest?.("[data-ai-revision-preset]");
    if (!button || !els.aiRevisionPrompt) return;
    els.aiRevisionPrompt.value = button.dataset.aiRevisionPreset || "";
    focusRevisionInput();
  }

  async function generateDocument(mode = "new") {
    if (cancelActiveTask("document-generation")) return;
    const rawPrompt = els.generatePrompt.value.trim();
    const docType = els.typeSelect.value || getCurrentDoc()?.type || "notice";
    const currentDoc = getCurrentDoc();
    const references = getReferenceContext();
    if (!rawPrompt && !references.text && !skillInputForm?.hasValues?.()) {
      toast("请输入起草提示词，或添加参考资料", "warn");
      return;
    }
    if (mode === "overwrite" && !currentDoc) {
      toast("请先选择要覆盖的当前文档", "warn");
      return;
    }
    if (skillInputForm && !skillInputForm.checkBeforeGenerate(rawPrompt)) return;
    const userPrompt = rawPrompt || "请依据下方结构化输入和参考资料起草。";
    const formSection = skillInputForm?.getPromptSection?.(rawPrompt) || "";
    const editorTarget = captureEditorTarget();

    const button = mode === "insert" ? els.insertDraftBtn : mode === "overwrite" ? els.overwriteDraftBtn : els.generateDocBtn;
    await withCancelableTask({
      key: "document-generation",
      button,
      busyText: "生成中",
      progressMessage: "AI 正在生成文档",
      cancelToast: "已取消本次文档生成",
    }, async ({ progress, signal }) => {
      progress.update(
        references.items.length ? `步骤 1/3：正在整理提示词和 ${references.items.length} 份参考资料` : "步骤 1/3：正在整理提示词",
        18,
      );
      const type = getType(docType);
      const invokedSkills = resolveInvokedSkills(userPrompt, els.styleSelect.value);
      const writingContext = {
        genre: els.gongwenGenreSelect?.value || "auto", task: userPrompt, documentType: docType,
      };
      const selectedGenre = invokedSkills.some(isGongwenWriter) ? resolveGongwenGenre(writingContext) : "";
      const prompt = [
        "请根据用户提示词撰写一份中文正式文档。",
        `当前文档类型参考：${selectedGenre || type.name}`,
        selectedGenre ? "" : `常见结构参考：${type.structure}`,
        formatSkillPrompt(invokedSkills, writingContext),
        `用户提示词：\n${userPrompt}`,
        formSection,
        references.text,
        "输出格式：第一行仅写标题，空一行后输出正文；不要使用 Markdown 代码块。工作台会把标题与正文分开保存，因此正文中不要再次重复标题。",
        "其他要求：严格执行被 @ 调用的执笔人规则；不要解释写作过程；事实不明处使用【可替换占位符】，不要编造。",
      ]
        .filter(Boolean)
        .join("\n\n");
      throwIfTaskAborted(signal);
      progress.update("步骤 2/3：正在请求 AI 生成正文", 42);
      const rawContent = await callAiWithRetry([
        { role: "system", content: state.settings.systemPrompt || defaultSystemPrompt },
        { role: "user", content: prompt },
      ], { signal, taskType: "document_generation" });
      throwIfTaskAborted(signal);
      progress.update("步骤 3/3：正在写入文档", 82);

      const generated = splitGeneratedDocument(rawContent, userPrompt, deriveGeneratedTitle);
      const body = generated.body || normalizeAiBlock(rawContent);
      const placeholderCount = findPlaceholders(body).length;
      const pendingNote = placeholderCount ? `；还有 ${placeholderCount} 处待填内容，可在“待填”清单中补全` : "";

      if ((mode === "insert" || mode === "overwrite") && !isEditorTargetUnchanged(editorTarget)) {
        toast("文档已切换、移除或修改，本次生成结果未写入；请确认目标文档后重新生成", "warn");
        return false;
      }

      if (mode === "insert") {
        const current = getCurrentDoc() || createDocument({ title: generated.title, type: docType });
        recordEditorUndoPoint();
        const insertedRange = insertBlockAtCursor(els.contentEditor, body, editorTarget.insertionEnd);
        saveEditor(true);
        ui.generatedDraft = body;
        syncRevisionTarget();
        toast(`已插入到光标位置：${getDocumentLocation(current)}${pendingNote}`);
        onDocumentGenerated({ skills: [] });
        return insertedRange;
      }

      if (mode === "overwrite") {
        recordEditorUndoPoint();
        els.titleInput.value = generated.title;
        els.typeSelect.value = docType;
        if (invokedSkills[0]?.id) els.styleSelect.value = invokedSkills[0].id;
        els.contentEditor.value = body;
        getCurrentDoc().writingGenre = selectedGenre;
        saveEditor(true);
        ui.generatedDraft = body;
        syncRevisionTarget();
        toast(`已覆盖当前文档：${getDocumentLocation(getCurrentDoc())}${pendingNote}`);
        onDocumentGenerated({ skills: invokedSkills, ...writingContext });
        return getCurrentDoc();
      }

      const newDoc = createDocument({
        title: generated.title,
        type: docType,
        styleId: invokedSkills[0]?.id || "",
        writingGenre: selectedGenre,
        content: body,
      });
      ui.generatedDraft = body;
      syncRevisionTarget();
      toast(`已生成新文档到：${getDocumentLocation(newDoc)}${pendingNote}`);
      onDocumentGenerated({ skills: invokedSkills, ...writingContext });
      return null;
    });
  }

  async function reviseSelectionByInstruction(options = {}) {
    const instruction = String(options.instruction ?? els.aiRevisionPrompt?.value ?? "").trim();
    if (!instruction) {
      toast("请先说明这段内容要怎么修改", "warn");
      focusRevisionInput();
      return false;
    }
    return runSelectionRevision({
      instruction,
      triggerButton: options.triggerButton || els.aiRevisionBtn,
      skillId: options.skillId || "",
      clearInstructionOnSuccess: options.clearInstructionOnSuccess !== false,
      successMessage: ({ explicitSelection, skillLabel }) =>
        `${explicitSelection ? "选中内容" : "当前段落"}已按 ${skillLabel} 原位修改，可使用撤销恢复`,
    });
  }

  async function rewriteSelection(options = {}) {
    const {
      triggerButton = null,
      mode = "preserve",
      skillId = "",
    } = options;
    const instruction = EDITOR_REWRITE_PRESETS[mode] || EDITOR_REWRITE_PRESETS.preserve;
    return runSelectionRevision({
      instruction,
      triggerButton,
      skillId,
      successMessage: ({ skillLabel }) => `段落已按 ${skillLabel} 改写，可使用撤销恢复`,
    });
  }

  async function runSelectionRevision({
    instruction,
    triggerButton = null,
    skillId = "",
    clearInstructionOnSuccess = false,
    successMessage,
  }) {
    if (cancelActiveTask("paragraph-rewrite")) return false;
    const selection = getSelectionOrLine();
    if (!selection.text.trim()) {
      toast("请选中或定位到需要修改的段落", "warn");
      return false;
    }

    const editorTarget = captureEditorTarget();
    const sourceContent = els.contentEditor.value;
    const explicitSelection = els.contentEditor.selectionStart !== els.contentEditor.selectionEnd;
    const doc = getCurrentDoc();
    const type = getType(doc?.type || "custom");
    const invokedSkills = resolveInvokedSkills(`${instruction}\n${selection.text}`, skillId || els.styleSelect.value);
    const skillLabel = invokedSkills[0] ? `@${invokedSkills[0].handle}` : "通用规则";
    const contextBefore = sourceContent.slice(Math.max(0, selection.start - REVISION_CONTEXT_LIMIT), selection.start).trim();
    const contextAfter = sourceContent.slice(selection.end, selection.end + REVISION_CONTEXT_LIMIT).trim();

    return withCancelableTask({
      key: "paragraph-rewrite",
      button: triggerButton,
      busyText: "修改中",
      progressMessage: "AI 正在原位修改正文",
      cancelToast: "已取消本次正文修改",
    }, async ({ progress, signal }) => {
      progress.update("步骤 1/3：正在整理选中内容和修改要求", 20);
      const prompt = [
        "请根据用户本次修改要求，只修改目标片段，并返回可直接替换原文的结果。",
        `文档类型：${type.name}`,
        `用户本次修改要求（在不改变事实的前提下优先执行）：\n${instruction}`,
      formatSkillPrompt(invokedSkills, {
        mode: "paragraph", genre: doc?.writingGenre || "auto",
        task: `${doc?.title || ""}\n${instruction}`, documentType: doc?.type,
      }),
        contextBefore ? `上文（只用于保持衔接，不要输出）：\n${contextBefore}` : "",
        `目标片段：\n${selection.text}`,
        contextAfter ? `下文（只用于保持衔接，不要输出）：\n${contextAfter}` : "",
        "硬性要求：保留原文事实，不新增未提供的人名、时间、地点、活动名称、数字、政策依据和落款；除非用户明确要求改变结构，否则保持原片段的段落数量、换行、编号、列表层级和首行缩进；只输出替换后的文字，不要标题、说明、引号或 Markdown 代码块。",
      ]
        .filter(Boolean)
        .join("\n\n");
      throwIfTaskAborted(signal);
      progress.update(`步骤 2/3：正在按 ${skillLabel} 修改`, 45);
      const response = await callAiWithRetry([
        { role: "system", content: state.settings.systemPrompt || defaultSystemPrompt },
        { role: "user", content: prompt },
      ], { signal, taskType: "paragraph_rewrite" });
      throwIfTaskAborted(signal);
      const rewritten = normalizeAiReplacement(response, selection.text);
      if (!rewritten.trim()) {
        throw new Error("AI 未返回可用的修改内容，请重新描述修改要求");
      }
      if (!isEditorTargetUnchanged(editorTarget)) {
        toast("文档或正文在 AI 修改期间发生了变化，结果未覆盖；请重新选择后再试", "warn");
        return false;
      }

      progress.update("步骤 3/3：正在原位替换", 85);
      recordEditorUndoPoint();
      els.contentEditor.value = sourceContent.slice(0, selection.start) + rewritten + sourceContent.slice(selection.end);
      els.contentEditor.focus();
      els.contentEditor.setSelectionRange(selection.start, selection.start + rewritten.length);
      saveEditor(true);
      if (clearInstructionOnSuccess && els.aiRevisionPrompt) els.aiRevisionPrompt.value = "";
      syncRevisionTarget();
      toast(successMessage?.({ explicitSelection, skillLabel }) || "正文已原位修改");
      onDocumentGenerated({ skills: [] });
      return true;
    });
  }

  function focusRevisionInput() {
    syncRevisionTarget();
    els.aiRevisionBar?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    els.aiRevisionPrompt?.focus?.();
  }

  // 异步请求返回前，编辑器可能已切换到另一篇文档或被用户继续修改。
  function captureEditorTarget() {
    return {
      docId: getCurrentDoc()?.id ?? null,
      values: Object.fromEntries(
        ["contentEditor", "titleInput", "typeSelect", "folderSelect", "styleSelect"]
          .map((key) => [key, els[key]?.value]),
      ),
      insertionEnd: els.contentEditor.selectionEnd,
    };
  }

  function isEditorTargetUnchanged(target) {
    const doc = getCurrentDoc();
    return !doc?.deletedAt
      && (doc?.id ?? null) === target.docId
      && Object.entries(target.values).every(([key, value]) => els[key]?.value === value);
  }

  function syncRevisionTarget() {
    if (!els.aiRevisionTarget || !els.contentEditor) return;
    const selection = getSelectionOrLine();
    const explicitSelection = els.contentEditor.selectionStart !== els.contentEditor.selectionEnd;
    const length = selection.text.trim().length;
    if (!length) {
      els.aiRevisionTarget.textContent = "当前没有可修改的正文";
      if (els.aiRevisionBtn && !ui.activeTasks?.["paragraph-rewrite"]) els.aiRevisionBtn.disabled = true;
      els.aiRevisionBar?.classList?.remove?.("has-selection");
      return;
    }
    els.aiRevisionTarget.textContent = explicitSelection
      ? `已选中 ${length} 字，将原位替换`
      : `当前段落 ${length} 字，将原位替换`;
    if (els.aiRevisionBtn && !ui.activeTasks?.["paragraph-rewrite"]) els.aiRevisionBtn.disabled = false;
    els.aiRevisionBar?.classList?.toggle?.("has-selection", explicitSelection);
  }

  return {
    bindEvents,
    generateDocument,
    reviseSelectionByInstruction,
    rewriteSelection,
    focusRevisionInput,
    syncRevisionTarget,
  };
}

export function splitGeneratedDocument(content, prompt, deriveGeneratedTitle) {
  const normalized = normalizeAiBlock(content);
  const title = deriveGeneratedTitle(normalized, prompt);
  const lines = normalized.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex < 0) return { title, body: "" };

  const firstLine = cleanGeneratedHeading(lines[firstIndex]);
  const hasBody = lines.slice(firstIndex + 1).some((line) => line.trim());
  if (!hasBody || normalizeHeading(firstLine) !== normalizeHeading(title)) {
    return { title, body: normalized };
  }

  const bodyLines = lines.slice(firstIndex + 1);
  while (bodyLines[0] != null && !bodyLines[0].trim()) bodyLines.shift();
  return { title, body: bodyLines.join("\n").trim() };
}

export function normalizeAiReplacement(value, originalText = "") {
  const original = String(originalText || "");
  const leadingWhitespace = original.match(/^\s*/)?.[0] || "";
  const trailingWhitespace = original.match(/\s*$/)?.[0] || "";
  const normalized = normalizeAiBlock(value)
    .replace(/^(?:修改后|改写后|优化后)(?:的?(?:内容|文本|段落))?[：:]\s*/u, "")
    .trim();
  return `${leadingWhitespace}${normalized}${trailingWhitespace}`;
}

function normalizeAiBlock(value) {
  return String(value ?? "")
    .replace(/^\s*```(?:markdown|md|text)?\s*\r?\n?/i, "")
    .replace(/\r?\n?```\s*$/i, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function cleanGeneratedHeading(value) {
  return String(value || "")
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .trim();
}

function normalizeHeading(value) {
  return cleanGeneratedHeading(value)
    .replace(/[\s　*_#《》“”"':：，。,.、-]/g, "")
    .toLowerCase();
}

function insertBlockAtCursor(editor, value, selectionEnd = editor.selectionEnd) {
  const text = String(value || "").trim();
  const position = Number.isInteger(selectionEnd) ? selectionEnd : editor.value.length;
  const before = editor.value.slice(0, position);
  const after = editor.value.slice(position);
  const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const inserted = `${prefix}${text}${suffix}`;
  editor.value = before + inserted + after;
  const start = position + prefix.length;
  editor.focus();
  editor.setSelectionRange(start, start + text.length);
  return { start, end: start + text.length };
}
