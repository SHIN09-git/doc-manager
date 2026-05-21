import { formatListItems } from "../../utils/formatters.js";
import { normalizeHandle, stableTextHash } from "../../utils/helpers.js";
import { clampConfidence, coerceArray } from "../../utils/validation.js";

export function normalizeSingleDocumentAnalysis(result, example, index) {
  return {
    document_id: example.id || stableTextHash(example.name + example.text),
    document_name: result.document_name || example.name || `样本文档${index + 1}`,
    document_type: result.document_type || "",
    scenario: result.scenario || "",
    title_format: result.title_format || "",
    opening_pattern: result.opening_pattern || "",
    body_structure: coerceArray(result.body_structure),
    paragraph_functions: coerceArray(result.paragraph_functions),
    ending_pattern: result.ending_pattern || "",
    tone_style: coerceArray(result.tone_style),
    format_rules: coerceArray(result.format_rules),
    common_words_sentences: coerceArray(result.common_words_sentences),
    reusable_expressions: coerceArray(result.reusable_expressions),
    variable_slots: coerceArray(result.variable_slots),
    candidate_rules: coerceArray(result.candidate_rules)
      .map((rule) => ({
        category: rule.category || "style",
        rule: String(rule.rule || rule).trim(),
        evidence: rule.evidence || "",
        confidence: clampConfidence(rule.confidence ?? 0.4),
      }))
      .filter((rule) => rule.rule),
    case_specific_items: coerceArray(result.case_specific_items),
    privacy_or_sensitive_items: coerceArray(result.privacy_or_sensitive_items),
    forbidden_to_reuse: coerceArray(result.forbidden_to_reuse),
    review_standards: coerceArray(result.review_standards),
    text_hash: stableTextHash(example.text || ""),
  };
}

export function normalizeAggregationData(result, documentCount) {
  return {
    document_count: Number(result.document_count || documentCount || 0),
    overall_confidence: result.overall_confidence || (documentCount >= 3 ? "medium" : "low"),
    common_structure: coerceArray(result.common_structure),
    common_style: coerceArray(result.common_style),
    common_format: coerceArray(result.common_format),
    common_expressions: coerceArray(result.common_expressions),
    review_standards: coerceArray(result.review_standards),
    strong_rules: coerceArray(result.strong_rules)
      .filter((rule) => Number(rule.evidence_count || 0) >= 2)
      .map(normalizeAggregatedRule),
    candidate_rules: coerceArray(result.candidate_rules).map(normalizeAggregatedRule),
    conflicts: coerceArray(result.conflicts),
    case_specific_exclusions: coerceArray(result.case_specific_exclusions),
    privacy_findings: coerceArray(result.privacy_findings),
    must_not_promote: coerceArray(result.must_not_promote),
    recommended_calibration: coerceArray(result.recommended_calibration),
  };
}

export function normalizeAggregatedRule(rule) {
  return {
    category: rule.category || "style",
    rule: String(rule.rule || rule).trim(),
    evidence_count: Number(rule.evidence_count || 1),
    confidence: clampConfidence(rule.confidence ?? 0.5),
    source_documents: coerceArray(rule.source_documents),
    reason: rule.reason || "",
  };
}

export function normalizeSkillDraftOutput(result, style, aggregationData) {
  const skillJson = result.skill_json || result.skillJson || {};
  const styleRules = normalizeStyleRules(skillJson.style_rules, aggregationData);
  const commonExpressionLibrary = coerceArray(
    skillJson.common_expression_library || skillJson.reusable_expressions || aggregationData.common_expressions,
  );
  const selfChecklist = coerceArray(skillJson.self_checklist || skillJson.validation_checklist);
  const reviewStandards = coerceArray(skillJson.review_standards || aggregationData.review_standards);
  const forbidden = uniqueList([
    ...coerceArray(skillJson.forbidden),
    ...coerceArray(aggregationData.case_specific_exclusions),
    ...coerceArray(aggregationData.must_not_promote),
  ]);
  const normalizedSkillJson = {
    ...skillJson,
    name: skillJson.name || style.name || "未命名执笔人",
    handle: normalizeHandle(skillJson.handle || style.handle || style.name),
    enabled: style.enabled !== false,
    category: skillJson.category || style.category || "自定义",
    description: skillJson.description || style.description || "",
    confidence: skillJson.confidence || aggregationData.overall_confidence || "low",
    source_documents: skillJson.source_documents || (style.examples || []).map((example) => example.name),
    trigger_description:
      skillJson.trigger_description ||
      `当用户需要生成“${skillJson.name || style.name || "该类文档"}”同类文本，或在提示词中使用 @${normalizeHandle(skillJson.handle || style.handle || style.name)} 时调用。`,
    default_prompt:
      skillJson.default_prompt ||
      `使用 @${normalizeHandle(skillJson.handle || style.handle || style.name)} 起草一篇同类正式文本。`,
    concise_instruction:
      skillJson.concise_instruction ||
      buildConciseInstruction(skillJson, styleRules, aggregationData),
    input_contract: normalizeInputContract(skillJson),
    user_input_fields: coerceArray(skillJson.user_input_fields || skillJson.required_user_inputs),
    style_rules: styleRules,
    format_rules: coerceArray(skillJson.format_rules || aggregationData.common_format),
    common_expression_library: commonExpressionLibrary,
    variable_slots: coerceArray(skillJson.variable_slots),
    forbidden,
    privacy_filters: coerceArray(skillJson.privacy_filters || aggregationData.privacy_findings),
    case_specific_exclusions: coerceArray(skillJson.case_specific_exclusions || aggregationData.case_specific_exclusions),
    execution_workflow: normalizeExecutionWorkflow(skillJson, styleRules),
    generation_steps: coerceArray(skillJson.generation_steps || skillJson.execution_workflow),
    self_checklist: selfChecklist,
    validation_checklist: coerceArray(
      skillJson.validation_checklist || (selfChecklist.length ? selfChecklist : reviewStandards),
    ),
    review_standards: reviewStandards,
    activation_examples: coerceArray(skillJson.activation_examples).length
      ? coerceArray(skillJson.activation_examples)
      : [`@${normalizeHandle(skillJson.handle || style.handle || style.name)} 请根据以下事项起草文档：...`],
    quality_controls: {
      ...(skillJson.quality_controls || {}),
      rule_confidence: skillJson.confidence || aggregationData.overall_confidence || "low",
      single_document_rule_policy: "单篇样本只产生候选规则；至少 2 篇共同验证后才能成为强规则",
      candidate_rule_policy: "候选规则只能进入 recommended 或 optional，不得覆盖用户事实或伪装成必须规则",
      exclude_case_specific_info: true,
      privacy_filter: true,
    },
  };
  return {
    markdown: result.markdown || buildSkillMarkdownFromJson(normalizedSkillJson, aggregationData),
    skillJson: normalizedSkillJson,
    qualityReport: result.quality_report || {},
    exampleInput: result.example_input || normalizedSkillJson.example_input || {},
  };
}

export function normalizeStyleRules(styleRules, aggregationData) {
  const strong = aggregationData.strong_rules || [];
  const candidates = aggregationData.candidate_rules || [];
  if (styleRules && !Array.isArray(styleRules)) {
    return {
      must: coerceArray(styleRules.must).length ? coerceArray(styleRules.must) : strong.map((rule) => rule.rule),
      recommended: coerceArray(styleRules.recommended).length
        ? coerceArray(styleRules.recommended)
        : candidates.map((rule) => rule.rule),
      optional: coerceArray(styleRules.optional),
    };
  }
  return {
    must: strong.map((rule) => rule.rule),
    recommended: candidates.map((rule) => rule.rule),
    optional: coerceArray(styleRules),
  };
}

export function normalizeSkillQualityReport(style, aggregationData, draftReport, testReport) {
  return {
    confidence: draftReport?.confidence || aggregationData.overall_confidence || "low",
    document_count: aggregationData.document_count || (style.examples || []).length,
    strong_rules: aggregationData.strong_rules || [],
    candidate_rules: aggregationData.candidate_rules || [],
    conflicts: aggregationData.conflicts || [],
    case_specific_exclusions: aggregationData.case_specific_exclusions || [],
    privacy_findings: aggregationData.privacy_findings || [],
    privacy_filter_notes: draftReport?.privacy_filter_notes || [],
    test_report: testReport || {},
  };
}

export function pickSkillMetadata(style) {
  return {
    name: style.name,
    handle: normalizeHandle(style.handle || style.name),
    category: style.category,
    description: style.description,
    enabled: style.enabled !== false,
    example_count: (style.examples || []).length,
  };
}

export function buildSkillMarkdownFromJson(skillJson, aggregationData) {
  const lines = [
    `# ${skillJson.name || "未命名执笔人"}`,
    "",
    `@调用名：@${skillJson.handle || ""}`,
    `置信度：${skillJson.confidence || aggregationData.overall_confidence || "low"}`,
  ];
  if (skillJson.trigger_description) lines.push(`触发：${skillJson.trigger_description}`);
  return [
    ...lines,
    "",
    "## 适用范围",
    skillJson.applicable_scope || "待补充",
    "",
    "## 输入字段",
    formatListItems(skillJson.input_contract?.required_fields || skillJson.user_input_fields || []),
    "",
    "## 执行流程",
    formatListItems(skillJson.execution_workflow || skillJson.generation_steps || []),
    "",
    "## 必须遵守",
    formatListItems(skillJson.style_rules?.must || []),
    "",
    "## 推荐使用",
    formatListItems(skillJson.style_rules?.recommended || []),
    "",
    "## 禁止事项",
    formatListItems(skillJson.forbidden || []),
    "",
    "## 自检清单",
    formatListItems(skillJson.validation_checklist || skillJson.self_checklist || []),
  ].join("\n");
}

function normalizeInputContract(skillJson) {
  const defaultPolicy = "事实缺失时使用可替换占位符，不编造具体人名、时间、地点、活动名称和落款。";
  const inputContract = skillJson.input_contract;
  const fallbackFields = coerceArray(skillJson.user_input_fields || skillJson.required_user_inputs);
  if (Array.isArray(inputContract)) {
    return {
      required_fields: inputContract,
      optional_fields: [],
      missing_fact_policy: defaultPolicy,
    };
  }
  return {
    ...(inputContract && typeof inputContract === "object" ? inputContract : {}),
    required_fields: coerceArray(inputContract?.required_fields || inputContract?.fields || fallbackFields),
    optional_fields: coerceArray(inputContract?.optional_fields),
    missing_fact_policy: inputContract?.missing_fact_policy || defaultPolicy,
  };
}

function normalizeExecutionWorkflow(skillJson, styleRules) {
  const workflow = coerceArray(skillJson.execution_workflow || skillJson.generation_steps);
  if (workflow.length) return workflow;
  return [
    "读取用户任务和输入字段，识别文种、场景、对象、时间、地点、事项和落款。",
    "按 document_structure_template 组织标题、开头、正文段落和结尾。",
    "优先执行 style_rules.must，将 recommended 作为可选增强，不覆盖用户事实。",
    "使用 common_expression_library 时替换变量槽位，事实缺失处保留占位符。",
    "按 validation_checklist 自检格式、文风、禁忌和隐私风险。",
  ].filter((step, index) => index !== 2 || coerceArray(styleRules?.must).length || coerceArray(styleRules?.recommended).length);
}

function buildConciseInstruction(skillJson, styleRules, aggregationData) {
  const must = coerceArray(styleRules.must).slice(0, 3).join("；");
  const scope = skillJson.applicable_scope || aggregationData.common_structure?.[0] || "同类正式文本";
  return [`用于生成${scope}。`, must ? `必须遵守：${must}。` : "", "不得复用样本中的个案信息或隐私信息。"]
    .filter(Boolean)
    .join("");
}

function uniqueList(items) {
  const seen = new Set();
  return coerceArray(items).filter((item) => {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
