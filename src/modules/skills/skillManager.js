import { extractJsonObject } from "../../utils/formatters.js";
import { clone, createId, normalizeHandle, now } from "../../utils/helpers.js";
import { coerceArray } from "../../utils/validation.js";
import { EVENTS } from "../../core/eventBus.js";

export function createSkillManager(deps) {
  const {
    state,
    ui,
    els,
    persist,
    eventBus,
    toast,
    getSkillLocation,
  } = deps;

  function createEmptyStyle() {
    return {
      id: null,
      name: "",
      handle: "",
      category: "自定义",
      description: "",
      enabled: true,
      analysis: "",
      aggregation: "",
      summary: "",
      skillJson: "",
      examples: [],
      analyses: [],
      aggregationData: null,
      qualityReport: null,
      versions: [],
      feedbacks: [],
      lastTest: null,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  function isSkillEnabled(skill) {
    return skill?.enabled !== false;
  }

  function normalizeSkill(style) {
    const name = String(style.name || "未命名执笔人").trim();
    return {
      ...style,
      name,
      handle: normalizeHandle(style.handle || name),
      category: style.category || "自定义",
      description: style.description || "",
      enabled: style.enabled !== false,
      analysis: style.analysis || "",
      aggregation: style.aggregation || "",
      summary: style.summary || "",
      skillJson: style.skillJson || synthesizeSkillJson(style),
      examples: Array.isArray(style.examples) ? style.examples : [],
      analyses: Array.isArray(style.analyses) ? style.analyses : [],
      aggregationData: style.aggregationData || null,
      qualityReport: style.qualityReport || null,
      versions: Array.isArray(style.versions)
        ? style.versions.map((version, index) => ({
            id: version.id || createId(),
            version: Number(version.version || index + 1),
            createdAt: version.createdAt || now(),
            sourceExamples: Array.isArray(version.sourceExamples) ? version.sourceExamples : [],
            analysis: version.analysis || "",
            aggregation: version.aggregation || "",
            aggregationData: version.aggregationData || null,
            summary: version.summary || "",
            skillJson: version.skillJson || "",
            qualityReport: version.qualityReport || null,
            testDoc: version.testDoc || "",
            testReport: version.testReport || "",
          }))
        : [],
      feedbacks: Array.isArray(style.feedbacks)
        ? style.feedbacks.map((feedback) => ({
            id: feedback.id || createId(),
            text: feedback.text || "",
            createdAt: feedback.createdAt || now(),
          }))
        : [],
      lastTest: style.lastTest || null,
    };
  }

  function synthesizeSkillJson(style) {
    const name = String(style.name || "未命名执笔人").trim();
    const handle = normalizeHandle(style.handle || name);
    return JSON.stringify(
      {
        name,
        handle,
        enabled: style.enabled !== false,
        category: style.category || "自定义",
        description: style.description || "",
        applicable_scope: "",
        confidence: "low",
        source_documents: [],
        required_user_inputs: [],
        document_structure_template: [],
        style_rules: { must: [], recommended: [], optional: [] },
        reusable_expressions: [],
        variable_slots: [],
        scene_variations: [],
        forbidden: [],
        generation_steps: [],
        self_checklist: [],
        quality_controls: {
          promote_to_strong_rule: "仅当多篇样本文档共同验证时才提升为强规则",
          exclude_case_specific_info: true,
          privacy_filter: true,
        },
        example_input: "",
        example_output: "",
      },
      null,
      2,
    );
  }

  function normalizeSkillJsonText(value, style) {
    const fallback = synthesizeSkillJson(style);
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(extractJsonObject(raw) || raw);
      const normalized = {
        ...parsed,
        name: parsed.name || style.name || "未命名执笔人",
        handle: normalizeHandle(parsed.handle || style.handle || style.name),
        category: parsed.category || style.category || "自定义",
        description: parsed.description || style.description || "",
      };
      return JSON.stringify(normalized, null, 2);
    } catch {
      return raw;
    }
  }

  function parseSkillJsonObject(value, style) {
    const raw = normalizeSkillJsonText(value, style);
    try {
      return JSON.parse(extractJsonObject(raw) || raw);
    } catch {
      return JSON.parse(synthesizeSkillJson(style));
    }
  }

  function syncEditingStyleFromInputs() {
    const draft = ui.editingStyle || createEmptyStyle();
    draft.name = els.styleNameInput.value.trim() || draft.name || "";
    draft.handle = normalizeHandle(els.skillHandleInput.value || draft.handle || draft.name);
    draft.category = els.skillCategorySelect.value || draft.category || "自定义";
    draft.description = els.skillDescriptionInput.value.trim();
    draft.enabled = els.skillEnabledInput.checked;
    draft.analysis = els.skillAnalysisInput.value.trim();
    draft.aggregation = els.skillAggregationInput.value.trim();
    draft.summary = els.styleSummaryInput.value.trim();
    draft.skillJson = els.skillJsonInput.value.trim() || draft.skillJson || "";
    ui.editingStyle = draft;
    return draft;
  }

  function saveStyle() {
    const draft = ui.editingStyle;
    const name = els.styleNameInput.value.trim();
    if (!name) {
      toast("请输入执笔人名称", "warn");
      return null;
    }
    draft.name = name;
    draft.handle = normalizeHandle(els.skillHandleInput.value || name);
    if (!draft.handle) {
      toast("请输入 @ 调用名", "warn");
      return null;
    }
    draft.category = els.skillCategorySelect.value || "自定义";
    draft.description = els.skillDescriptionInput.value.trim();
    draft.enabled = els.skillEnabledInput.checked;
    draft.analysis = els.skillAnalysisInput.value.trim();
    draft.aggregation = els.skillAggregationInput.value.trim();
    draft.summary = els.styleSummaryInput.value.trim();
    draft.skillJson = normalizeSkillJsonText(els.skillJsonInput.value, draft);
    draft.updatedAt = now();

    const existingIndex = state.styles.findIndex((style) => style.id === draft.id);
    const duplicate = state.styles.find((style) => style.id !== draft.id && style.handle === draft.handle);
    if (duplicate) {
      toast(`@${draft.handle} 已被“${duplicate.name}”使用`, "warn");
      return null;
    }
    if (existingIndex >= 0) {
      state.styles[existingIndex] = normalizeSkill(clone(draft));
    } else {
      draft.id = createId();
      draft.createdAt = now();
      state.styles.push(normalizeSkill(clone(draft)));
    }
    ui.editingStyle = clone(draft);
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    toast(`已保存 @${draft.handle} 到：${getSkillLocation(draft)}`);
    return draft;
  }

  function commitSkillToState(draft) {
    const name = String(draft.name || "").trim();
    if (!name) throw new Error("请输入执笔人名称");
    draft.name = name;
    draft.handle = normalizeHandle(draft.handle || name);
    if (!draft.handle) throw new Error("请输入 @ 调用名");
    draft.category = draft.category || "自定义";
    draft.enabled = draft.enabled !== false;
    draft.updatedAt = now();
    if (!draft.id) {
      draft.id = createId();
      draft.createdAt = draft.createdAt || now();
    }

    const existingIndex = state.styles.findIndex((style) => style.id === draft.id);
    const duplicate = state.styles.find((style) => style.id !== draft.id && style.handle === draft.handle);
    if (duplicate) throw new Error(`@${draft.handle} 已被“${duplicate.name}”使用`);

    const normalized = normalizeSkill(clone(draft));
    if (existingIndex >= 0) {
      state.styles[existingIndex] = normalized;
    } else {
      state.styles.push(normalized);
    }
    ui.editingStyle = clone(normalized);
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    return normalized;
  }

  function deleteStyle(confirmDelete = (message) => window.confirm(message)) {
    const draft = ui.editingStyle;
    if (!draft?.id || !state.styles.some((style) => style.id === draft.id)) {
      ui.editingStyle = createEmptyStyle();
      eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
      return false;
    }
    const ok = confirmDelete(`删除执笔人“${draft.name}”？`);
    if (!ok) return false;
    state.styles = state.styles.filter((style) => style.id !== draft.id);
    state.docs.forEach((doc) => {
      if (doc.styleId === draft.id) doc.styleId = "";
    });
    ui.editingStyle = clone(state.styles[0] || createEmptyStyle());
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已删除执笔人：${getSkillLocation(draft)}`, "warn");
    return true;
  }

  function resolveInvokedSkills(text, fallbackSkillId) {
    const mentioned = Array.from(String(text || "").matchAll(/@([\u4e00-\u9fa5A-Za-z0-9_-]+)/g)).map((match) =>
      normalizeHandle(match[1]),
    );
    const skills = [];
    mentioned.forEach((handle) => {
      const found = state.styles.find((skill) => skill.handle === handle || skill.name === handle);
      if (found && isSkillEnabled(found) && !skills.some((skill) => skill.id === found.id)) {
        skills.push(found);
      }
    });
    if (skills.length === 0 && fallbackSkillId) {
      const fallback = state.styles.find((skill) => skill.id === fallbackSkillId);
      if (fallback && isSkillEnabled(fallback)) skills.push(fallback);
    }
    return skills;
  }

  function buildSkillPromptForDocumentGeneration(skills) {
    const enabledSkills = (skills || []).filter(isSkillEnabled);
    if (enabledSkills.length === 0) return "";
    return [
      "被调用的执笔人（仅使用已启用执笔人）：",
      "执行原则：必须优先遵守 style_rules.must；recommended 仅在用户任务匹配时使用；optional 不得压过用户事实。禁止复用 case_specific_exclusions、privacy_filters 和 forbidden 中的内容。事实缺失时使用可替换占位符，不能编造。",
      ...enabledSkills.map((skill, index) => {
        const skillJson = parseSkillJsonObject(skill.skillJson, skill);
        const strongRules = coerceArray(skillJson.style_rules?.must);
        const recommendedRules = coerceArray(skillJson.style_rules?.recommended);
        const forbidden = coerceArray(skillJson.forbidden);
        const payload = {
          ...skillJson,
          style_rules: {
            must: strongRules,
            recommended: recommendedRules,
            optional: coerceArray(skillJson.style_rules?.optional),
          },
          forbidden,
          quality_controls: {
            ...(skillJson.quality_controls || {}),
            single_document_rule_policy: "单篇样本只作为候选规则；生成时不得把个案信息当成通用规则",
            privacy_filter: true,
          },
        };
        return [
          `${index + 1}. @${skill.handle} · ${skill.name}`,
          skill.category ? `分类：${skill.category}` : "",
          skill.description ? `能力：${skill.description}` : "",
          `规则置信度：${skillJson.confidence || skill.qualityReport?.confidence || "low"}`,
          `程序调用规则 JSON：\n${JSON.stringify(payload, null, 2)}`,
        ]
          .filter(Boolean)
          .join("\n");
      }),
    ].join("\n\n");
  }

  return {
    createEmptyStyle,
    isSkillEnabled,
    normalizeSkill,
    synthesizeSkillJson,
    normalizeSkillJsonText,
    parseSkillJsonObject,
    syncEditingStyleFromInputs,
    saveStyle,
    commitSkillToState,
    deleteStyle,
    resolveInvokedSkills,
    buildSkillPromptForDocumentGeneration,
  };
}
