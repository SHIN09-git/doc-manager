const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return proxyApiRequest(request, env, url);
    }
    return serveStaticRequest(request, env, url);
  },
};

async function proxyApiRequest(request, env, url) {
  const apiOrigin = normalizeApiOrigin(env.API_ORIGIN);
  if (!apiOrigin) {
    return Response.json({
      error: {
        code: "CLOUD_API_NOT_CONFIGURED",
        message: "当前网站尚未接入云端服务，文档编辑与本地功能仍可正常使用。",
      },
    }, { status: 503, headers: JSON_HEADERS });
  }

  const upstreamUrl = new URL(`${url.pathname}${url.search}`, `${apiOrigin}/`);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  try {
    return await fetch(new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    }));
  } catch {
    return Response.json({
      error: {
        code: "CLOUD_API_UNAVAILABLE",
        message: "云端服务暂时无法连接，请稍后重试。本地文档不会受影响。",
      },
    }, { status: 502, headers: JSON_HEADERS });
  }
}

async function serveStaticRequest(request, env, url) {
  if (!env.ASSETS?.fetch) {
    return new Response("Static asset binding is unavailable.", { status: 500 });
  }

  let response = await env.ASSETS.fetch(request);
  if (response.status === 404 && shouldServeWorkbenchShell(request, url)) {
    const shellUrl = new URL("/index.html", url);
    response = await env.ASSETS.fetch(new Request(shellUrl, request));
  }
  return withSecurityHeaders(response);
}

function shouldServeWorkbenchShell(request, url) {
  if (request.method !== "GET") return false;
  if (url.pathname.includes(".")) return false;
  return String(request.headers.get("accept") || "").includes("text/html");
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "SAMEORIGIN");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeApiOrigin(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}
