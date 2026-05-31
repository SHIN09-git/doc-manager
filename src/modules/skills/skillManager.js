import { extractJsonObject } from "../../utils/formatters.js";
import { clone, createId, normalizeHandle, now } from "../../utils/helpers.js";
import { coerceArray } from "../../utils/validation.js";
import { EVENTS } from "../../core/eventBus.js";
import { MISSING_FACT_PLACEHOLDER, SKILL_RUNTIME_PRIORITY_RULES } from "../../config/constants.js";

const DEFAULT_MISSING_FACT_POLICY = `事实缺失时使用${MISSING_FACT_PLACEHOLDER}，不编造具体人名、时间、地点、单位、数据、结论、政策依据和落款。`;
export const SKILL_PACKAGE_SCHEMA = "mowen-nibi-workbench.skill-package.v1";

export function buildSkillRuntimePayload(skillJson, skill = {}, fallbackConfidence = "low") {
  const handle = normalizeHandle(skillJson.handle || skill.handle || skillJson.name || skill.name);
  const mustRules = coerceArray(skillJson.style_rules?.must);
  const recommendedRules = coerceArray(skillJson.style_rules?.recommended);
  const optionalRules = coerceArray(skillJson.style_rules?.optional);
  return {
    name: skillJson.name || skill.name || "未命名执笔人",
    handle,
    description: skillJson.description || skill.description || "",
    trigger_description:
      skillJson.trigger_description ||
      (handle ? `当用户通过 @${handle} 调用，或任务匹配该文种/场景时使用。` : "当任务匹配该文种/场景时使用。"),
    concise_instruction: skillJson.concise_instruction || skillJson.description || "",
    applicable_scope: skillJson.applicable_scope || "",
    confidence: skillJson.confidence || fallbackConfidence,
    execution_priority: SKILL_RUNTIME_PRIORITY_RULES,
    input_contract: normalizeSkillInputContract(skillJson),
    document_structure_template: coerceArray(skillJson.document_structure_template),
    style_rules: {
      must: mustRules,
      recommended: recommendedRules,
      optional: optionalRules,
    },
    format_rules: coerceArray(skillJson.format_rules),
    common_expression_library: coerceArray(skillJson.common_expression_library || skillJson.reusable_expressions),
    scene_variations: coerceArray(skillJson.scene_variations),
    variable_slots: coerceArray(skillJson.variable_slots),
    forbidden: coerceArray(skillJson.forbidden),
    privacy_filters: coerceArray(skillJson.privacy_filters),
    case_specific_exclusions: coerceArray(skillJson.case_specific_exclusions),
    rule_evidence: normalizeRuleEvidence(skillJson.rule_evidence),
    execution_workflow: coerceArray(skillJson.execution_workflow || skillJson.generation_steps),
    validation_checklist: coerceArray(skillJson.validation_checklist || skillJson.self_checklist || skillJson.review_standards),
    quality_controls: {
      ...(skillJson.quality_controls || {}),
      single_document_rule_policy: "单篇样本只作为候选规则；生成时不得把个案信息当成通用规则",
      candidate_rule_policy: "recommended/optional 只能辅助写作，不能覆盖用户提供的事实",
      privacy_filter: true,
    },
  };
}

export function createSkillPackage(skill = {}) {
  const name = String(skill.name || "未命名执笔人").trim();
  const handle = normalizeHandle(skill.handle || name);
  const ruleJson = parseRuleJsonForPackage(skill.skillJson, skill);
  return {
    schema: SKILL_PACKAGE_SCHEMA,
    version: 1,
    exportedAt: now(),
    skill: {
      name,
      handle,
      category: skill.category || "自定义",
      description: skill.description || "",
      enabled: skill.enabled !== false,
      summaryMd: skill.summary || "",
      ruleJson,
      qualityReport: skill.qualityReport || null,
      buildArtifacts: {
        analysis: skill.analysis || "",
        aggregation: skill.aggregation || "",
        aggregationData: skill.aggregationData || null,
        analyses: Array.isArray(skill.analyses) ? skill.analyses : [],
      },
      sourceDocuments: summarizeSkillSourceDocuments(skill),
      versions: summarizeSkillVersions(skill.versions),
    },
  };
}

export function parseImportedSkillPackage(payload = {}) {
  const source = payload.schema === SKILL_PACKAGE_SCHEMA ? payload.skill || {} : payload;
  const ruleJson = source.ruleJson || source.skillJson || source.rule || source;
  const ruleObject = parseRuleJsonForPackage(ruleJson, source);
  const ruleJsonText = JSON.stringify(ruleObject || {}, null, 2);
  const name = source.name || ruleObject?.name || payload.name || "导入执笔人";
  const handle = normalizeHandle(source.handle || ruleObject?.handle || name);
  const artifacts = source.buildArtifacts || {};
  return {
    id: null,
    name,
    handle,
    category: source.category || ruleObject?.category || "自定义",
    description: source.description || ruleObject?.description || "",
    enabled: source.enabled !== false,
    analysis: artifacts.analysis || source.analysis || "",
    aggregation: artifacts.aggregation || source.aggregation || "",
    summary: source.summaryMd || source.summary || source.markdown || "",
    skillJson: ruleJsonText,
    examples: normalizeImportedSourceDocuments(source.sourceDocuments),
    analyses: Array.isArray(artifacts.analyses) ? artifacts.analyses : [],
    aggregationData: artifacts.aggregationData || source.aggregationData || null,
    qualityReport: source.qualityReport || null,
    versions: normalizeImportedVersions(source.versions),
    feedbacks: [],
    lastTest: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function parseRuleJsonForPackage(value, skill) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return clone(value);
  }
  const raw = String(value || "").trim();
  if (raw) {
    try {
      return JSON.parse(extractJsonObject(raw) || raw);
    } catch {
      return { raw };
    }
  }
  return {
    name: skill.name || "未命名执笔人",
    handle: normalizeHandle(skill.handle || skill.name),
    category: skill.category || "自定义",
    description: skill.description || "",
  };
}

function summarizeSkillSourceDocuments(skill = {}) {
  const versionSources = (skill.versions || [])
    .flatMap((version) => version.sourceExamples || [])
    .filter(Boolean);
  const examples = Array.isArray(skill.examples) ? skill.examples : [];
  const sources = versionSources.length ? versionSources : examples;
  return sources.map((source) => summarizeSourceDocument(source));
}

function summarizeSkillVersions(versions = []) {
  return (Array.isArray(versions) ? versions : []).map((version, index) => ({
    version: Number(version.version || index + 1),
    createdAt: version.createdAt || "",
    sourceExamples: (version.sourceExamples || []).map((source) => summarizeSourceDocument(source)),
    summary: version.summary || "",
    skillJson: version.skillJson || "",
    qualityReport: version.qualityReport || null,
  }));
}

function normalizeImportedVersions(versions = []) {
  return (Array.isArray(versions) ? versions : []).map((version, index) => ({
    id: createId(),
    version: Number(version.version || index + 1),
    createdAt: version.createdAt || now(),
    sourceExamples: Array.isArray(version.sourceExamples)
      ? version.sourceExamples.map((source) => summarizeVersionSourceExample(source))
      : [],
    analyses: Array.isArray(version.analyses) ? version.analyses : [],
    analysis: version.analysis || "",
    aggregation: version.aggregation || "",
    aggregationData: version.aggregationData || null,
    summary: version.summary || "",
    skillJson: version.skillJson || "",
    qualityReport: version.qualityReport || null,
    testDoc: version.testDoc || "",
    testReport: version.testReport || "",
  }));
}

function normalizeImportedSourceDocuments(sourceDocuments = []) {
  return (Array.isArray(sourceDocuments) ? sourceDocuments : []).map((source) => ({
    id: createId(),
    name: source.name || "导入示范摘要",
    text: `（导入包仅包含示范摘要，不包含原始全文。原文长度：${getSourceDocumentLength(source)} 字符）`,
    addedAt: source.addedAt || now(),
    importedSummary: true,
    originalLength: getSourceDocumentLength(source),
  }));
}

function getSourceDocumentLength(source = {}) {
  return Number(source.length || source.originalLength || source.text?.length || 0);
}

function summarizeSourceDocument(source = {}) {
  return {
    name: source.name || "未命名示范",
    length: getSourceDocumentLength(source),
    addedAt: source.addedAt || source.createdAt || "",
  };
}

function summarizeVersionSourceExample(source = {}) {
  return {
    id: source.id || createId(),
    ...summarizeSourceDocument(source),
    importedSummary: Boolean(source.importedSummary),
    originalLength: getSourceDocumentLength(source),
  };
}

function normalizeSkillInputContract(skillJson) {
  const inputContract = skillJson.input_contract;
  const fallbackFields = coerceArray(skillJson.user_input_fields || skillJson.required_user_inputs);
  if (Array.isArray(inputContract)) {
    return {
      required_fields: inputContract,
      optional_fields: [],
      missing_fact_policy: DEFAULT_MISSING_FACT_POLICY,
    };
  }
  return {
    ...(inputContract && typeof inputContract === "object" ? inputContract : {}),
    required_fields: coerceArray(inputContract?.required_fields || inputContract?.fields || fallbackFields),
    optional_fields: coerceArray(inputContract?.optional_fields),
    missing_fact_policy: inputContract?.missing_fact_policy || DEFAULT_MISSING_FACT_POLICY,
  };
}

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
      status: "",
      buildProgress: null,
      lastBuildError: "",
      lastBuildAt: "",
      lastBuildResult: null,
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
            sourceExamples: Array.isArray(version.sourceExamples)
              ? version.sourceExamples.map((source) => summarizeVersionSourceExample(source))
              : [],
            analyses: Array.isArray(version.analyses) ? version.analyses : [],
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
      status: ["building", "failed", "ready"].includes(style.status) ? style.status : "",
      buildProgress: style.buildProgress && typeof style.buildProgress === "object"
        ? {
            message: style.buildProgress.message || "",
            progress: Math.max(0, Math.min(100, Number(style.buildProgress.progress) || 0)),
          }
        : null,
      lastBuildError: style.lastBuildError || "",
      lastBuildAt: style.lastBuildAt || "",
      lastBuildResult: style.lastBuildResult && typeof style.lastBuildResult === "object" ? style.lastBuildResult : null,
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
        trigger_description: handle ? `当用户通过 @${handle} 调用，或任务匹配该文种/场景时使用。` : "",
        default_prompt: handle ? `@${handle} 请根据以下事项起草一篇同类正式文本：` : "",
        concise_instruction: "",
        applicable_scope: "",
        confidence: "low",
        source_documents: [],
        input_contract: {
          required_fields: [],
          optional_fields: [],
          missing_fact_policy: DEFAULT_MISSING_FACT_POLICY,
        },
        user_input_fields: [],
        required_user_inputs: [],
        document_structure_template: [],
        style_rules: { must: [], recommended: [], optional: [] },
        rule_evidence: {},
        common_expression_library: [],
        reusable_expressions: [],
        variable_slots: [],
        scene_variations: [],
        forbidden: [],
        privacy_filters: [],
        case_specific_exclusions: [],
        execution_workflow: [],
        generation_steps: [],
        validation_checklist: [],
        self_checklist: [],
        activation_examples: handle ? [`@${handle} 请根据以下事项起草文档：...`] : [],
        quality_controls: {
          promote_to_strong_rule: "仅当多篇样本文档共同验证时才提升为强规则",
          execution_priority: SKILL_RUNTIME_PRIORITY_RULES,
          candidate_rule_policy: "候选规则只能辅助写作，不能覆盖用户事实",
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
        input_contract: normalizeSkillInputContract(parsed),
        style_rules: normalizeRuntimeStyleRules(parsed.style_rules),
        rule_evidence: normalizeRuleEvidence(parsed.rule_evidence),
        execution_priority: Array.isArray(parsed.execution_priority) && parsed.execution_priority.length
          ? parsed.execution_priority
          : SKILL_RUNTIME_PRIORITY_RULES,
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

  function createUniqueSkillHandle(value, currentId = null) {
    const base = normalizeHandle(value) || "imported";
    let handle = base;
    let index = 2;
    while (state.styles.some((style) => style.id !== currentId && style.handle === handle)) {
      const suffix = `-${index}`;
      handle = normalizeHandle(`${base.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`);
      index += 1;
    }
    return handle;
  }

  function syncEditingStyleFromInputs() {
    const draft = ui.editingStyle || createEmptyStyle();
    draft.name = els.styleNameInput.value.trim() || draft.name || "";
    draft.handle = normalizeHandle(draft.name || els.skillHandleInput.value || draft.handle);
    draft.category = getSelectedCategoryFromInputs(draft.category);
    draft.description = els.skillDescriptionInput?.value.trim() || draft.description || "";
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
    draft.handle = normalizeHandle(name || els.skillHandleInput.value);
    if (!draft.handle) {
      toast("请输入 @ 调用名", "warn");
      return null;
    }
    draft.category = getSelectedCategoryFromInputs("自定义");
    draft.description = els.skillDescriptionInput?.value.trim() || draft.description || "";
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

  function getSelectedCategoryFromInputs(fallback = "自定义") {
    if (!els.skillCategorySelect) return fallback || "自定义";
    const selected = els.skillCategorySelect.value || fallback || "自定义";
    if (selected !== "自定义") return selected;
    return els.skillCustomCategoryInput?.value.trim() || "自定义";
  }

  function importSkillPackage(payload) {
    const draft = parseImportedSkillPackage(payload);
    draft.id = createId();
    draft.createdAt = now();
    draft.updatedAt = now();
    draft.handle = createUniqueSkillHandle(draft.handle || draft.name);
    draft.skillJson = normalizeSkillJsonText(draft.skillJson, draft);
    const normalized = normalizeSkill(clone(draft));
    state.styles.push(normalized);
    ui.editingStyle = clone(normalized);
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    toast(`已导入 @${normalized.handle} 到：${getSkillLocation(normalized)}`);
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
      ["固定执行优先级：", ...SKILL_RUNTIME_PRIORITY_RULES.map((rule, index) => `${index + 1}. ${rule}`)].join("\n"),
      "禁止复用 case_specific_exclusions、privacy_filters 和 forbidden 中的内容；recommended / optional 不能压过用户本次输入。",
      ...enabledSkills.map((skill, index) => {
        const skillJson = parseSkillJsonObject(skill.skillJson, skill);
        const payload = buildSkillRuntimePayload(skillJson, skill, skill.qualityReport?.confidence || "low");
        return [
          `${index + 1}. @${skill.handle} · ${skill.name}`,
          skill.category ? `分类：${skill.category}` : "",
          skill.description ? `能力：${skill.description}` : "",
          skill.summary ? `用户可编辑说明.md：\n${String(skill.summary).slice(0, 4000)}` : "",
          `规则置信度：${skillJson.confidence || skill.qualityReport?.confidence || "low"}`,
          `程序调用执行卡 JSON：\n${JSON.stringify(payload, null, 2)}`,
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
    createSkillPackage,
    syncEditingStyleFromInputs,
    saveStyle,
    commitSkillToState,
    importSkillPackage,
    deleteStyle,
    resolveInvokedSkills,
    buildSkillPromptForDocumentGeneration,
  };
}

function normalizeRuntimeStyleRules(styleRules = {}) {
  return {
    must: coerceArray(styleRules.must),
    recommended: coerceArray(styleRules.recommended),
    optional: coerceArray(styleRules.optional),
  };
}

function normalizeRuleEvidence(ruleEvidence = {}) {
  if (!ruleEvidence || typeof ruleEvidence !== "object" || Array.isArray(ruleEvidence)) return {};
  return Object.fromEntries(
    Object.entries(ruleEvidence)
      .filter(([rule]) => String(rule || "").trim())
      .map(([rule, evidence]) => [
        String(rule).trim(),
        {
          support_count: Number(evidence?.support_count || evidence?.evidence_count || 0),
          support_doc_ids: coerceArray(evidence?.support_doc_ids || evidence?.source_documents),
          scope: evidence?.scope || "document_type",
          confidence: ["low", "medium", "high"].includes(evidence?.confidence) ? evidence.confidence : "medium",
        },
      ]),
  );
}
