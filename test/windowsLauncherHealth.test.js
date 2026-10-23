import assert from "node:assert/strict";
import test from "node:test";

import { isWorkbenchApiHealthPayload } from "../scripts/windows-installer/launcher-health.mjs";

test("Windows launcher recognizes the current commercial API health payload", () => {
  assert.equal(isWorkbenchApiHealthPayload({
    ok: true,
    service: "mowen-commercial-api",
    time: "2026-07-17T00:00:00.000Z",
  }), true);
});

test("Windows launcher keeps compatibility with the previous health payload", () => {
  assert.equal(isWorkbenchApiHealthPayload({ status: "ok", database: "json" }), true);
});

test("Windows launcher does not reuse an unrelated process on the API port", () => {
  assert.equal(isWorkbenchApiHealthPayload({ ok: true, service: "other-service" }), false);
  assert.equal(isWorkbenchApiHealthPayload(null), false);
});
