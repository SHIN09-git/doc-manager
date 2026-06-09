export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
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

export function sanitizeFileName(name, fallback = "未命名文档") {
  const normalize = (value) => String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 80)
    .replace(/[. ]+$/g, "")
    .trim();
  let safe = normalize(name);
  if (!safe) safe = normalize(fallback) || "未命名文档";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) return `${safe}_`;
  return safe;
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

export function sanitizeUrl(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text || /[\u0000-\u001F\u007F]/.test(text)) return fallback;
  try {
    const parsed = new URL(text, "https://mowen.local/");
    if (["http:", "https:"].includes(parsed.protocol)) return text;
  } catch {
    return fallback;
  }
  return fallback;
}

export async function copyTextToClipboard(text, env = {}) {
  const value = String(text ?? "");
  const nav = env.navigator || globalThis.navigator;
  const doc = env.document || globalThis.document;
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path below.
  }
  if (!doc?.createElement || !doc.body?.appendChild || !doc.execCommand) return false;
  const textarea = doc.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  doc.body.appendChild(textarea);
  textarea.select?.();
  textarea.setSelectionRange?.(0, textarea.value.length);
  try {
    return Boolean(doc.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.remove?.();
  }
}

export function stableTextHash(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
