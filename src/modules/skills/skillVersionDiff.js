import { extractJsonObject } from "../../utils/formatters.js";
import { coerceArray } from "../../utils/validation.js";

export function buildSkillVersionDiff(current = {}, previous = null) {
  const currentSnapshot = createVersionSnapshot(current);
  const previousSnapshot = previous ? createVersionSnapshot(previous) : null;
  if (!previousSnapshot) {
    return {
      sections: [
        listSection("当前强规则", currentSnapshot.mustRules, { empty: "暂无强规则" }),
        listSection("当前候选规则", currentSnapshot.candidateRules, { empty: "暂无候选规则" }),
        listSection("当前禁止事项", currentSnapshot.forbiddenRules, { empty: "暂无禁止事项" }),
        listSection("当前常用表达", currentSnapshot.expressions, { empty: "暂无常用表达" }),
        testSection(currentSnapshot.testResult, null),
      ].filter(Boolean),
      text: "",
    };
  }

  const sections = [
    diffSection("强规则变化", diffLists(previousSnapshot.mustRules, currentSnapshot.mustRules)),
    diffSection("候选规则变化", diffLists(previousSnapshot.candidateRules, currentSnapshot.candidateRules)),
    diffSection("禁止事项变化", diffLists(previousSnapshot.forbiddenRules, currentSnapshot.forbiddenRules)),
    diffSection("常用表达变化", diffLists(previousSnapshot.expressions, currentSnapshot.expressions)),
    testSection(currentSnapshot.testResult, previousSnapshot.testResult),
  ].filter(Boolean);

  return {
    sections,
    text: sections.map((section) => section.lines.join("\n")).join("\n\n"),
  };
}

export function createVersionSnapshot(version = {}) {
  const skillJson = parseJsonObject(version.skillJson);
  const aggregation = version.aggregationData && typeof version.aggregationData === "object"
    ? version.aggregationData
    : parseJsonObject(version.aggregation);
  return {
    mustRules: normalizeTextList(skillJson.style_rules?.must),
    candidateRules: uniqueTextList([
      ...normalizeRuleList(aggregation.candidate_rules),
      ...normalizeTextList(skillJson.style_rules?.recommended),
      ...normalizeTextList(skillJson.style_rules?.optional),
    ]),
    forbiddenRules: uniqueTextList([
      ...normalizeTextList(skillJson.forbidden),
      ...normalizeTextList(skillJson.case_specific_exclusions),
      ...normalizeTextList(skillJson.privacy_filters),
    ]),
    expressions: normalizeTextList(skillJson.common_expression_library || skillJson.reusable_expressions),
    testResult: normalizeTestReport(version.testReport),
  };
}

function diffLists(before = [], after = []) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((item) => !beforeSet.has(item)),
    removed: before.filter((item) => !afterSet.has(item)),
    kept: after.filter((item) => beforeSet.has(item)),
  };
}

function diffSection(title, diff) {
  if (!diff.added.length && !diff.removed.length) {
    return { title, lines: [title, "无变化"] };
  }
  const lines = [title];
  diff.added.forEach((item) => lines.push(`+ ${item}`));
  diff.removed.forEach((item) => lines.push(`- ${item}`));
  if (diff.kept.length) lines.push(`= 保留 ${diff.kept.length} 条`);
  return { title, lines };
}

function listSection(title, items, options = {}) {
  const lines = [title];
  if (!items.length) {
    lines.push(options.empty || "暂无");
  } else {
    items.forEach((item) => lines.push(`- ${item}`));
  }
  return { title, lines };
}

function testSection(current, previous) {
  if (!current && !previous) return null;
  const lines = ["测试结果变化"];
  if (!previous) {
    lines.push(formatTestResult("当前", current));
    return { title: "测试结果变化", lines };
  }
  lines.push(`${formatTestResult("上一版", previous)} -> ${formatTestResult("当前", current)}`);
  const currentIssues = current?.issueCount || 0;
  const previousIssues = previous?.issueCount || 0;
  if (currentIssues !== previousIssues) lines.push(`问题数：${previousIssues} -> ${currentIssues}`);
  return { title: "测试结果变化", lines };
}

function formatTestResult(label, result) {
  if (!result) return `${label}：无测试记录`;
  const passed = result.passed ? "通过" : "未通过";
  const score = Number.isFinite(result.score) ? `，分数 ${result.score}` : "";
  const gate = result.saveAllowed === false ? "，禁止正式保存" : "";
  return `${label}：${passed}${score}${gate}`;
}

function normalizeTestReport(value) {
  const report = parseJsonObject(value);
  if (!Object.keys(report).length) return value ? { passed: false, score: null, issueCount: 1, saveAllowed: false } : null;
  const overall = report.overall_result || report.overall || report;
  const cases = Array.isArray(report.test_cases) ? report.test_cases : [];
  const issueCount = cases.reduce((sum, item) => sum + coerceArray(item.issues).length, 0) +
    Number(overall.must_rule_miss_count || 0) +
    Number(overall.privacy_leak_count || 0) +
    Number(overall.case_specific_leak_count || 0) +
    Number(overall.fabrication_risk_count || 0);
  return {
    passed: Boolean(overall.passed ?? report.passed),
    score: Number.isFinite(Number(overall.score)) ? Number(overall.score) : null,
    saveAllowed: overall.save_allowed !== false,
    issueCount,
  };
}

function normalizeRuleList(value) {
  return coerceArray(value).map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object") return String(item.rule || item.text || item.name || "").trim();
    return "";
  }).filter(Boolean);
}

function normalizeTextList(value) {
  return coerceArray(value).map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object") return String(item.rule || item.text || item.name || "").trim();
    return String(item || "").trim();
  }).filter(Boolean);
}

function uniqueTextList(items = []) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(extractJsonObject(raw) || raw);
  } catch {
    return {};
  }
}
