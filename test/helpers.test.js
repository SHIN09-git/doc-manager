import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCssColor } from "../src/utils/helpers.js";

test("sanitizeCssColor keeps safe colors and rejects attribute-breaking values", () => {
  assert.equal(sanitizeCssColor("#0f766e"), "#0f766e");
  assert.equal(sanitizeCssColor("rgb(15, 118, 110)"), "rgb(15, 118, 110)");
  assert.equal(sanitizeCssColor("rebeccapurple"), "rebeccapurple");
  assert.equal(sanitizeCssColor('red";background:url(javascript:alert(1))'), "#2d3234");
  assert.equal(sanitizeCssColor("var(--unsafe-token)"), "#2d3234");
});
