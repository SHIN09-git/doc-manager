import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkillMarkdownFromJson,
  normalizeAggregationData,
  normalizeSkillDraftOutput,
  normalizeSingleDocumentAnalysis,
  normalizeTestResult,
} from "../src/modules/skills/skillAnalyzer.js";

test("normalizeSingleDocumentAnalysis keeps single-document findings as candidates", () => {
  const result = normalizeSingleDocumentAnalysis(
    {
      document_name: "通知一",
      candidate_rules: [{ rule: "正文分条说明", confidence: 2 }],
      case_specific_items: ["2026年5月13日"],
    },
    { name: "通知一.txt", text: "样本" },
    0,
  );
  assert.equal(result.candidate_rules[0].confidence, 1);
  assert.deepEqual(result.case_specific_items, ["2026年5月13日"]);
});

test("normalizeAggregationData only promotes rules with multiple evidence", () => {
  const aggregation = normalizeAggregationData(
    {
      strong_rules: [
        { rule: "标题明确", evidence_count: 2 },
        { rule: "只出现一次的日期", evidence_count: 1 },
      ],
      candidate_rules: [{ rule: "可选表达", evidence_count: 1 }],
    },
    2,
  );
  assert.deepEqual(aggregation.strong_rules.map((rule) => rule.rule), ["标题明确"]);
  assert.deepEqual(aggregation.candidate_rules.map((rule) => rule.rule), ["可选表达", "只出现一次的日期"]);
});

test("normalizeSkillDraftOutput keeps strong rules in must and case-specific items forbidden", () => {
  const draft = normalizeSkillDraftOutput(
    { skill_json: { name: "通知写作", style_rules: {} } },
    { name: "通知写作", handle: "通知写作", examples: [{ name: "a" }] },
    {
      overall_confidence: "medium",
      strong_rules: [{ rule: "使用通知结构", support_count: 2, confidence: "medium" }],
      candidate_rules: [{ rule: "可使用请字句", support_count: 1, confidence: "low" }],
      case_specific_exclusions: ["张三"],
      must_not_promote: ["具体活动名"],
    },
  );
  assert.deepEqual(draft.skillJson.style_rules.must, ["使用通知结构"]);
  assert.deepEqual(draft.skillJson.style_rules.recommended, ["可使用请字句"]);
  assert.deepEqual(draft.skillJson.forbidden, ["张三", "具体活动名"]);
  assert.equal(draft.skillJson.rule_evidence["使用通知结构"].support_count, 2);
});

test("normalizeSkillDraftOutput creates executable writer card fields", () => {
  const draft = normalizeSkillDraftOutput(
    {
      skill_json: {
        name: "请示写作",
        handle: "qingshi",
        user_input_fields: ["事由", "依据"],
        validation_checklist: ["未复用样本隐私信息"],
      },
    },
    { name: "请示写作", handle: "qingshi", examples: [{ name: "请示一.docx" }] },
    {
      overall_confidence: "high",
      common_structure: ["标题、主送机关、缘由、请示事项、落款"],
      common_format: ["标题居中"],
      common_expressions: ["妥否，请批示。"],
      strong_rules: [{ rule: "结尾使用请示式收束", evidence_count: 3, confidence: "high" }],
      candidate_rules: [],
      review_standards: ["事实缺失不编造"],
      case_specific_exclusions: [],
      must_not_promote: [],
    },
  );

  assert.match(draft.skillJson.trigger_description, /@qingshi/);
  assert.deepEqual(draft.skillJson.input_contract.required_fields, ["事由", "依据"]);
  assert.ok(draft.skillJson.execution_workflow.length >= 3);
  assert.deepEqual(draft.skillJson.common_expression_library, ["妥否，请批示。"]);

  const markdown = buildSkillMarkdownFromJson(draft.skillJson, { overall_confidence: "high" });
  assert.match(markdown, /## 输入字段/);
  assert.match(markdown, /## 执行流程/);
  assert.match(markdown, /事由/);
});

test("mixed samples demote structural strong rules and cap confidence", () => {
  const aggregation = normalizeAggregationData(
    {
      overall_confidence: "high",
      mixed_sample_warning: true,
      detected_document_types: ["通知", "总结"],
      strong_rules: [
        { category: "structure", rule: "固定使用通知结构", support_count: 3, confidence: "high" },
        { category: "style", rule: "语气正式克制", support_count: 3, confidence: "high" },
      ],
    },
    4,
  );

  assert.equal(aggregation.overall_confidence, "medium");
  assert.deepEqual(aggregation.strong_rules.map((rule) => rule.rule), ["语气正式克制"]);
  assert.ok(aggregation.candidate_rules.some((rule) => rule.rule === "固定使用通知结构"));
  assert.equal(aggregation.aggregation_policy, "仅提炼共同文风、格式倾向和禁忌，不提炼跨文种结构强规则");
});

test("single sample rules cannot become must rules", () => {
  const draft = normalizeSkillDraftOutput(
    {
      skill_json: {
        name: "单篇草案",
        style_rules: { must: ["只出现一次的结构"], recommended: [] },
      },
    },
    { name: "单篇草案", examples: [{ name: "a" }] },
    {
      overall_confidence: "low",
      strong_rules: [],
      candidate_rules: [{ rule: "只出现一次的结构", support_count: 1, confidence: "medium" }],
      case_specific_exclusions: [],
      must_not_promote: [],
    },
  );

  assert.deepEqual(draft.skillJson.style_rules.must, []);
  assert.ok(draft.skillJson.style_rules.recommended.includes("只出现一次的结构"));
});

test("normalization drops empty rule text and object expressions without text", () => {
  const draft = normalizeSkillDraftOutput(
    {
      skill_json: {
        name: "表达清理",
        style_rules: {
          must: [{ nope: true }],
          recommended: [{ rule: "保持客观" }, ""],
          optional: [{ rule: "适当分条" }],
        },
        common_expression_library: [{ text: "请按要求落实。" }, { raw: "无效对象" }, ""],
      },
    },
    { name: "表达清理" },
    {
      overall_confidence: "medium",
      strong_rules: [],
      candidate_rules: [],
      case_specific_exclusions: [],
      must_not_promote: [],
    },
  );

  assert.deepEqual(draft.skillJson.style_rules.must, []);
  assert.deepEqual(draft.skillJson.style_rules.recommended, ["保持客观"]);
  assert.deepEqual(draft.skillJson.style_rules.optional, ["适当分条"]);
  assert.deepEqual(draft.skillJson.common_expression_library, ["请按要求落实。"]);
});

test("feedback task-only facts are kept out of long-term must rules", () => {
  const draft = normalizeSkillDraftOutput(
    {
      feedback_classification: {
        global_skill_rules: [],
        current_task_only_facts: ["张三", "2026年5月23日"],
        forbidden_or_negative_preferences: ["不要写得太宣传化"],
      },
      skill_json: {
        name: "反馈优化",
        style_rules: { must: ["张三参加活动"] },
      },
    },
    { name: "反馈优化" },
    {
      overall_confidence: "medium",
      strong_rules: [],
      candidate_rules: [],
      case_specific_exclusions: [],
      must_not_promote: [],
    },
  );

  assert.deepEqual(draft.skillJson.style_rules.must, []);
  assert.ok(draft.skillJson.case_specific_exclusions.includes("张三"));
  assert.ok(draft.skillJson.forbidden.includes("不要写得太宣传化"));
});

test("normalizeTestResult blocks saving on leaks and fabrication risks", () => {
  const result = normalizeTestResult({
    test_cases: [
      { case_id: "normal_test", passed: true, score: 90 },
      { case_id: "missing_fact_test", passed: false, score: 60, issues: ["自行补全地点"] },
      { case_id: "leakage_test", passed: false, score: 50, issues: ["复用样本人名"] },
    ],
    overall_result: {
      passed: false,
      score: 67,
      must_rule_miss_count: 0,
      privacy_leak_count: 1,
      case_specific_leak_count: 1,
      fabrication_risk_count: 1,
      save_allowed: true,
    },
  });

  assert.equal(result.report.overall_result.save_allowed, false);
  assert.equal(result.report.overall_result.passed, false);
});

test("normalizeTestResult derives save-blocking risks from failed test cases", () => {
  const result = normalizeTestResult({
    test_cases: [
      { case_id: "normal_test", passed: false, score: 70, issues: ["硬规则未命中"] },
      { case_id: "missing_fact_test", passed: false, score: 60, issues: ["缺少事实时没有使用占位符"] },
      { case_id: "leakage_test", passed: false, score: 50, issues: ["复用样本文档中的活动名和手机号"] },
    ],
    overall_result: {
      passed: true,
      score: 88,
      must_rule_miss_count: 0,
      privacy_leak_count: 0,
      case_specific_leak_count: 0,
      fabrication_risk_count: 0,
      save_allowed: true,
    },
  });

  assert.equal(result.report.overall_result.passed, false);
  assert.equal(result.report.overall_result.save_allowed, false);
  assert.equal(result.report.overall_result.must_rule_miss_count, 1);
  assert.equal(result.report.overall_result.fabrication_risk_count, 1);
  assert.equal(result.report.overall_result.case_specific_leak_count, 1);
  assert.equal(result.report.overall_result.privacy_leak_count, 1);
});
