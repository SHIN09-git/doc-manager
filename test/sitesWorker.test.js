import test from "node:test";
import assert from "node:assert/strict";
import worker from "../sites/worker.js";

test("Sites worker serves static assets with baseline security headers", async () => {
  const response = await worker.fetch(new Request("https://workbench.example/index.html"), {
    ASSETS: {
      fetch: async () => new Response("workbench", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "workbench");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
});

test("Sites worker falls back to the workbench shell for route-like requests", async () => {
  const requestedPaths = [];
  const response = await worker.fetch(new Request("https://workbench.example/cloud", {
    headers: { accept: "text/html" },
  }), {
    ASSETS: {
      fetch: async (request) => {
        requestedPaths.push(new URL(request.url).pathname);
        return requestedPaths.length === 1
          ? new Response("missing", { status: 404 })
          : new Response("shell", { status: 200 });
      },
    },
  });

  assert.deepEqual(requestedPaths, ["/cloud", "/index.html"]);
  assert.equal(await response.text(), "shell");
});

test("Sites worker reports unavailable cloud APIs without a configured backend", async () => {
  const response = await worker.fetch(new Request("https://workbench.example/api/me"), {});
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "CLOUD_API_NOT_CONFIGURED");
  assert.match(body.error.message, /本地功能仍可正常使用/);
});

test("Sites worker turns upstream network failures into a stable cloud API error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("upstream offline");
  };
  try {
    const response = await worker.fetch(new Request("https://workbench.example/api/me"), {
      API_ORIGIN: "https://api.example.com",
    });
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.error.code, "CLOUD_API_UNAVAILABLE");
    assert.match(body.error.message, /本地文档不会受影响/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
