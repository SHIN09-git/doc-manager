import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCssColor, sanitizeUrl } from "../src/utils/helpers.js";

test("sanitizeCssColor keeps safe colors and rejects attribute-breaking values", () => {
  assert.equal(sanitizeCssColor("#0f766e"), "#0f766e");
  assert.equal(sanitizeCssColor("rgb(15, 118, 110)"), "rgb(15, 118, 110)");
  assert.equal(sanitizeCssColor("rebeccapurple"), "rebeccapurple");
  assert.equal(sanitizeCssColor('red";background:url(javascript:alert(1))'), "#2d3234");
  assert.equal(sanitizeCssColor("var(--unsafe-token)"), "#2d3234");
});

test("sanitizeUrl allows web and relative urls while rejecting unsafe protocols", () => {
  assert.equal(sanitizeUrl("https://example.com/qr.png"), "https://example.com/qr.png");
  assert.equal(sanitizeUrl("http://127.0.0.1:4173/assets/qr.png"), "http://127.0.0.1:4173/assets/qr.png");
  assert.equal(sanitizeUrl("/assets/qr.png"), "/assets/qr.png");
  assert.equal(sanitizeUrl("assets/qr.png"), "assets/qr.png");
  assert.equal(sanitizeUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(sanitizeUrl("https://example.com/\u0000bad"), "");
});
