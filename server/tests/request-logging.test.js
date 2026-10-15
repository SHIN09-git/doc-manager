import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeRequestUrl } from "../src/utils/requestLogging.js";

test("request logging redacts sensitive query parameters", () => {
  const value = sanitizeRequestUrl("/api/webhooks/email?token=secret-token&status=delivered&email=user%40example.com");

  assert.equal(value, "/api/webhooks/email?token=%5Bredacted%5D&status=delivered&email=%5Bredacted%5D");
  assert.doesNotMatch(value, /secret-token|user%40example/);
});

test("request logging preserves operational filters and drops malformed query text", () => {
  assert.equal(sanitizeRequestUrl("/api/usage/history?status=failed&limit=20"), "/api/usage/history?status=failed&limit=20");
  assert.equal(sanitizeRequestUrl("http://[invalid?token=secret"), "http://[invalid");
});
