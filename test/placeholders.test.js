import assert from "node:assert/strict";
import test from "node:test";
import {
  findAdjacentPlaceholder,
  findPlaceholders,
  groupPlaceholders,
  replacePlaceholder,
} from "../src/utils/placeholders.js";

const SAMPLE = "请于【培训时间】在【培训地点】报到。\n联系人：【联系人】，培训时间以【培训时间】为准。";

test("findPlaceholders returns every bracketed placeholder with its position", () => {
  const matches = findPlaceholders(SAMPLE);
  assert.deepEqual(matches.map((item) => item.text), ["【培训时间】", "【培训地点】", "【联系人】", "【培训时间】"]);
  assert.equal(SAMPLE.slice(matches[1].start, matches[1].end), "【培训地点】");
});

test("findPlaceholders ignores empty, multi-line and overlong brackets", () => {
  assert.deepEqual(findPlaceholders("【】【第一行\n第二行】"), []);
  assert.deepEqual(findPlaceholders(`【${"长".repeat(41)}】`), []);
});

test("groupPlaceholders keeps first-seen order and counts repeats", () => {
  assert.deepEqual(
    groupPlaceholders(findPlaceholders(SAMPLE)).map(({ text, count }) => [text, count]),
    [["【培训时间】", 2], ["【培训地点】", 1], ["【联系人】", 1]],
  );
});

test("findAdjacentPlaceholder moves forward and backward with wrap-around", () => {
  const matches = findPlaceholders(SAMPLE);
  assert.equal(findAdjacentPlaceholder(matches, 0, 1).start, matches[0].start);
  assert.equal(findAdjacentPlaceholder(matches, matches[0].end, 1).start, matches[1].start);
  assert.equal(findAdjacentPlaceholder(matches, SAMPLE.length, 1).start, matches[0].start);
  assert.equal(findAdjacentPlaceholder(matches, matches[1].start, -1).start, matches[0].start);
  assert.equal(findAdjacentPlaceholder(matches, 0, -1).start, matches[3].start);
  assert.equal(findAdjacentPlaceholder([], 0, 1), null);
});

test("replacePlaceholder fills every occurrence of the same placeholder", () => {
  const result = replacePlaceholder(SAMPLE, "【培训时间】", "5 月 20 日上午");
  assert.equal(result.count, 2);
  assert.doesNotMatch(result.text, /【培训时间】/);
  assert.match(result.text, /【培训地点】/);
});
