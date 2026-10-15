import assert from "node:assert/strict";
import test from "node:test";
import { probeService, waitForService } from "../scripts/start-local.mjs";

test("local launcher validates healthy services without starting duplicates", async () => {
  const fetchImpl = async () => ({ ok: true, headers: { get: () => "application/json" } });
  assert.equal(await probeService("http://local.test/health", { fetchImpl }), true);
  assert.equal(await probeService("http://local.test/health", {
    fetchImpl,
    validate: (response) => response.headers.get("content-type") === "application/json",
  }), true);
});

test("local launcher reports unavailable and times out predictably", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };
  assert.equal(await probeService("http://local.test", { fetchImpl }), false);
  await assert.rejects(
    waitForService("http://local.test", { fetchImpl, timeoutMs: 10, intervalMs: 1 }),
    /服务启动超时/,
  );
});
