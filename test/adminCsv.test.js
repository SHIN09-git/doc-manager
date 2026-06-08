import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, collectColumns, csvCell, neutralizeCsvFormula } from "../src/admin/adminCsv.js";

test("neutralizeCsvFormula prefixes spreadsheet formulas", () => {
  assert.equal(neutralizeCsvFormula("=1+1"), "'=1+1");
  assert.equal(neutralizeCsvFormula("+cmd"), "'+cmd");
  assert.equal(neutralizeCsvFormula("-10"), "'-10");
  assert.equal(neutralizeCsvFormula("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(neutralizeCsvFormula(" \t=HYPERLINK(\"https://example.com\")"), "' \t=HYPERLINK(\"https://example.com\")");
  assert.equal(neutralizeCsvFormula("plain text"), "plain text");
});

test("csvCell quotes values, escapes quotes, and keeps formulas as text", () => {
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell("hello, world"), '"hello, world"');
  assert.equal(csvCell({ note: "+danger" }), '"{""note"":""+danger""}"');
});

test("collectColumns preserves first-seen column order", () => {
  assert.deepEqual(collectColumns([{ action: "a", count: 1 }, { count: 2, metadata: {} }]), [
    "action",
    "count",
    "metadata",
  ]);
});

test("buildCsv protects headers and admin export rows", () => {
  const csv = buildCsv([
    { action: "=cmd", metadata: { note: "+danger" } },
    { action: "normal", metadata: "plain" },
  ]);

  assert.equal(csv.split("\n")[0], '"action","metadata"');
  assert.match(csv, /"'\=cmd"/);
  assert.match(csv, /"{""note"":""\+danger""}"/);
  assert.match(csv, /"normal","plain"/);
});
