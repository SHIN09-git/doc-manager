const SENSITIVE_QUERY_KEY = /(token|secret|password|api[_-]?key|authorization|cookie|signature|credential|email|proof|note|prompt|search|query|\bq\b)/i;

export function sanitizeRequestUrl(value) {
  const raw = String(value || "/");
  try {
    const url = new URL(raw, "http://local.invalid");
    const sensitiveKeys = Array.from(new Set(Array.from(url.searchParams.keys()).filter((key) => SENSITIVE_QUERY_KEY.test(key))));
    sensitiveKeys.forEach((key) => url.searchParams.set(key, "[redacted]"));
    return `${url.pathname}${url.search}`;
  } catch {
    return raw.split("?", 1)[0] || "/";
  }
}
