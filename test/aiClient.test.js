import assert from "node:assert/strict";
import test from "node:test";
import { createAiClient, friendlyAiErrorMessage } from "../src/modules/ai/aiClient.js";

test("friendlyAiErrorMessage maps common API failures", () => {
  assert.match(friendlyAiErrorMessage(Object.assign(new Error("401"), { status: 401 })), /API Key/);
  assert.match(friendlyAiErrorMessage(Object.assign(new Error("429"), { status: 429 })), /频繁|额度/);
  assert.match(friendlyAiErrorMessage(Object.assign(new Error("timeout"), { code: "timeout" })), /超时/);
});

test("callAiWithRetry retries retryable network failures", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  let calls = 0;
  const notices = [];
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("Failed to fetch");
    }
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: "连接正常" } }] }),
    };
  };

  try {
    const client = createAiClient({
      getSettings: () => ({
        baseUrl: "http://localhost:8787/v1",
        endpointPath: "/chat/completions",
        model: "test-model",
      }),
      notify: (message) => notices.push(message),
    });
    const result = await client.callAiWithRetry([{ role: "user", content: "ping" }], {}, 2);
    assert.equal(result, "连接正常");
    assert.equal(calls, 2);
    assert.equal(notices.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("callAiJsonWithRepair repairs invalid JSON output", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const content = calls === 1 ? "不是 JSON" : "{\"ok\":true}";
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };

  try {
    const client = createAiClient({
      getSettings: () => ({
        baseUrl: "http://localhost:8787/v1",
        endpointPath: "/chat/completions",
        model: "test-model",
      }),
    });
    const result = await client.callAiJsonWithRepair([{ role: "user", content: "json" }], "测试 JSON");
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("callAiWithRetry aborts without retrying when external signal is cancelled", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  try {
    const controller = new AbortController();
    const client = createAiClient({
      getSettings: () => ({
        baseUrl: "http://localhost:8787/v1",
        endpointPath: "/chat/completions",
        model: "test-model",
      }),
    });
    const request = client.callAiWithRetry([{ role: "user", content: "ping" }], { signal: controller.signal }, 3);
    await Promise.resolve();
    controller.abort();
    await assert.rejects(request, /取消/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
