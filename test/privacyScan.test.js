import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPrivacyRiskSummary,
  scanPrivacyRisksInObject,
  scanPrivacyRisksInText,
} from "../src/utils/privacyScan.js";

test("scanPrivacyRisksInText detects common private and case-specific items", () => {
  const findings = scanPrivacyRisksInText(
    "联系人张老师，手机号13800138000，邮箱teacher@example.com，身份证110101199003074219，2026年5月31日在北京市海淀区中关村路会议室开会。",
    { path: "sample.txt" },
  );
  const labels = findings.map((item) => item.label);

  assert.ok(labels.includes("手机号"));
  assert.ok(labels.includes("邮箱"));
  assert.ok(labels.includes("身份证号"));
  assert.ok(labels.includes("具体日期"));
  assert.ok(labels.includes("疑似地址/地点"));
});

test("scanPrivacyRisksInObject ignores metadata dates but catches sensitive keys and nested text", () => {
  const findings = scanPrivacyRisksInObject({
    exportedAt: "2026-05-31T00:00:00.000Z",
    skill: {
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz",
      sourceDocuments: [{ name: "sample.docx", text: "联系电话13900139000" }],
    },
  }, { path: "package" });

  assert.equal(findings.some((item) => item.path.includes("exportedAt")), false);
  assert.equal(findings.some((item) => item.label === "敏感字段名" && item.path.includes("apiKey")), true);
  assert.equal(findings.some((item) => item.label === "疑似密钥"), true);
  assert.equal(findings.some((item) => item.label === "手机号"), true);
});

test("formatPrivacyRiskSummary masks sensitive samples", () => {
  const findings = scanPrivacyRisksInText("电话13800138000，邮箱teacher@example.com", { path: "sample" });
  const summary = formatPrivacyRiskSummary(findings);

  assert.match(summary, /138\*\*\*\*8000/);
  assert.match(summary, /te\*\*\*@example\.com/);
  assert.equal(summary.includes("13800138000"), false);
  assert.equal(summary.includes("teacher@example.com"), false);
});
