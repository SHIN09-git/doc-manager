import { EVENTS } from "../../core/eventBus.js";
import { createId, now } from "../../utils/helpers.js";

export function createSkillDetailController(deps = {}) {
  const {
    ui = {},
    els = {},
    eventBus = { emit: () => {} },
    skillRenderer,
    skillBuilder,
    toast = () => {},
    syncEditingStyleFromInputs = () => ui.editingStyle || {},
    parseSkillJsonObject = (value) => JSON.parse(value || "{}"),
    commitSkillToState = (style) => style,
    getSkillLocation = (style) => style?.name || "执笔人库",
    cancelActiveTask = () => false,
    withCancelableTask = async (_options, task) => task({ progress: { update: () => {} }, signal: null }),
    throwIfTaskAborted = () => {},
    openSkillBuilderModal = () => {},
    flushSkillMarkdownEdits = () => {},
    updateSkillMarkdownSaveState = () => {},
    saveSkillMarkdownEdits = () => {},
    documentRef = () => globalThis.document,
  } = deps;

  function bindEvents() {
    els.styleSummaryInput?.addEventListener("input", handleSummaryInput);
    els.styleSummaryInput?.addEventListener("blur", handleSummaryBlur);
    els.saveSkillMdBtn?.addEventListener("click", saveSkillMarkdownEdits);
    els.skillJsonInput?.addEventListener("input", handleSkillJsonInput);
    els.runSkillTestBtn?.addEventListener("click", runGenerationTest);
    els.saveSkillFeedbackBtn?.addEventListener("click", saveFeedback);
    els.skillDetailCloseBtn?.addEventListener("click", hide);
    documentRef()?.querySelectorAll?.(".detail-tab")?.forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.detailTab));
    });
  }

  function handleSummaryInput() {
    if (!ui.editingStyle) return;
    ui.editingStyle.summary = els.styleSummaryInput?.value || "";
    ui.skillMarkdownDirty = true;
    ui.skillMarkdownDirtySkillId = ui.editingStyle.id || null;
    updateSkillMarkdownSaveState();
  }

  function handleSummaryBlur() {
    if (ui.skillMarkdownDirty && ui.skillMarkdownDirtySkillId === ui.editingStyle?.id) {
      saveSkillMarkdownEdits({ silent: true });
    }
  }

  function handleSkillJsonInput() {
    if (!ui.editingStyle) return;
    ui.editingStyle.skillJson = els.skillJsonInput?.value || "";
  }

  function open(skillId) {
    flushSkillMarkdownEdits();
    const result = skillRenderer.openSkillDetail(skillId);
    ui.skillMarkdownDirty = false;
    ui.skillMarkdownDirtySkillId = null;
    updateSkillMarkdownSaveState();
    return result;
  }

  function hide() {
    return skillRenderer.hideSkillDetailMenu();
  }

  function switchTab(tabName) {
    return skillRenderer.switchSkillDetailTab(tabName);
  }

  async function runGenerationTest() {
    if (cancelActiveTask("skill-test")) return null;
    const style = syncEditingStyleFromInputs() || {};
    const testPrompt = String(els.skillTestPrompt?.value || "").trim();
    if (!String(style.skillJson || "").trim()) {
      toast("请先生成或填写执笔人规则 JSON", "warn");
      return null;
    }
    if (!testPrompt) {
      toast("请输入测试起草任务", "warn");
      return null;
    }

    return withCancelableTask({
      key: "skill-test",
      button: els.runSkillTestBtn,
      busyText: "测试中",
      progressMessage: "正在测试执笔人生成效果",
      cancelToast: "已取消本次执笔人测试",
    }, async ({ progress, signal }) => {
      const skillJson = parseSkillJsonObject(style.skillJson, style);
      progress.update("步骤 1/2：正在生成测试文档", 35);
      const outputs = await skillBuilder.testSkillOnGeneration(style, skillJson, { 用户测试任务: testPrompt }, { signal });
      throwIfTaskAborted(signal);
      progress.update("正在保存测试报告", 86);
      style.lastTest = {
        id: createId(),
        createdAt: now(),
        prompt: testPrompt,
        result: outputs.document,
        report: JSON.stringify(outputs.report, null, 2),
      };
      style.qualityReport = skillBuilder.normalizeSkillQualityReport(
        style,
        style.aggregationData || {},
        style.qualityReport || {},
        outputs.report,
      );
      commitSkillToState(style);
      eventBus.emit(EVENTS.RENDER_SKILL_TEST);
      eventBus.emit(EVENTS.RENDER_SKILL_QUALITY);
      toast(`测试结果已保存到：${getSkillLocation(ui.editingStyle)} / 测试记录`);
      return style.lastTest;
    });
  }

  function saveFeedback() {
    const style = syncEditingStyleFromInputs() || {};
    const text = String(els.skillFeedbackInput?.value || "").trim();
    if (!text) {
      toast("请输入反馈内容", "warn");
      return null;
    }
    style.feedbacks = [
      ...(style.feedbacks || []),
      {
        id: createId(),
        text,
        createdAt: now(),
      },
    ].slice(-50);
    commitSkillToState(style);
    eventBus.emit(EVENTS.RENDER_SKILL_TEST);
    toast(`反馈已保存到：${getSkillLocation(ui.editingStyle)} / 持续优化`);
    openSkillBuilderModal(style.id);
    return style.feedbacks.at(-1);
  }

  return {
    bindEvents,
    open,
    hide,
    switchTab,
    runGenerationTest,
    saveFeedback,
    handleSummaryInput,
    handleSummaryBlur,
    handleSkillJsonInput,
  };
}
