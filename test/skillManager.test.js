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
  assert.ok(payload.execution_priority.some((rule) => rule.includes("用户本次提供的事实优先")));
  assert.equal(payload.example_output, undefined);
  assert.equal(payload.source_documents, undefined);
});

test("runtime prompt keeps user facts above recommended and optional rules", () => {
  const state = {
    styles: [
      {
        id: "notice",
        name: "通知写作",
        handle: "notice",
        enabled: true,
        skillJson: JSON.stringify({
          name: "通知写作",
          handle: "notice",
          style_rules: { must: ["标题明确"], recommended: ["语气正式"], optional: ["适当扩写"] },
          forbidden: ["样本人名"],
          privacy_filters: ["手机号"],
          case_specific_exclusions: ["2026年5月23日"],
        }),
      },
    ],
  };
  const manager = createSkillManager({
    state,
    ui: {},
    els: {},
    persist: () => {},
    eventBus: { emit: () => {} },
    toast: () => {},
    getSkillLocation: (skill) => `@${skill.handle}`,
  });

  const prompt = manager.buildSkillPromptForDocumentGeneration(state.styles);
  assert.match(prompt, /用户本次提供的事实优先于执笔人规则/);
  assert.match(prompt, /recommended \/ optional 不能压过用户本次输入/);
  assert.match(prompt, /【可替换占位符】/);
  assert.match(prompt, /case_specific_exclusions/);
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

test("parseImportedSkillPackage strips raw version source text", () => {
  const imported = parseImportedSkillPackage({
    schema: SKILL_PACKAGE_SCHEMA,
    skill: {
      name: "Shared writer",
      handle: "shared",
      ruleJson: { name: "Shared writer", handle: "shared" },
      sourceDocuments: [{ name: "sample.docx", text: "private source text 13800138000" }],
      versions: [
        {
          version: 3,
          sourceExamples: [{ name: "sample.docx", text: "private source text 13800138000" }],
        },
      ],
    },
  });

  assert.equal(imported.examples[0].text.includes("private source text"), false);
  assert.equal(imported.examples[0].originalLength, "private source text 13800138000".length);
  assert.equal(imported.versions[0].sourceExamples[0].text, undefined);
  assert.equal(imported.versions[0].sourceExamples[0].length, "private source text 13800138000".length);
  assert.equal(JSON.stringify(imported.versions).includes("13800138000"), false);
});

test("normalizeSkill strips raw text from legacy version source examples", () => {
  const manager = createSkillManager({
    state: { styles: [] },
    ui: {},
    els: {},
    persist: () => {},
    eventBus: { emit: () => {} },
    toast: () => {},
    getSkillLocation: (skill) => `@${skill.handle}`,
  });

  const normalized = manager.normalizeSkill({
    name: "Legacy writer",
    versions: [{ sourceExamples: [{ name: "legacy.docx", text: "legacy private source" }] }],
  });

  assert.equal(normalized.versions[0].sourceExamples[0].text, undefined);
  assert.equal(normalized.versions[0].sourceExamples[0].length, "legacy private source".length);
});

test("inspectSkillPackageImport previews summaries, conflicts, and sensitive findings", () => {
  const manager = createSkillManager({
    state: { styles: [{ id: "existing", name: "Existing writer", handle: "shared" }] },
    ui: {},
    els: {},
    persist: () => {},
    eventBus: { emit: () => {} },
    toast: () => {},
    getSkillLocation: (skill) => `@${skill.handle}`,
  });

  const preview = manager.inspectSkillPackageImport({
    schema: SKILL_PACKAGE_SCHEMA,
    skill: {
      name: "Shared writer",
      handle: "shared",
      ruleJson: {
        name: "Shared writer",
        handle: "shared",
        style_rules: { must: ["Use headings"], recommended: ["Be concise"], optional: ["Polish tone"] },
        privacy_filters: ["phone"],
      },
      versions: [{ version: 1, sourceExamples: [{ name: "sample.docx", length: 1200 }] }],
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz",
    },
  });

  assert.equal(preview.summary.name, "Shared writer");
  assert.equal(preview.summary.sourceCount, 1);
  assert.equal(preview.summary.mustRuleCount, 1);
  assert.equal(preview.summary.duplicateHandle, "shared");
  assert.equal(preview.sensitiveFindings.some((item) => item.path.includes("apiKey")), true);
  assert.match(preview.previewText, /Shared writer/);
});

test("importSkillPackage can replace an existing handle after confirmation", () => {
  const state = {
    styles: [{ id: "existing", name: "Old writer", handle: "shared", createdAt: "2026-01-01T00:00:00.000Z" }],
  };
  const manager = createSkillManager({
    state,
    ui: {},
    els: {},
    persist: () => {},
    eventBus: { emit: () => {} },
    toast: () => {},
    getSkillLocation: (skill) => `@${skill.handle}`,
  });
  const payload = {
    schema: SKILL_PACKAGE_SCHEMA,
    skill: {
      name: "New writer",
      handle: "shared",
      ruleJson: { name: "New writer", handle: "shared" },
    },
  };
  const preview = manager.inspectSkillPackageImport(payload);
  const imported = manager.importSkillPackage(payload, { draft: preview.draft, conflictMode: "replace" });

  assert.equal(state.styles.length, 1);
  assert.equal(imported.id, "existing");
  assert.equal(imported.name, "New writer");
  assert.equal(imported.handle, "shared");
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
