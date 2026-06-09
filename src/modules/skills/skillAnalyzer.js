import { formatListItems } from "../../utils/formatters.js";
import { normalizeHandle, stableTextHash } from "../../utils/helpers.js";
import { clampConfidence, coerceArray } from "../../utils/validation.js";
import { MISSING_FACT_PLACEHOLDER } from "../../config/constants.js";

export function normalizeSingleDocumentAnalysis(result, example, index) {
  const documentId = example.id || stableTextHash(example.name + example.text);
  return {
    document_id: documentId,
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
        support_count: 1,
        support_doc_ids: [documentId],
        scope: rule.scope || "document_type",
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

export function normalizeAggregationData(result, documentCount, analyses = []) {
  const detectedDocumentTypes = uniqueList(
    coerceArray(result.detected_document_types).length
      ? result.detected_document_types
      : analyses.map((analysis) => analysis.document_type).filter(Boolean),
  );
  const detectedScenarios = uniqueList(
    coerceArray(result.detected_scenarios).length
      ? result.detected_scenarios
      : analyses.map((analysis) => analysis.scenario).filter(Boolean),
  );
  const mixedSampleWarning = Boolean(
    result.mixed_sample_warning ||
      detectedDocumentTypes.length > 1 ||
      (detectedScenarios.length > 1 && Number(documentCount || 0) > 1),
  );
  const normalizedStrongCandidates = coerceArray(result.strong_rules).map(normalizeAggregatedRule);
  const promotableStrongRules = normalizedStrongCandidates.filter((rule) =>
    isPromotableStrongRule(rule, { mixedSampleWarning }),
  );
  const demotedStrongRules = normalizedStrongCandidates
    .filter((rule) => !isPromotableStrongRule(rule, { mixedSampleWarning }))
    .map((rule) => ({
      ...rule,
      reason: rule.reason || (mixedSampleWarning && isStructureRule(rule) ? "样本混杂，结构规则降级为候选规则" : "证据不足或置信度过低"),
    }));
  const overallConfidence = normalizeOverallConfidence(
    result.overall_confidence || (documentCount >= 3 ? "medium" : "low"),
    { documentCount, mixedSampleWarning },
  );
  return {
    document_count: Number(result.document_count || documentCount || 0),
    overall_confidence: overallConfidence,
    mixed_sample_warning: mixedSampleWarning,
    detected_document_types: detectedDocumentTypes,
    detected_scenarios: detectedScenarios,
    aggregation_policy:
      result.aggregation_policy ||
      (mixedSampleWarning ? "仅提炼共同文风、格式倾向和禁忌，不提炼跨文种结构强规则" : "按同类样本提炼稳定结构、文风和格式规则"),
    common_structure: coerceArray(result.common_structure),
    common_style: coerceArray(result.common_style),
    common_format: coerceArray(result.common_format),
    common_expressions: coerceArray(result.common_expressions),
    review_standards: coerceArray(result.review_standards),
    strong_rules: promotableStrongRules,
    candidate_rules: [...coerceArray(result.candidate_rules).map(normalizeAggregatedRule), ...demotedStrongRules],
    conflicts: coerceArray(result.conflicts),
    case_specific_exclusions: coerceArray(result.case_specific_exclusions),
    privacy_findings: coerceArray(result.privacy_findings),
    must_not_promote: coerceArray(result.must_not_promote),
    recommended_calibration: coerceArray(result.recommended_calibration),
  };
}

export function normalizeAggregatedRule(rule) {
  const supportCount = Number(rule.support_count || rule.evidence_count || 1);
  const supportDocIds = coerceArray(rule.support_doc_ids || rule.source_documents);
  const confidence = toConfidenceLevel(rule.confidence ?? rule.confidence_level ?? 0.5);
  return {
    category: rule.category || "style",
    rule: String(rule.rule || rule).trim(),
    evidence_count: supportCount,
    support_count: supportCount,
    confidence,
    support_doc_ids: supportDocIds,
    source_documents: supportDocIds,
    scope: rule.scope || "document_type",
    reason: rule.reason || "",
  };
}

export function normalizeSkillDraftOutput(result, style, aggregationData) {
  const skillJson = result.skill_json || result.skillJson || {};
  const styleRules = normalizeStyleRules(skillJson.style_rules, aggregationData);
  const ruleEvidence = buildRuleEvidence(skillJson.rule_evidence, aggregationData);
  const commonExpressionLibrary = coerceArray(
    skillJson.common_expression_library || skillJson.reusable_expressions || aggregationData.common_expressions,
  )
    .map(expressionToText)
    .filter((expression) => isReusableExpressionSafe(expression, aggregationData));
  const selfChecklist = coerceArray(skillJson.self_checklist || skillJson.validation_checklist);
  const reviewStandards = coerceArray(skillJson.review_standards || aggregationData.review_standards);
  const feedbackClassification = normalizeFeedbackClassification(result.feedback_classification || skillJson.feedback_classification);
  const forbidden = uniqueList([
    ...coerceArray(skillJson.forbidden),
    ...coerceArray(aggregationData.case_specific_exclusions),
    ...coerceArray(aggregationData.must_not_promote),
    ...feedbackClassification.current_task_only_facts,
    ...feedbackClassification.forbidden_or_negative_preferences,
  ]);
  const normalizedSkillJson = {
    ...skillJson,
    name: skillJson.name || style.name || "未命名执笔人",
    handle: normalizeHandle(skillJson.handle || style.handle || style.name),
    enabled: style.enabled !== false,
    category: skillJson.category || style.category || "自定义",
    description: skillJson.description || style.description || "",
    confidence: normalizeOverallConfidence(skillJson.confidence || aggregationData.overall_confidence || "low", {
      documentCount: aggregationData.document_count,
      mixedSampleWarning: aggregationData.mixed_sample_warning,
    }),
    mixed_sample_warning: Boolean(aggregationData.mixed_sample_warning),
    detected_document_types: coerceArray(aggregationData.detected_document_types),
    aggregation_policy: aggregationData.aggregation_policy || "",
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
    rule_evidence: ruleEvidence,
    format_rules: coerceArray(skillJson.format_rules || aggregationData.common_format),
    common_expression_library: commonExpressionLibrary,
    variable_slots: coerceArray(skillJson.variable_slots),
    forbidden,
    privacy_filters: coerceArray(skillJson.privacy_filters || aggregationData.privacy_findings),
    case_specific_exclusions: uniqueList([
      ...coerceArray(skillJson.case_specific_exclusions || aggregationData.case_specific_exclusions),
      ...feedbackClassification.current_task_only_facts,
    ]),
    feedback_classification: feedbackClassification,
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
  const strongMustRules = strong.filter((rule) => isPromotableStrongRule(rule, aggregationData)).map(ruleToText).filter(Boolean);
  const requestedMust = styleRules && !Array.isArray(styleRules) ? coerceArray(styleRules.must).map(ruleToText).filter(Boolean) : [];
  const demotedMust = requestedMust.filter((rule) => !strongMustRules.includes(rule));
  if (styleRules && !Array.isArray(styleRules)) {
    return {
      must: uniqueList(strongMustRules),
      recommended: uniqueList([
        ...coerceArray(styleRules.recommended).map(ruleToText).filter(Boolean),
        ...demotedMust,
        ...candidates.map(ruleToText).filter(Boolean),
      ]),
      optional: coerceArray(styleRules.optional).map(ruleToText).filter(Boolean),
    };
  }
  return {
    must: uniqueList(strongMustRules),
    recommended: candidates.map(ruleToText).filter(Boolean),
    optional: coerceArray(styleRules).map(ruleToText).filter(Boolean),
  };
}

export function normalizeSkillQualityReport(style, aggregationData, draftReport, testReport) {
  return {
    confidence: normalizeOverallConfidence(draftReport?.confidence || aggregationData.overall_confidence || "low", {
      documentCount: aggregationData.document_count || (style.examples || []).length,
      mixedSampleWarning: aggregationData.mixed_sample_warning,
    }),
    document_count: aggregationData.document_count || (style.examples || []).length,
    strong_rules: aggregationData.strong_rules || [],
    candidate_rules: aggregationData.candidate_rules || [],
    conflicts: aggregationData.conflicts || [],
    mixed_sample_warning: Boolean(aggregationData.mixed_sample_warning),
    detected_document_types: aggregationData.detected_document_types || [],
    aggregation_policy: aggregationData.aggregation_policy || "",
    case_specific_exclusions: aggregationData.case_specific_exclusions || [],
    privacy_findings: aggregationData.privacy_findings || [],
    privacy_filter_notes: draftReport?.privacy_filter_notes || [],
    test_report: normalizeTestResult(testReport).report,
  };
}

export function normalizeTestResult(result = {}) {
  const cases = Array.isArray(result.test_cases)
    ? result.test_cases.map(normalizeTestCase)
    : [normalizeLegacyTestCase(result)];
  const legacyReport = result.check_report || result.report || result;
  const derived = deriveOverallResult(cases, legacyReport);
  const reported = result.overall_result && typeof result.overall_result === "object" ? result.overall_result : {};
  const normalizedOverall = {
    passed: derived.passed !== false && reported.passed !== false,
    score: Number(reported.score ?? derived.score ?? 0),
    must_rule_miss_count: Math.max(Number(derived.must_rule_miss_count || 0), Number(reported.must_rule_miss_count || 0)),
    privacy_leak_count: Math.max(Number(derived.privacy_leak_count || 0), Number(reported.privacy_leak_count || 0)),
    case_specific_leak_count: Math.max(Number(derived.case_specific_leak_count || 0), Number(reported.case_specific_leak_count || 0)),
    fabrication_risk_count: Math.max(Number(derived.fabrication_risk_count || 0), Number(reported.fabrication_risk_count || 0)),
    save_allowed: derived.save_allowed !== false && reported.save_allowed !== false,
  };
  if (
    normalizedOverall.privacy_leak_count > 0 ||
    normalizedOverall.case_specific_leak_count > 0 ||
    normalizedOverall.fabrication_risk_count > 0 ||
    normalizedOverall.must_rule_miss_count > 0
  ) {
    normalizedOverall.passed = false;
    normalizedOverall.save_allowed = false;
  }
  return {
    document: cases.map((item) => `## ${item.case_id}\n\n${item.test_document_markdown || ""}`).join("\n\n").trim(),
    report: {
      test_cases: cases,
      overall_result: normalizedOverall,
    },
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
  const defaultPolicy = `事实缺失时使用${MISSING_FACT_PLACEHOLDER}，不编造具体人名、时间、地点、单位、数据、结论、政策依据和落款。`;
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
    `使用 common_expression_library 时替换变量槽位，事实缺失处保留${MISSING_FACT_PLACEHOLDER}。`,
    "按 validation_checklist 自检格式、文风、禁忌和隐私风险。",
  ].filter((step, index) => index !== 2 || coerceArray(styleRules?.must).length || coerceArray(styleRules?.recommended).length);
}

function isPromotableStrongRule(rule, context = {}) {
  return Number(rule.support_count || rule.evidence_count || 0) >= 2 &&
    toConfidenceLevel(rule.confidence) !== "low" &&
    !(context.mixedSampleWarning && isStructureRule(rule));
}

function isStructureRule(rule) {
  const category = String(rule.category || "").toLowerCase();
  const scope = String(rule.scope || "").toLowerCase();
  const text = String(rule.rule || "");
  return category.includes("structure") || scope === "section" || /结构|模板|标题.*正文|开头.*结尾/.test(text);
}

function normalizeOverallConfidence(value, { documentCount = 0, mixedSampleWarning = false } = {}) {
  const level = toConfidenceLevel(value);
  if (mixedSampleWarning && level === "high") return "medium";
  if (Number(documentCount || 0) < 3 && level === "high") return "medium";
  return level;
}

function toConfidenceLevel(value) {
  if (["low", "medium", "high"].includes(value)) return value;
  const score = clampConfidence(Number(value));
  if (score < 0.45) return "low";
  if (score < 0.75) return "medium";
  return "high";
}

function buildRuleEvidence(existingEvidence, aggregationData) {
  const evidence = existingEvidence && typeof existingEvidence === "object" && !Array.isArray(existingEvidence)
    ? { ...existingEvidence }
    : {};
  [...coerceArray(aggregationData.strong_rules), ...coerceArray(aggregationData.candidate_rules)].forEach((rule) => {
    if (!rule?.rule) return;
    evidence[rule.rule] = {
      support_count: Number(rule.support_count || rule.evidence_count || 1),
      support_doc_ids: coerceArray(rule.support_doc_ids || rule.source_documents),
      scope: rule.scope || "document_type",
      confidence: toConfidenceLevel(rule.confidence),
    };
  });
  return evidence;
}

function ruleToText(rule) {
  if (typeof rule === "string") return rule.trim();
  if (rule && typeof rule === "object") {
    return String(rule.rule || rule.text || rule.expression || "").trim();
  }
  return String(rule || "").trim();
}

function expressionToText(expression) {
  if (typeof expression === "string") return expression.trim();
  if (expression && typeof expression === "object") {
    return String(expression.text || expression.expression || expression.phrase || expression.value || "").trim();
  }
  return String(expression || "").trim();
}

function normalizeFeedbackClassification(value = {}) {
  return {
    global_skill_rules: coerceArray(value.global_skill_rules),
    current_task_only_facts: coerceArray(value.current_task_only_facts),
    forbidden_or_negative_preferences: coerceArray(value.forbidden_or_negative_preferences),
  };
}

function normalizeTestCase(value = {}) {
  return {
    case_id: value.case_id || "normal_test",
    passed: value.passed !== false,
    score: Number(value.score || 0),
    issues: coerceArray(value.issues),
    test_document_markdown: value.test_document_markdown || value.document || "",
  };
}

function normalizeLegacyTestCase(value = {}) {
  const report = value.check_report || value.report || value;
  return normalizeTestCase({
    case_id: "normal_test",
    passed: report.passed !== false,
    score: report.score || 0,
    issues: [
      ...coerceArray(report.rule_misses),
      ...coerceArray(report.privacy_risks),
      ...coerceArray(report.case_specific_leaks),
      ...coerceArray(report.format_issues),
      ...coerceArray(report.suggested_fixes),
    ],
    test_document_markdown: value.test_document_markdown || value.document || "",
  });
}

function deriveOverallResult(cases, legacyReport = {}) {
  const issueText = JSON.stringify(legacyReport);
  const mustMiss =
    coerceArray(legacyReport.rule_misses).length +
    countIssueCases(cases, (item, text) =>
      (item.case_id === "normal_test" && item.passed === false) || /硬规则|必须|must|未命中|漏命中|未遵守/.test(text),
    );
  const privacyLeaks =
    coerceArray(legacyReport.privacy_risks).length +
    countIssueCases(cases, (_item, text) => /隐私|敏感|泄露|泄漏|手机号|电话|身份证|邮箱|学号|账号|住址|地址/.test(text));
  const caseLeaks =
    coerceArray(legacyReport.case_specific_leaks).length +
    countIssueCases(cases, (item, text) =>
      (item.case_id === "leakage_test" && item.passed === false) ||
      /复用样本|样本.*人名|样本.*地点|活动名|个案|一次性|临时安排|具体安排|特定人物|特定地点/.test(text),
    );
  const fabricationRisks =
    (/编造|杜撰|自行补全|虚构/.test(issueText) ? 1 : 0) +
    countIssueCases(cases, (item, text) =>
      (item.case_id === "missing_fact_test" && item.passed === false) ||
      /编造|杜撰|自行补全|自行补足|虚构|未使用.*占位符|没有.*占位符|缺少.*占位符/.test(text),
    );
  const averageScore = cases.length
    ? Math.round(cases.reduce((sum, item) => sum + Number(item.score || 0), 0) / cases.length)
    : 0;
  return {
    passed: cases.every((item) => item.passed) && mustMiss === 0 && privacyLeaks === 0 && caseLeaks === 0 && fabricationRisks === 0,
    score: averageScore,
    must_rule_miss_count: mustMiss,
    privacy_leak_count: privacyLeaks,
    case_specific_leak_count: caseLeaks,
    fabrication_risk_count: fabricationRisks,
    save_allowed: mustMiss === 0 && privacyLeaks === 0 && caseLeaks === 0 && fabricationRisks === 0,
  };
}

function countIssueCases(cases, predicate) {
  return coerceArray(cases).filter((item) => {
    const issueText = coerceArray(item.issues).join(" ");
    return predicate(item, issueText);
  }).length;
}

function isReusableExpressionSafe(expression, aggregationData) {
  const text = String(expression || "").trim();
  if (!text) return false;
  const exclusions = [
    ...coerceArray(aggregationData.case_specific_exclusions),
    ...coerceArray(aggregationData.privacy_findings),
    ...coerceArray(aggregationData.must_not_promote),
  ].filter(Boolean);
  if (exclusions.some((item) => item && text.includes(String(item)))) return false;
  return !/(\d{4}年\d{1,2}月\d{0,2}日?|\d{1,2}月\d{1,2}日|1[3-9]\d{9}|[\w.-]+@[\w.-]+|\d{17}[\dXx])/.test(text);
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
