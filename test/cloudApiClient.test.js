import assert from "node:assert/strict";
import test from "node:test";
import {
  createCloudApiClient,
  getDefaultCloudApiBaseUrl,
  isLocalDevelopmentHost,
  normalizeCloudBaseUrl,
  parseCloudJsonSafely,
  shouldReplaceLocalApiBaseUrl,
} from "../src/modules/cloud/cloudApiClient.js";

function locationLike(url) {
  return new URL(url);
}

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status || 200,
    statusText: options.statusText || "OK",
    text: async () => body,
  };
}

test("cloud base url helpers handle local, file, and deployed locations", () => {
  assert.equal(isLocalDevelopmentHost("localhost"), true);
  assert.equal(isLocalDevelopmentHost("127.0.0.1"), true);
  assert.equal(isLocalDevelopmentHost("example.com"), false);
  assert.equal(getDefaultCloudApiBaseUrl(locationLike("file:///G:/cc/index.html")), "http://127.0.0.1:8787/api");
  assert.equal(getDefaultCloudApiBaseUrl(locationLike("http://localhost:4173/index.html")), "http://127.0.0.1:8787/api");
  assert.equal(getDefaultCloudApiBaseUrl(locationLike("https://mowen.example/workbench")), "https://mowen.example/api");
});

test("normalizeCloudBaseUrl trims slashes and upgrades stale local defaults on deployed sites", () => {
  assert.equal(
    shouldReplaceLocalApiBaseUrl("http://localhost:8787/api", {
      defaultCloudApiBaseUrl: "https://mowen.example/api",
    }),
    true,
  );
  assert.equal(
    normalizeCloudBaseUrl(" http://localhost:8787/api/// ", {
      defaultCloudApiBaseUrl: "https://mowen.example/api",
    }),
    "https://mowen.example/api",
  );
  assert.equal(
    normalizeCloudBaseUrl(" https://api.example.com/root/// ", {
      defaultCloudApiBaseUrl: "https://mowen.example/api",
    }),
    "https://api.example.com/root",
  );
});

test("parseCloudJsonSafely falls back on invalid response bodies", () => {
  assert.deepEqual(parseCloudJsonSafely("{\"ok\":true}"), { ok: true });
  assert.deepEqual(parseCloudJsonSafely("not json", { ok: false }), { ok: false });
});

test("cloud api client sends organization header and parses successful responses", async () => {
  const requests = [];
  const client = createCloudApiClient({
    state: { cloud: { apiBaseUrl: "https://api.example.com/api/", activeOrganization: { id: "org-1" } } },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response("{\"ok\":true}");
    },
    defaultCloudApiBaseUrl: "https://fallback.example/api",
  });

  const data = await client.request("/me", { method: "GET", headers: { "x-extra": "yes" } });

  assert.deepEqual(data, { ok: true });
  assert.equal(requests[0].url, "https://api.example.com/api/me");
  assert.equal(requests[0].options.credentials, "include");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(requests[0].options.headers["x-extra"], "yes");
  assert.equal(requests[0].options.headers["x-organization-id"], "org-1");
});

test("cloud api client surfaces server errors with status and payload", async () => {
  const client = createCloudApiClient({
    state: { cloud: { apiBaseUrl: "https://api.example.com/api" } },
    fetchImpl: async () => response("{\"error\":{\"message\":\"需要登录\"}}", { ok: false, status: 401, statusText: "Unauthorized" }),
    defaultCloudApiBaseUrl: "https://fallback.example/api",
  });

  await assert.rejects(
    () => client.request("/documents"),
    (error) => {
      assert.equal(error.message, "需要登录");
      assert.equal(error.status, 401);
      assert.deepEqual(error.payload, { error: { message: "需要登录" } });
      return true;
    },
  );
});

test("cloud api client reports network failures with the normalized base url", async () => {
  const client = createCloudApiClient({
    state: { cloud: { apiBaseUrl: "https://api.example.com/api/" } },
    fetchImpl: async () => {
      throw new Error("network down");
    },
    defaultCloudApiBaseUrl: "https://fallback.example/api",
  });

  await assert.rejects(
    () => client.request("/me"),
    /无法连接云端 API：https:\/\/api.example.com\/api/,
  );
});
