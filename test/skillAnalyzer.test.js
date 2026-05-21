import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkillMarkdownFromJson,
  normalizeAggregationData,
  normalizeSkillDraftOutput,
  normalizeSingleDocumentAnalysis,
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
  assert.deepEqual(aggregation.candidate_rules.map((rule) => rule.rule), ["可选表达"]);
});

test("normalizeSkillDraftOutput keeps strong rules in must and case-specific items forbidden", () => {
  const draft = normalizeSkillDraftOutput(
    { skill_json: { name: "通知写作", style_rules: {} } },
    { name: "通知写作", handle: "通知写作", examples: [{ name: "a" }] },
    {
      overall_confidence: "medium",
      strong_rules: [{ rule: "使用通知结构" }],
      candidate_rules: [{ rule: "可使用请字句" }],
      case_specific_exclusions: ["张三"],
      must_not_promote: ["具体活动名"],
    },
  );
  assert.deepEqual(draft.skillJson.style_rules.must, ["使用通知结构"]);
  assert.deepEqual(draft.skillJson.style_rules.recommended, ["可使用请字句"]);
  assert.deepEqual(draft.skillJson.forbidden, ["张三", "具体活动名"]);
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
      strong_rules: [{ rule: "结尾使用请示式收束", evidence_count: 3 }],
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
