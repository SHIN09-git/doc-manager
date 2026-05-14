import { coerceArray } from "./validation.js";

export function stripCodeFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractJsonValue(text) {
  const raw = stripCodeFence(text);
  const objectStart = raw.indexOf("{");
  const arrayStart = raw.indexOf("[");
  const candidates = [
    { start: objectStart, end: raw.lastIndexOf("}") },
    { start: arrayStart, end: raw.lastIndexOf("]") },
  ].filter((item) => item.start >= 0 && item.end > item.start);
  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.start - b.start);
  return raw.slice(candidates[0].start, candidates[0].end + 1);
}

export function extractJsonObject(text) {
  const raw = stripCodeFence(text);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "";
  return raw.slice(start, end + 1);
}

export function parseLooseJson(value) {
  const raw = stripCodeFence(value);
  const json = extractJsonValue(raw) || raw;
  const attempts = [
    json,
    json.replace(/,\s*([}\]])/g, "$1"),
    json
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, "$1"),
  ];
  for (const attempt of attempts) {
    try {
      return { ok: true, value: JSON.parse(attempt) };
    } catch {
      // Try the next tolerant parse form.
    }
  }
  return { ok: false, value: null };
}

export function formatPossiblyJson(value) {
  const raw = stripCodeFence(value);
  const jsonValue = extractJsonValue(raw);
  if (!jsonValue) return raw;
  try {
    return JSON.stringify(JSON.parse(jsonValue), null, 2);
  } catch {
    return raw;
  }
}

export function formatListItems(items) {
  const values = coerceArray(items).map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  return values.length ? values.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

export function formatAggregationMarkdown(data) {
  const section = (title, items) => `## ${title}\n${formatListItems(items)}`;
  return [
    `# 多篇文档聚合`,
    `样本数量：${data.document_count || 0}`,
    `整体置信度：${data.overall_confidence || "low"}`,
    section("共同结构", data.common_structure),
    section("共同文风", data.common_style),
    section("格式规范", data.common_format),
    section("常用表达", data.common_expressions),
    section("强规则", (data.strong_rules || []).map((rule) => `${rule.rule}（证据 ${rule.evidence_count} 篇）`)),
    section("候选规则", (data.candidate_rules || []).map((rule) => `${rule.rule}（候选，证据 ${rule.evidence_count || 1} 篇）`)),
    section("冲突规则提示", (data.conflicts || []).map((item) => item.topic || JSON.stringify(item))),
    section("个案规则排除", data.case_specific_exclusions),
    section("隐私信息过滤", data.privacy_findings),
    section("人工校准建议", data.recommended_calibration),
  ].join("\n\n");
}
