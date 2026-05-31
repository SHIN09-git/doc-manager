const SENSITIVE_KEY_RE = /(api[-_]?key|secret|token|password|authorization|credential|private[_-]?key|手机号|身份证|邮箱|电话|密钥|令牌|密码)/i;
const DEFAULT_IGNORED_KEYS = new Set([
  "id",
  "createdat",
  "updatedat",
  "addedat",
  "exportedat",
  "lastbuildat",
  "created_at",
  "updated_at",
  "added_at",
  "exported_at",
]);

const TEXT_PATTERNS = [
  { label: "手机号", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g, mask: maskPhone },
  { label: "邮箱", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, mask: maskEmail },
  { label: "身份证号", pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g, mask: maskIdCard },
  { label: "疑似密钥", pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|re_[A-Za-z0-9_-]{16,})\b/g, mask: maskSecret },
  { label: "具体日期", pattern: /(?:19|20)\d{2}[年\/.-]\d{1,2}[月\/.-]\d{1,2}(?:日)?|\d{1,2}月\d{1,2}日/g, mask: maskPlain },
  { label: "疑似地址/地点", pattern: /[\u4e00-\u9fa5A-Za-z0-9]{2,}(?:省|市|区|县|镇|街道|路|号楼|校区|会议室|办公室)[\u4e00-\u9fa5A-Za-z0-9-]{0,20}/g, mask: maskPlain },
];

export function scanPrivacyRisksInText(text, options = {}) {
  const source = String(text || "");
  const path = options.path || "text";
  const maxFindings = Number(options.maxFindings || 24);
  const findings = [];
  if (!source) return findings;
  for (const { label, pattern, mask } of TEXT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) && findings.length < maxFindings) {
      findings.push({
        label,
        path,
        sample: mask(match[0]),
      });
    }
    if (findings.length >= maxFindings) break;
  }
  return findings;
}

export function scanPrivacyRisksInObject(value, options = {}) {
  const findings = [];
  const maxFindings = Number(options.maxFindings || 24);
  const ignoredKeys = new Set([
    ...DEFAULT_IGNORED_KEYS,
    ...(options.ignoredKeys || []).map((key) => String(key).toLowerCase()),
  ]);
  scanNode(value, {
    path: options.path || "data",
    findings,
    maxFindings,
    ignoredKeys,
  });
  return findings;
}

export function formatPrivacyRiskSummary(findings = [], limit = 8) {
  const items = findings.slice(0, limit);
  const lines = items.map((finding) =>
    `- ${finding.label}：${finding.path}${finding.sample ? `（${finding.sample}）` : ""}`,
  );
  if (findings.length > limit) lines.push(`- 另有 ${findings.length - limit} 项未展示`);
  return lines.join("\n");
}

function scanNode(value, context) {
  if (context.findings.length >= context.maxFindings) return;
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((item, index) => scanNode(item, { ...context, path: `${context.path}[${index}]` }));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).slice(0, 180).forEach(([key, item]) => {
      if (context.findings.length >= context.maxFindings) return;
      const normalizedKey = String(key).toLowerCase();
      if (context.ignoredKeys.has(normalizedKey)) return;
      const childPath = `${context.path}.${key}`;
      if (SENSITIVE_KEY_RE.test(key)) {
        context.findings.push({ label: "敏感字段名", path: childPath, sample: "" });
      }
      scanNode(item, { ...context, path: childPath });
    });
    return;
  }
  if (typeof value === "string") {
    const remaining = context.maxFindings - context.findings.length;
    context.findings.push(...scanPrivacyRisksInText(value, { path: context.path, maxFindings: remaining }));
  }
}

function maskPhone(value) {
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function maskEmail(value) {
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}***@${domain || "***"}`;
}

function maskIdCard(value) {
  return `${value.slice(0, 6)}********${value.slice(-2)}`;
}

function maskSecret(value) {
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function maskPlain(value) {
  return value.length > 24 ? `${value.slice(0, 24)}...` : value;
}
