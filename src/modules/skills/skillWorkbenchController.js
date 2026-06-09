import { EVENTS } from "../../core/eventBus.js";
import { clone, copyTextToClipboard, normalizeHandle, now } from "../../utils/helpers.js";

export function createSkillWorkbenchController(deps = {}) {
  const {
    state = { styles: [] },
    ui = {},
    els = {},
    normalizeSkill = (skill) => skill,
    persist = () => {},
    eventBus = { emit: () => {} },
    toast = () => {},
    getSkillLocation = () => "执笔人库",
    switchTab = () => {},
    openResponsiveTools = () => {},
    openSkillDetail = () => {},
    switchSkillDetailTab = () => {},
    exportSkillPackage = () => {},
    deleteStyle = () => {},
    cancelActiveTask = () => {},
    documentRef = () => globalThis.document,
    clipboard = () => globalThis.navigator?.clipboard,
    createInputEvent = () => new Event("input", { bubbles: true }),
  } = deps;

  function updateBuildState(skillId, patch) {
    const index = state.styles.findIndex((style) => style.id === skillId);
    if (index < 0) return null;
    state.styles[index] = normalizeSkill({
      ...state.styles[index],
      ...patch,
      updatedAt: now(),
    });
    if (ui.editingStyle?.id === skillId) ui.editingStyle = clone(state.styles[index]);
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    return state.styles[index];
  }

  function createCardProgress(skillId) {
    return {
      update(message, progress = 0) {
        updateBuildState(skillId, {
          status: "building",
          buildProgress: { message, progress },
          lastBuildError: "",
        });
      },
    };
  }

  function getBuildResult(style, version, outputs = {}) {
    const aggregationData = outputs.aggregationData || {};
    const qualityReport = outputs.qualityReport || {};
    let parsedTestReport = {};
    try {
      parsedTestReport = JSON.parse(outputs.testReport || "{}");
    } catch {
      parsedTestReport = {};
    }
    return {
      version: version.version,
      confidence: qualityReport.confidence || aggregationData.overall_confidence || "low",
      strongRuleCount: (aggregationData.strong_rules || qualityReport.strong_rules || []).length || 0,
      candidateRuleCount: (aggregationData.candidate_rules || qualityReport.candidate_rules || []).length || 0,
      privacyCount: (aggregationData.privacy_findings || qualityReport.privacy_filter_notes || []).length || 0,
      caseSpecificCount: (aggregationData.case_specific_exclusions || qualityReport.excluded_case_specific_items || []).length || 0,
      passed: parsedTestReport.overall_result?.passed
        ?? parsedTestReport.passed
        ?? parsedTestReport.check_report?.passed
        ?? null,
      sampleCount: (style.examples || []).length,
    };
  }

  function invokeFromCard(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return "";
    const mention = `@${skill.handle || normalizeHandle(skill.name)}`;
    const prompt = els.generatePrompt;
    const current = prompt.value.trimEnd();
    prompt.value = current ? `${current}\n${mention} ` : `${mention} `;
    prompt.dispatchEvent?.(createInputEvent());
    switchTab("generate");
    openResponsiveTools();
    prompt.focus?.();
    toast(`已插入 ${mention}，可继续补充生成要求`);
    return mention;
  }

  async function copyHandleFromCard(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return "";
    const mention = `@${skill.handle || normalizeHandle(skill.name)}`;
    const copied = await copyTextToClipboard(mention, {
      navigator: { clipboard: clipboard() },
      document: documentRef(),
    });
    toast(copied ? `已复制 ${mention}` : "复制失败，请手动复制调用名", copied ? "info" : "warn");
    return mention;
  }

  function toggleEnabledFromCard(skillId, enabled) {
    const skill = updateBuildState(skillId, { enabled });
    if (!skill) return null;
    toast(`${enabled ? "已启用" : "已停用"} @${skill.handle}`);
    return skill;
  }

  function openTestFromCard(skillId) {
    openSkillDetail(skillId);
    switchSkillDetailTab("test");
  }

  function editMarkdownFromCard(skillId) {
    flushMarkdownEdits();
    openSkillDetail(skillId);
    switchSkillDetailTab("markdown");
    els.styleSummaryInput?.focus?.();
    toast("已打开执笔人说明.md，可直接编辑并保存");
  }

  function updateMarkdownSaveState() {
    if (!els.saveSkillMdBtn) return;
    const isDirty = Boolean(ui.skillMarkdownDirty && ui.skillMarkdownDirtySkillId === ui.editingStyle?.id);
    els.saveSkillMdBtn.classList.toggle("is-dirty", isDirty);
    els.saveSkillMdBtn.title = isDirty ? "说明.md 有未保存修改" : "保存说明.md 修改";
    els.saveSkillMdBtn.dataset.dirty = isDirty ? "true" : "false";
  }

  function flushMarkdownEdits() {
    if (!ui.skillMarkdownDirty || ui.skillMarkdownDirtySkillId !== ui.editingStyle?.id) return;
    saveMarkdownEdits({ silent: true });
  }

  function saveMarkdownEdits({ silent = false } = {}) {
    const skillId = ui.editingStyle?.id;
    if (!skillId) {
      if (!silent) toast("请先选择一个执笔人", "warn");
      clearMarkdownDirtyState();
      return null;
    }
    const index = state.styles.findIndex((style) => style.id === skillId);
    if (index < 0) {
      if (!silent) toast("未找到当前执笔人", "warn");
      clearMarkdownDirtyState();
      return null;
    }
    const next = normalizeSkill({
      ...state.styles[index],
      summary: els.styleSummaryInput.value,
      updatedAt: now(),
    });
    state.styles[index] = next;
    ui.editingStyle = clone(next);
    clearMarkdownDirtyState();
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    if (!silent) toast(`说明.md 已保存到：${getSkillLocation(next)} / 说明.md`);
    return next;
  }

  function clearMarkdownDirtyState() {
    ui.skillMarkdownDirty = false;
    ui.skillMarkdownDirtySkillId = null;
    updateMarkdownSaveState();
  }

  function exportPackageById(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return false;
    ui.editingStyle = clone(skill);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    exportSkillPackage();
    return true;
  }

  function deleteById(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return false;
    ui.editingStyle = clone(skill);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    deleteStyle();
    return true;
  }

  function cancelBuild(skillId) {
    return cancelActiveTask(`skill-build:${skillId}`);
  }

  return {
    updateBuildState,
    createCardProgress,
    getBuildResult,
    invokeFromCard,
    copyHandleFromCard,
    toggleEnabledFromCard,
    openTestFromCard,
    editMarkdownFromCard,
    updateMarkdownSaveState,
    flushMarkdownEdits,
    saveMarkdownEdits,
    exportPackageById,
    deleteById,
    cancelBuild,
  };
}
