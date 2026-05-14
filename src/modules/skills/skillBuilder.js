import { DEFAULT_SYSTEM_PROMPT } from "../../config/constants.js";
import { formatAggregationMarkdown } from "../../utils/formatters.js";
import { createId, now } from "../../utils/helpers.js";
import {
  normalizeAggregationData,
  normalizeSingleDocumentAnalysis,
  normalizeSkillDraftOutput,
  normalizeSkillQualityReport,
  pickSkillMetadata,
} from "./skillAnalyzer.js";

export function createSkillBuilder(deps) {
  const {
    callAiJsonWithRepair,
    getSystemPrompt = () => DEFAULT_SYSTEM_PROMPT,
    normalizeSkillJsonText,
  } = deps;

  async function buildSkillWithAiChain(style, progress = null) {
    const examples = (style.examples || []).slice(0, 8);
    const analyses = [];
    for (const [index, example] of examples.entries()) {
      const baseProgress = 8 + Math.round((index / Math.max(examples.length, 1)) * 36);
      progress?.update(`正在分析样本文档 ${index + 1}/${examples.length}：${example.name}`, baseProgress);
      const analysis = await analyzeSingleDocument(style, example, index);
      example.analysis = analysis;
      example.analyzedAt = now();
      analyses.push(analysis);
    }

    progress?.update("正在聚合多篇文档规则", 52);
    const aggregationData = await aggregateDocumentAnalyses(style, analyses);
    progress?.update("正在生成执笔人草案", 66);
    let draft = await generateSkillDraft(style, aggregationData);
    if ((style.feedbacks || []).length > 0) {
      progress?.update("正在吸收用户反馈优化执笔人", 74);
      draft = await optimizeSkillWithFeedback(style, draft, aggregationData);
    }
    progress?.update("正在生成测试文档并自检", 82);
    const test = await testSkillOnGeneration(style, draft.skillJson, draft.exampleInput);
    const qualityReport = normalizeSkillQualityReport(style, aggregationData, draft.qualityReport, test.report);

    return {
      analyses,
      analysis: JSON.stringify(analyses, null, 2),
      aggregationData,
      aggregation: formatAggregationMarkdown(aggregationData),
      markdown: draft.markdown,
      skillJson: normalizeSkillJsonText(JSON.stringify(draft.skillJson, null, 2), style),
      qualityReport,
      testDoc: test.document,
      testReport: JSON.stringify(test.report, null, 2),
    };
  }

  async function analyzeSingleDocument(style, example, index) {
    const prompt = [
      "你是多文档执笔人构建系统的“单篇文档分析器”。请只分析这一篇样本文档，不能把单篇现象写成强规则。",
      "请识别结构、文风、句式、格式、变量槽位、候选规则、隐私/敏感信息、个案信息、禁止复用内容。",
      "质量要求：具体人名、时间、地点、活动名称、临时安排、一次性政策只能进入 case_specific_items 或 forbidden_to_reuse，不能进入 reusable_expressions 或 candidate_rules。",
      "只输出 JSON，不要 Markdown。",
      "JSON 结构：{\n  \"document_id\": \"...\",\n  \"document_name\": \"...\",\n  \"document_type\": \"...\",\n  \"scenario\": \"...\",\n  \"title_format\": \"...\",\n  \"opening_pattern\": \"...\",\n  \"body_structure\": [],\n  \"paragraph_functions\": [],\n  \"ending_pattern\": \"...\",\n  \"tone_style\": [],\n  \"format_rules\": [],\n  \"common_words_sentences\": [],\n  \"reusable_expressions\": [],\n  \"variable_slots\": [],\n  \"candidate_rules\": [{\"category\":\"structure|style|format|expression|review\", \"rule\":\"...\", \"evidence\":\"...\", \"confidence\":0.0}],\n  \"case_specific_items\": [],\n  \"privacy_or_sensitive_items\": [],\n  \"forbidden_to_reuse\": [],\n  \"review_standards\": []\n}",
      `执笔人名称：${style.name}`,
      `样本序号：${index + 1}`,
      `样本文件名：${example.name}`,
      `样本文本：\n${String(example.text || "").slice(0, 12000)}`,
    ].join("\n\n");
    const result = await callAiJsonWithRepair(buildMessages(prompt), "单篇文档分析 JSON");
    return normalizeSingleDocumentAnalysis(result, example, index);
  }

  async function aggregateDocumentAnalyses(style, analyses) {
    const prompt = [
      "你是多文档执笔人构建系统的“多篇聚合器”。请横向比较多篇单篇分析，提炼共同点、差异点和冲突点。",
      "核心原则：单篇文档只能产生候选规则；只有至少 2 篇样本文档共同验证，才可以成为 strong_rules。若样本总数少于 3，overall_confidence 不能高于 medium。",
      "必须排除具体人名、时间、地点、活动名称、临时安排、一次性政策，不能把它们当成通用写作规则。",
      "只输出 JSON，不要 Markdown。",
      "JSON 结构：{\n  \"document_count\": 0,\n  \"overall_confidence\": \"low|medium|high\",\n  \"common_structure\": [],\n  \"common_style\": [],\n  \"common_format\": [],\n  \"common_expressions\": [],\n  \"review_standards\": [],\n  \"strong_rules\": [{\"category\":\"structure|style|format|expression|review\", \"rule\":\"...\", \"evidence_count\":2, \"confidence\":0.0, \"source_documents\":[]}],\n  \"candidate_rules\": [{\"category\":\"...\", \"rule\":\"...\", \"evidence_count\":1, \"confidence\":0.0, \"reason\":\"...\"}],\n  \"conflicts\": [{\"topic\":\"...\", \"variants\":[], \"resolution\":\"...\"}],\n  \"case_specific_exclusions\": [],\n  \"privacy_findings\": [],\n  \"must_not_promote\": [],\n  \"recommended_calibration\": []\n}",
      `执笔人名称：${style.name}`,
      `单篇分析：\n${JSON.stringify(analyses, null, 2)}`,
    ].join("\n\n");
    const result = await callAiJsonWithRepair(buildMessages(prompt), "多篇聚合 JSON");
    return normalizeAggregationData(result, analyses.length);
  }

  async function generateSkillDraft(style, aggregationData) {
    const prompt = [
      "你是多文档执笔人构建系统的“执笔人草案生成器”。请根据多篇聚合结果生成可复用、可编辑、可测试的文本生成执笔人。",
      "生成 skill_json 字段时，strong_rules 必须来自聚合结果 strong_rules；candidate_rules 只能放入 recommended 或 optional，不得伪装成必须规则。",
      "skill_json 是程序调用的执笔人规则 JSON，要能被后续文档生成模块调用，用来控制文种结构、行文风格、格式规范、常用表达和审稿标准。",
      "只输出 JSON，不要 Markdown。",
      "JSON 结构：{\n  \"markdown\":\"# 执笔人名称\\n...\",\n  \"skill_json\": {\n    \"name\":\"...\",\n    \"handle\":\"...\",\n    \"version\":\"...\",\n    \"enabled\": true,\n    \"category\":\"...\",\n    \"description\":\"...\",\n    \"applicable_scope\":\"...\",\n    \"confidence\":\"low|medium|high\",\n    \"source_documents\": [],\n    \"user_input_fields\": [],\n    \"document_structure_template\": [],\n    \"style_rules\": {\"must\": [], \"recommended\": [], \"optional\": []},\n    \"format_rules\": [],\n    \"common_expression_library\": [],\n    \"scene_variations\": [],\n    \"variable_slots\": [],\n    \"forbidden\": [],\n    \"privacy_filters\": [],\n    \"case_specific_exclusions\": [],\n    \"generation_steps\": [],\n    \"self_checklist\": [],\n    \"review_standards\": [],\n    \"quality_controls\": {\"rule_confidence\":\"...\", \"conflict_resolution\": [], \"single_document_rule_policy\":\"...\"},\n    \"example_input\": {},\n    \"example_output\": \"...\"\n  },\n  \"quality_report\": {\"confidence\":\"...\", \"strong_rule_count\":0, \"candidate_rule_count\":0, \"conflicts\":[], \"excluded_case_specific_items\":[], \"privacy_filter_notes\":[]},\n  \"example_input\": {}\n}",
      `执笔人基本信息：${JSON.stringify(pickSkillMetadata(style), null, 2)}`,
      `聚合结果：\n${JSON.stringify(aggregationData, null, 2)}`,
    ].join("\n\n");
    const result = await callAiJsonWithRepair(buildMessages(prompt), "执笔人草案 JSON");
    return normalizeSkillDraftOutput(result, style, aggregationData);
  }

  async function optimizeSkillWithFeedback(style, draft, aggregationData) {
    const feedbacks = (style.feedbacks || []).map((feedback, index) => `${index + 1}. ${feedback.text}`).join("\n");
    const prompt = [
      "你是多文档执笔人构建系统的“反馈优化器”。请在不破坏强规则证据链的前提下，根据用户反馈优化执笔人。",
      "反馈可以增强表达、补充禁忌、调整测试标准；但不能把单篇个案或用户随口提到的具体人名、时间、地点、活动名称提升为通用规则。",
      "只输出与 generateSkillDraft 相同结构的 JSON。",
      `用户反馈：\n${feedbacks}`,
      `聚合结果：\n${JSON.stringify(aggregationData, null, 2)}`,
      `当前草案：\n${JSON.stringify(draft, null, 2)}`,
    ].join("\n\n");
    const result = await callAiJsonWithRepair(buildMessages(prompt), "反馈优化执笔人 JSON");
    return normalizeSkillDraftOutput(result, style, aggregationData);
  }

  async function testSkillOnGeneration(style, skillJson, exampleInput = null) {
    const testInput = exampleInput && Object.keys(exampleInput).length > 0
      ? exampleInput
      : {
          主题: `${style.name || "该类文档"}测试生成`,
          使用场景: "组织内部正式文档起草",
          关键事项: "请使用占位符补足未提供的时间、地点、对象和落款信息",
        };
    const prompt = [
      "你是多文档执笔人构建系统的“生成测试与规则命中检查器”。请使用执笔人规则 JSON 生成一篇测试文档，并检查规则命中情况。",
      "检查重点：结构规则、文风规则、格式规则、常用表达、禁忌事项、隐私过滤、是否误用个案信息。",
      "只输出 JSON，不要 Markdown。",
      "JSON 结构：{\n  \"test_document_markdown\":\"...\",\n  \"check_report\": {\n    \"passed\": true,\n    \"score\": 0,\n    \"rule_hits\": [],\n    \"rule_misses\": [],\n    \"privacy_risks\": [],\n    \"case_specific_leaks\": [],\n    \"format_issues\": [],\n    \"suggested_fixes\": []\n  }\n}",
      `执笔人规则 JSON：\n${JSON.stringify(skillJson, null, 2)}`,
      `测试输入：\n${JSON.stringify(testInput, null, 2)}`,
    ].join("\n\n");
    const result = await callAiJsonWithRepair(buildMessages(prompt), "执笔人生成测试 JSON");
    return {
      document: result.test_document_markdown || result.document || "",
      report: result.check_report || result.report || {},
    };
  }

  function createSkillVersion(style, outputs) {
    const versionNumber = (style.versions || []).length + 1;
    return {
      id: createId(),
      version: versionNumber,
      createdAt: now(),
      sourceExamples: (style.examples || []).map((example) => ({
        id: example.id || createId(),
        name: example.name,
        length: example.text?.length || 0,
      })),
      analyses: outputs.analyses || [],
      analysis: outputs.analysis || "",
      aggregationData: outputs.aggregationData || null,
      aggregation: outputs.aggregation || "",
      summary: outputs.markdown || "",
      skillJson: outputs.skillJson || "",
      qualityReport: outputs.qualityReport || null,
      testDoc: outputs.testDoc || "",
      testReport: outputs.testReport || "",
    };
  }

  function buildMessages(prompt) {
    return [
      { role: "system", content: getSystemPrompt() || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];
  }

  return {
    buildSkillWithAiChain,
    analyzeSingleDocument,
    aggregateDocumentAnalyses,
    generateSkillDraft,
    optimizeSkillWithFeedback,
    testSkillOnGeneration,
    createSkillVersion,
    normalizeSkillQualityReport,
  };
}
