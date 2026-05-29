const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787/api";
const TIMEOUT_MS = 10000;

function endpointUrl(baseUrl, endpoint) {
  const url = new URL(baseUrl || DEFAULT_API_BASE_URL);
  const cleanPath = url.pathname.replace(/\/+$/, "");
  const apiPath = cleanPath.endsWith("/api") ? cleanPath : `${cleanPath}/api`;
  url.pathname = `${apiPath}/${endpoint}`.replace(/\/+/g, "/");
  return url;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const baseUrl = process.argv[2] || process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
  const endpoints = ["health", "ready"];
  const results = [];
  for (const endpoint of endpoints) {
    const url = endpointUrl(baseUrl, endpoint);
    try {
      const result = await fetchJson(url);
      results.push({ endpoint, url: url.href, ...result });
    } catch (error) {
      results.push({ endpoint, url: url.href, ok: false, status: 0, body: { error: error.message || String(error) } });
    }
  }

  results.forEach((result) => {
    const mark = result.ok ? "OK" : "FAIL";
    console.log(`[${mark}] ${result.endpoint}: ${result.url} -> ${result.status}`);
    if (!result.ok) console.log(JSON.stringify(result.body, null, 2));
  });

  if (results.some((result) => !result.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
