import assert from "node:assert/strict";
import test from "node:test";
import { createSkillBuilder } from "../src/modules/skills/skillBuilder.js";

test("analyzeSingleDocument repairs schema-invalid JSON before normalizing", async () => {
  const responses = [
    { document_name: "样本一", candidate_rules: { rule: "错误对象" } },
    { document_name: "样本一", candidate_rules: [{ rule: "候选规则", confidence: "medium" }] },
  ];
  const labels = [];
  const builder = createSkillBuilder({
    callAiJsonWithRepair: async (_messages, label) => {
      labels.push(label);
      return responses.shift();
    },
    normalizeSkillJsonText: (value) => value,
  });

  const analysis = await builder.analyzeSingleDocument(
    { name: "通知执笔人" },
    { id: "doc_1", name: "样本一.txt", text: "正文" },
    0,
  );

  assert.deepEqual(analysis.candidate_rules.map((rule) => rule.rule), ["候选规则"]);
  assert.equal(labels.length, 2);
  assert.match(labels[1], /修复 1/);
});

test("testSkillOnGeneration requires three lightweight test cases and preserves save gate", async () => {
  const builder = createSkillBuilder({
    callAiJsonWithRepair: async () => ({
      test_cases: [
        { case_id: "normal_test", passed: true, score: 90, issues: [], test_document_markdown: "正常" },
        { case_id: "missing_fact_test", passed: true, score: 85, issues: [], test_document_markdown: "缺失事实使用【可替换占位符】" },
        { case_id: "leakage_test", passed: false, score: 50, issues: ["复用样本人名"], test_document_markdown: "泄漏" },
      ],
      overall_result: {
        passed: false,
        score: 75,
        must_rule_miss_count: 0,
        privacy_leak_count: 0,
        case_specific_leak_count: 1,
        fabrication_risk_count: 0,
        save_allowed: true,
      },
    }),
    normalizeSkillJsonText: (value) => value,
  });

  const result = await builder.testSkillOnGeneration({ name: "通知执笔人" }, { name: "通知执笔人" });

  assert.equal(result.report.test_cases.length, 3);
  assert.equal(result.report.overall_result.save_allowed, false);
  assert.match(result.document, /missing_fact_test/);
});

test("buildSkillWithAiChain can create a gated draft without running the generation test", async () => {
  const labels = [];
  const builder = createSkillBuilder({
    callAiJsonWithRepair: async (_messages, label) => {
      labels.push(label);
      if (label.includes("单篇")) {
        return {
          document_name: label,
          document_type: "通知",
          scenario: "校内安排",
          candidate_rules: [{ rule: "正文使用分条表达", confidence: "medium" }],
        };
      }
      if (label.includes("聚合")) {
        return {
          document_count: 2,
          overall_confidence: "medium",
          detected_document_types: ["通知"],
          strong_rules: [{
            category: "structure",
            rule: "正文使用分条表达",
            support_count: 2,
            support_doc_ids: ["doc-1", "doc-2"],
            confidence: "medium",
          }],
          candidate_rules: [],
        };
      }
      return {
        markdown: "# 通知执笔人",
        skill_json: {
          name: "通知执笔人",
          handle: "notice",
          style_rules: { must: ["正文使用分条表达"], recommended: [], optional: [] },
        },
        quality_report: { confidence: "medium" },
        example_input: {},
      };
    },
    normalizeSkillJsonText: (value) => value,
  });

  const result = await builder.buildSkillWithAiChain({
    name: "通知执笔人",
    handle: "notice",
    examples: [
      { id: "doc-1", name: "一.txt", text: "通知一" },
      { id: "doc-2", name: "二.txt", text: "通知二" },
    ],
  }, null, { runTest: false });

  assert.equal(labels.filter((label) => label.includes("生成测试")).length, 0);
  assert.equal(labels.length, 4);
  assert.equal(JSON.parse(result.testReport).skipped, true);
  assert.equal(JSON.parse(result.testReport).overall_result.save_allowed, false);
});
