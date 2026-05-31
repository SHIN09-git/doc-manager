export class HttpError extends Error {
  constructor(status, message, code = "error", details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function readJsonBody(request, limitBytes) {
  const text = await readRawBody(request, limitBytes);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "请求 JSON 格式不正确", "invalid_json");
  }
}

export async function readRawBody(request, limitBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, "请求体过大", "payload_too_large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return "";
  return Buffer.concat(chunks).toString("utf8");
}

export function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json;charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

export function sendNoContent(response) {
  response.writeHead(204);
  response.end();
}

export function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of String(header).split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    cookies.set(key, safeDecodeCookieValue(rest.join("=") || ""));
  }
  return cookies;
}

function safeDecodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function createSessionCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(options.maxAgeSeconds || 60 * 60 * 24 * 14)}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(name, options = {}) {
  return createSessionCookie(name, "", { ...options, maxAgeSeconds: 0 });
}

export function setSecurityHeaders(response, env, request = null) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const requestOrigin = normalizeOrigin(request?.headers?.origin || "");
  const allowedOrigin = requestOrigin && isTrustedOrigin(env, requestOrigin)
    ? requestOrigin
    : getDefaultTrustedOrigin(env);
  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}

export function isTrustedOrigin(env, value) {
  const origin = normalizeOrigin(value);
  return Boolean(origin && getTrustedOrigins(env).has(origin));
}

export function normalizeOrigin(value) {
  try {
    return new URL(String(value || "").trim()).origin;
  } catch {
    return "";
  }
}

function getDefaultTrustedOrigin(env) {
  const origins = Array.from(getTrustedOrigins(env));
  return origins[0] || "";
}

function getTrustedOrigins(env) {
  const origins = new Set([
    normalizeOrigin(env?.corsOrigin),
    normalizeOrigin(env?.appUrl),
  ].filter(Boolean));
  if (env?.nodeEnv !== "production") {
    origins.add("http://127.0.0.1:4173");
    origins.add("http://localhost:4173");
  }
  return origins;
}
