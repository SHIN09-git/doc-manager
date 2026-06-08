export function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function now() {
  return new Date().toISOString();
}

export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function formatLocalDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function describeLengthChange(delta) {
  if (delta === 0) return "无变化";
  return delta > 0 ? `增加 ${delta} 字` : `减少 ${Math.abs(delta)} 字`;
}

export function sanitizeFileName(name) {
  return String(name || "未命名文档").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

export function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, "")
    .slice(0, 24);
}

export function normalizeEndpointPath(value) {
  const path = String(value || "/chat/completions").trim() || "/chat/completions";
  return path.startsWith("/") ? path : `/${path}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeCssColor(value, fallback = "#2d3234") {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(color)) {
    return color;
  }
  if (/^hsla?\(\s*[\d.]+(?:deg|rad|turn)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(color)) {
    return color;
  }
  if (/^[a-zA-Z]+$/.test(color)) return color;
  return fallback;
}

export function stableTextHash(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
