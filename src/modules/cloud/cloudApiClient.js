export const LOCAL_CLOUD_API_BASE_URL = "http://127.0.0.1:8787/api";

export function isLocalDevelopmentHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(hostname || "").toLowerCase());
}

export function getDefaultCloudApiBaseUrl(location = globalThis.window?.location) {
  if (!location || !["http:", "https:"].includes(location.protocol)) {
    return LOCAL_CLOUD_API_BASE_URL;
  }
  if (isLocalDevelopmentHost(location.hostname)) {
    return LOCAL_CLOUD_API_BASE_URL;
  }
  return `${location.origin}/api`;
}

export function shouldReplaceLocalApiBaseUrl(value, options = {}) {
  const defaultCloudApiBaseUrl = options.defaultCloudApiBaseUrl || getDefaultCloudApiBaseUrl();
  const localCloudApiBaseUrl = options.localCloudApiBaseUrl || LOCAL_CLOUD_API_BASE_URL;
  if (defaultCloudApiBaseUrl === localCloudApiBaseUrl) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):8787\/api\/*$/i.test(String(value || "").trim());
}

export function normalizeCloudBaseUrl(value, options = {}) {
  const defaultCloudApiBaseUrl = options.defaultCloudApiBaseUrl || getDefaultCloudApiBaseUrl();
  const raw = String(value || "").trim();
  if (shouldReplaceLocalApiBaseUrl(raw, options)) return defaultCloudApiBaseUrl;
  return (raw || defaultCloudApiBaseUrl).replace(/\/+$/, "") || defaultCloudApiBaseUrl;
}

export function parseCloudJsonSafely(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function createCloudApiClient(deps = {}) {
  const {
    state = {},
    els = {},
    defaultCloudApiBaseUrl = getDefaultCloudApiBaseUrl(),
    fetchImpl = globalThis.fetch?.bind(globalThis),
  } = deps;

  function normalizeBaseUrl(value) {
    return normalizeCloudBaseUrl(value, { defaultCloudApiBaseUrl });
  }

  async function request(path, options = {}) {
    const baseUrl = normalizeBaseUrl(state.cloud?.apiBaseUrl || els.cloudBaseUrlInput?.value);
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const orgId = state.cloud?.activeOrganization?.id;
    if (orgId) headers["x-organization-id"] = orgId;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } catch {
      throw new Error(`无法连接云端 API：${baseUrl}。请确认后端服务已启动，或检查云端 API 地址。`);
    }
    const text = await response.text();
    const data = text ? parseCloudJsonSafely(text) : {};
    if (!response.ok) {
      const message = data?.error?.message || data?.message || text || response.statusText;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      error.code = data?.error?.code || "";
      error.details = data?.error?.details || null;
      throw error;
    }
    return data;
  }

  return {
    normalizeBaseUrl,
    request,
  };
}
