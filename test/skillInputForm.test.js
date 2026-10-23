import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkillInputPrompt,
  collectSkillInputFields,
  findMissingRequiredFields,
  getFieldLabel,
  isFieldCoveredByPrompt,
} from "../src/modules/generation/skillInputForm.js";

const parse = (skill) => skill.skillJson;

test("collectSkillInputFields merges writers, keeps order and promotes shared fields to required", () => {
  const fields = collectSkillInputFields(
    [
      { skillJson: { input_contract: { required_fields: ["主题", { name: "对象", description: "例如：各部门负责人" }], optional_fields: ["语气"] } } },
      { skillJson: { input_contract: { required_fields: ["语气", "主要事项"] } } },
    ],
    parse,
  );
  assert.deepEqual(fields.map((field) => [field.label, field.required]), [
    ["主题", true],
    ["对象", true],
    ["语气", true],
    ["主要事项", true],
  ]);
  assert.equal(fields[1].hint, "例如：各部门负责人");
  assert.equal(fields[3].long, true);
});

test("collectSkillInputFields reads legacy field lists and honours skipped labels", () => {
  const fields = collectSkillInputFields(
    [{ skillJson: { input_contract: ["文种", "主题"] } }, { skillJson: { user_input_fields: ["落款单位"] } }],
    parse,
    { skipLabels: ["文种"] },
  );
  assert.deepEqual(fields.map((field) => field.label), ["主题", "落款单位"]);
});

test("getFieldLabel accepts strings and common object shapes", () => {
  assert.equal(getFieldLabel(" 主题 "), "主题");
  assert.equal(getFieldLabel({ field: "时间" }), "时间");
  assert.equal(getFieldLabel(null), "");
});

test("a field written as “字段：内容” in the prompt counts as provided", () => {
  assert.equal(isFieldCoveredByPrompt("对象", "对象：相关部门负责人"), true);
  assert.equal(isFieldCoveredByPrompt("对象", "面向对象："), false);
  const fields = [
    { label: "主题", required: true },
    { label: "对象", required: true },
    { label: "语气", required: false },
  ];
  assert.deepEqual(findMissingRequiredFields(fields, { 主题: "专项培训" }, "对象：各部门"), []);
  assert.deepEqual(findMissingRequiredFields(fields, {}, ""), ["主题", "对象"]);
});

test("buildSkillInputPrompt lists filled facts and marks missing required fields for placeholders", () => {
  const fields = [
    { label: "主题", required: true },
    { label: "对象", required: true },
    { label: "语气", required: false },
  ];
  const prompt = buildSkillInputPrompt(fields, { 主题: "专项培训" }, "");
  assert.match(prompt, /- 主题：专项培训/);
  assert.match(prompt, /- 对象：【未填写】/);
  assert.doesNotMatch(prompt, /语气/);
  assert.match(prompt, /可替换占位符/);
  assert.equal(buildSkillInputPrompt(fields, {}, "主题：甲\n对象：乙"), "");
});

test("an empty field cannot borrow a value from the next line", () => {
  const fields = [{ label: "时间", required: true }, { label: "地点", required: true }];
  for (const newline of ["\n", "\r\n", "\r", "\u2028", "\u2029"]) {
    const prompt = `时间： \t　${newline}地点：三楼会议室`;
    assert.equal(isFieldCoveredByPrompt("时间", prompt), false, JSON.stringify(newline));
    assert.equal(isFieldCoveredByPrompt("地点", prompt), true);
    assert.deepEqual(findMissingRequiredFields(fields, {}, prompt), ["时间"]);
    assert.match(buildSkillInputPrompt(fields, {}, prompt), /- 时间：【未填写】/);
    assert.equal(isFieldCoveredByPrompt("时间", `时间${newline}：周三`), false);
  }
});

test("field matching keeps inline spaces, both colons and literal field labels", () => {
  assert.equal(isFieldCoveredByPrompt("时间", "时间 \t:　周三"), true);
  assert.equal(isFieldCoveredByPrompt("时间", "时间：　 \t"), false);
  assert.equal(isFieldCoveredByPrompt("时间(确认)", "时间(确认)：周三"), true);
});
