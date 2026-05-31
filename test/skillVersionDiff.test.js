import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkillVersionDiff,
  createVersionSnapshot,
} from "../src/modules/skills/skillVersionDiff.js";

test("createVersionSnapshot extracts version rules and test gates", () => {
  const snapshot = createVersionSnapshot({
    skillJson: JSON.stringify({
      style_rules: {
        must: ["标题必须清晰"],
        recommended: ["语气正式"],
        optional: ["适当分条"],
      },
      forbidden: ["不得宣传化"],
      case_specific_exclusions: ["张三"],
      privacy_filters: ["手机号"],
      common_expression_library: [{ text: "请按要求落实。" }],
    }),
    aggregationData: {
      candidate_rules: [{ rule: "正文先交代背景" }],
    },
    testReport: JSON.stringify({
      test_cases: [{ case_id: "normal_test", issues: ["少一个落款"] }],
      overall_result: { passed: false, score: 82, must_rule_miss_count: 1, save_allowed: false },
    }),
  });

  assert.deepEqual(snapshot.mustRules, ["标题必须清晰"]);
  assert.ok(snapshot.candidateRules.includes("正文先交代背景"));
  assert.ok(snapshot.candidateRules.includes("语气正式"));
  assert.ok(snapshot.forbiddenRules.includes("张三"));
  assert.deepEqual(snapshot.expressions, ["请按要求落实。"]);
  assert.equal(snapshot.testResult.passed, false);
  assert.equal(snapshot.testResult.issueCount, 2);
  assert.equal(snapshot.testResult.saveAllowed, false);
});

test("buildSkillVersionDiff reports added and removed rule groups", () => {
  const previous = {
    skillJson: JSON.stringify({
      style_rules: { must: ["标题必须清晰"], recommended: ["语气正式"] },
      forbidden: ["不得宣传化"],
      common_expression_library: ["请各部门落实。"],
    }),
    aggregationData: { candidate_rules: [{ rule: "正文先交代背景" }] },
    testReport: JSON.stringify({ overall_result: { passed: true, score: 88, save_allowed: true } }),
  };
  const current = {
    skillJson: JSON.stringify({
      style_rules: { must: ["标题必须清晰", "结尾明确责任"], recommended: ["语气正式"] },
      forbidden: ["不得使用高度重视"],
      common_expression_library: ["请各部门落实。", "请于规定时间前完成。"],
    }),
    aggregationData: { candidate_rules: [{ rule: "使用分条结构" }] },
    testReport: JSON.stringify({ overall_result: { passed: false, score: 74, privacy_leak_count: 1, save_allowed: false } }),
  };

  const diff = buildSkillVersionDiff(current, previous);

  assert.match(diff.text, /\+ 结尾明确责任/);
  assert.match(diff.text, /- 正文先交代背景/);
  assert.match(diff.text, /\+ 使用分条结构/);
  assert.match(diff.text, /- 不得宣传化/);
  assert.match(diff.text, /\+ 不得使用高度重视/);
  assert.match(diff.text, /\+ 请于规定时间前完成。/);
  assert.match(diff.text, /上一版：通过，分数 88 -> 当前：未通过，分数 74，禁止正式保存/);
});

test("buildSkillVersionDiff handles missing previous version as a snapshot", () => {
  const diff = buildSkillVersionDiff({
    skillJson: JSON.stringify({ style_rules: { must: ["保留事实准确"] } }),
  });

  assert.equal(diff.text, "");
  assert.equal(diff.sections.some((section) => section.title === "当前强规则"), true);
});
