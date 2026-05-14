import assert from "node:assert/strict";
import test from "node:test";
import {
  extractJsonObject,
  formatAggregationMarkdown,
  formatListItems,
  parseLooseJson,
  stripCodeFence,
} from "../src/utils/formatters.js";

test("stripCodeFence removes markdown fences", () => {
  assert.equal(stripCodeFence("```json\n{\"ok\":true}\n```"), "{\"ok\":true}");
});

test("parseLooseJson tolerates fenced JSON and trailing commas", () => {
  const parsed = parseLooseJson("```json\n{\"items\":[1,2,],}\n```");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, { items: [1, 2] });
});

test("extractJsonObject returns the object portion from mixed text", () => {
  assert.equal(extractJsonObject("说明 {\"a\":1} 结束"), "{\"a\":1}");
});

test("format helpers keep empty lists explicit", () => {
  assert.equal(formatListItems([]), "- 暂无");
  assert.match(
    formatAggregationMarkdown({
      document_count: 2,
      overall_confidence: "medium",
      strong_rules: [{ rule: "标题居中", evidence_count: 2 }],
    }),
    /标题居中/,
  );
});
