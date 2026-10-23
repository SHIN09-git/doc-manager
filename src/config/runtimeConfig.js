export function getRuntimeApiBaseUrl(config = globalThis.__MOWEN_RUNTIME_CONFIG__) {
  const candidate = String(config?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    const localHttp = url.protocol === "http:" && isLocalHost(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return candidate;
  } catch {
    return "";
  }
}

function isLocalHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(hostname || "").toLowerCase());
}
