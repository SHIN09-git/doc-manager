import assert from "node:assert/strict";
import test from "node:test";
import { clearSessionCookie, createSessionCookie } from "../src/utils/http.js";

test("session cookies default to Lax and support explicit cross-site cookies", () => {
  const defaultCookie = createSessionCookie("session", "token");
  assert.match(defaultCookie, /SameSite=Lax/);
  assert.doesNotMatch(defaultCookie, /Secure/);

  const crossSiteCookie = createSessionCookie("session", "token", { sameSite: "None", secure: true });
  assert.match(crossSiteCookie, /SameSite=None/);
  assert.match(crossSiteCookie, /Secure/);
  assert.match(clearSessionCookie("session", { sameSite: "Strict" }), /SameSite=Strict/);
});
