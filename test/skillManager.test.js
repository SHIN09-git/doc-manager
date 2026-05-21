import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_PACKAGE_SCHEMA,
  buildSkillRuntimePayload,
  createSkillManager,
  createSkillPackage,
  parseImportedSkillPackage,
} from "../src/modules/skills/skillManager.js";

test("buildSkillRuntimePayload keeps only compact execution fields", () => {
  const payload = buildSkillRuntimePayload(
    {
      name: "通知写作",
      handle: "notice",
      description: "生成正式通知",
      confidence: "medium",
      user_input_fields: ["通知对象", "事项"],
      style_rules: {
        must: ["标题明确"],
        recommended: ["语气正式"],
      },
      reusable_expressions: ["请各部门按要求落实。"],
      generation_steps: ["确认对象", "分条说明事项"],
      self_checklist: ["未编造日期"],
      source_documents: ["内部样本.docx"],
      example_output: "不应进入运行时提示的大段示例",
    },
    { name: "通知写作", handle: "notice" },
  );

  assert.equal(payload.name, "通知写作");
  assert.deepEqual(payload.input_contract.required_fields, ["通知对象", "事项"]);
  assert.deepEqual(payload.common_expression_library, ["请各部门按要求落实。"]);
  assert.deepEqual(payload.execution_workflow, ["确认对象", "分条说明事项"]);
  assert.deepEqual(payload.validation_checklist, ["未编造日期"]);
  assert.equal(payload.example_output, undefined);
  assert.equal(payload.source_documents, undefined);
});

test("createSkillPackage exports runtime rules without raw examples", () => {
  const packaged = createSkillPackage({
    name: "会议纪要",
    handle: "会议纪要",
    summary: "# 会议纪要\n",
    skillJson: JSON.stringify({ name: "会议纪要", handle: "会议纪要", style_rules: { must: ["客观记录"] } }),
    examples: [{ name: "样本一.docx", text: "这是一段原始样本文本，不应导出全文" }],
    versions: [{ version: 1, sourceExamples: [{ name: "样本一.docx", length: 18 }], skillJson: "{}" }],
  });

  assert.equal(packaged.schema, SKILL_PACKAGE_SCHEMA);
  assert.equal(packaged.skill.ruleJson.name, "会议纪要");
  assert.equal(packaged.skill.sourceDocuments[0].name, "样本一.docx");
  assert.equal(packaged.skill.sourceDocuments[0].text, undefined);
  assert.equal(JSON.stringify(packaged).includes("这是一段原始样本文本"), false);
});

test("parseImportedSkillPackage accepts package and keeps source document summaries", () => {
  const imported = parseImportedSkillPackage({
    schema: SKILL_PACKAGE_SCHEMA,
    skill: {
      name: "通知写作",
      handle: "notice",
      summaryMd: "# 通知写作",
      ruleJson: { name: "通知写作", handle: "notice", category: "公文写作" },
      sourceDocuments: [{ name: "通知样本.docx", length: 1200 }],
      versions: [{ version: 2, summary: "v2", skillJson: "{\"name\":\"通知写作\"}" }],
    },
  });

  assert.equal(imported.name, "通知写作");
  assert.equal(imported.handle, "notice");
  assert.deepEqual(JSON.parse(imported.skillJson).style_rules || {}, {});
  assert.equal(imported.examples[0].name, "通知样本.docx");
  assert.match(imported.examples[0].text, /不包含原始全文/);
  assert.equal(imported.versions[0].version, 2);
});

test("parseImportedSkillPackage preserves object ruleJson", () => {
  const imported = parseImportedSkillPackage({
    schema: SKILL_PACKAGE_SCHEMA,
    skill: {
      ruleJson: {
        name: "会议纪要",
        handle: "meeting",
        style_rules: { must: ["客观记录会议事项"] },
      },
    },
  });

  const ruleJson = JSON.parse(imported.skillJson);
  assert.equal(ruleJson.raw, undefined);
  assert.deepEqual(ruleJson.style_rules.must, ["客观记录会议事项"]);
});

test("importSkillPackage deduplicates max-length handles without hanging", () => {
  const state = {
    styles: [{ id: "existing", name: "已有", handle: "abcdefghijklmnopqrstuvwx", enabled: true }],
  };
  const ui = {};
  const emitted = [];
  const manager = createSkillManager({
    state,
    ui,
    els: {},
    persist: () => {},
    eventBus: { emit: (eventName) => emitted.push(eventName) },
    toast: () => {},
    getSkillLocation: (skill) => `@${skill.handle}`,
  });

  const imported = manager.importSkillPackage({
    schema: SKILL_PACKAGE_SCHEMA,
    skill: {
      name: "超长调用名",
      handle: "abcdefghijklmnopqrstuvwx",
      ruleJson: { name: "超长调用名", handle: "abcdefghijklmnopqrstuvwx" },
    },
  });

  assert.notEqual(imported.handle, "abcdefghijklmnopqrstuvwx");
  assert.match(imported.handle, /-2$/);
  assert.equal(imported.handle.length <= 24, true);
  assert.equal(state.styles.length, 2);
  assert.equal(emitted.length > 0, true);
});
