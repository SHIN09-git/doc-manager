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
  const normalizedSkillJson = {
    ...skillJson,
    name: skillJson.name || style.name || "未命名执笔人",
    handle: normalizeHandle(skillJson.handle || style.handle || style.name),
    enabled: style.enabled !== false,
    category: skillJson.category || style.category || "自定义",
    description: skillJson.description || style.description || "",
    confidence: skillJson.confidence || aggregationData.overall_confidence || "low",
    source_documents: skillJson.source_documents || (style.examples || []).map((example) => example.name),
    style_rules: normalizeStyleRules(skillJson.style_rules, aggregationData),
    format_rules: coerceArray(skillJson.format_rules || aggregationData.common_format),
    common_expression_library: coerceArray(skillJson.common_expression_library || aggregationData.common_expressions),
    variable_slots: coerceArray(skillJson.variable_slots),
    forbidden: [
      ...coerceArray(skillJson.forbidden),
      ...coerceArray(aggregationData.case_specific_exclusions),
      ...coerceArray(aggregationData.must_not_promote),
    ],
    privacy_filters: coerceArray(skillJson.privacy_filters || aggregationData.privacy_findings),
    case_specific_exclusions: coerceArray(skillJson.case_specific_exclusions || aggregationData.case_specific_exclusions),
    review_standards: coerceArray(skillJson.review_standards || aggregationData.review_standards),
    quality_controls: {
      ...(skillJson.quality_controls || {}),
      rule_confidence: skillJson.confidence || aggregationData.overall_confidence || "low",
      single_document_rule_policy: "单篇样本只产生候选规则；至少 2 篇共同验证后才能成为强规则",
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
  return [
    `# ${skillJson.name || "未命名执笔人"}`,
    "",
    `@调用名：@${skillJson.handle || ""}`,
    `置信度：${skillJson.confidence || aggregationData.overall_confidence || "low"}`,
    "",
    "## 适用范围",
    skillJson.applicable_scope || "待补充",
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
    formatListItems(skillJson.self_checklist || []),
  ].join("\n");
}
