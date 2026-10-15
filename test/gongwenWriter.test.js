import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import source from "../assets/third-party/lieflat-gongwen/bundle.json" with { type: "json" };
import {
  buildGongwenPrompt, checkGongwenDocument, createGongwenWriter,
  ensureGongwenWriter, GONGWEN_GENRES, isGongwenWriter, resolveGongwenGenre,
} from "../src/modules/skills/gongwenWriter.js";
import { createSkillManager, createSkillPackage, parseImportedSkillPackage } from "../src/modules/skills/skillManager.js";

test("pinned references preserve source hashes and the complete noncommercial license", async () => {
  assert.equal(source.license, "PolyForm-Noncommercial-1.0.0");
  assert.equal(source.license_text, await readFile(new URL("../assets/third-party/lieflat-gongwen/LICENSE", import.meta.url), "utf8"));
  for (const [name, content] of Object.entries(source.documents)) {
    const original = await readFile(new URL(`../assets/third-party/lieflat-gongwen/${name}`, import.meta.url), "utf8");
    assert.equal(content, original, name);
    assert.equal(createHash("sha256").update(content).digest("hex"), source.sha256[name], name);
  }
});

test("installation is additive, avoids handle collisions and does not resurrect deleted writers", () => {
  const previous = { id: "user", name: "公文写作", handle: "公文写作", summary: "用户规则" };
  const state = { styles: [previous], settings: {} };
  ensureGongwenWriter(state, "2026-09-12T00:00:00Z");
  assert.equal(state.styles[0], previous);
  assert.equal(state.styles[1].handle, "公文写作-2");
  assert.deepEqual(JSON.parse(state.styles[1].skillJson).style_rules.must, []);
  ensureGongwenWriter(state);
  assert.equal(state.styles.length, 2);
  state.styles.pop();
  ensureGongwenWriter(state);
  assert.equal(state.styles.length, 1);
  const old = { styles: [], settings: "invalid old setting" };
  ensureGongwenWriter(old);
  assert.equal(old.styles.length, 1);
});

test("genre selection does not confuse statutory documents, summaries or mixed samples", () => {
  assert.equal(resolveGongwenGenre({ task: "@公文写作 写工作方案" }), "工作方案");
  assert.equal(resolveGongwenGenre({ task: "党建工作方案" }), "工作方案");
  assert.equal(resolveGongwenGenre({ task: "短经验材料" }), "短经验材料");
  for (const task of ["培训通知", "年度工作总结", "会议纪要", "调研报告和经验材料", "请示报告"]) {
    assert.equal(resolveGongwenGenre({ task, documentType: "plan" }), "", task);
  }
  assert.equal(resolveGongwenGenre({ task: "我的材料", documentType: "plan" }), "工作方案");
  assert.equal(resolveGongwenGenre({ genre: "工作意见", task: "根据通知的内容起草" }), "工作意见");
  assert.equal(resolveGongwenGenre({ genre: "fake", documentType: "plan" }), "");
});

test("runtime includes complete selected examples, license provenance and explicit factual safeguards", () => {
  for (const genre of GONGWEN_GENRES) {
    const prompt = buildGongwenPrompt({ genre });
    assert.ok(prompt.length > 10000 && prompt.length < 65000, `${genre}: ${prompt.length}`);
    assert.match(prompt, /工作台执行约束（优先于参考资料）/);
    assert.match(prompt, /不得为迎合文风删改真实问题和数据/);
    assert.match(prompt, /不附加自检报告/);
    const examples = Object.entries(source.documents).filter(([name]) => name.startsWith(`示例/${genre}_`)).slice(0, 2);
    assert.equal(examples.length, 2);
    for (const [, text] of examples) assert.ok(prompt.includes(text));
  }
  const unknown = buildGongwenPrompt({ task: "通知" });
  assert.doesNotMatch(unknown, /参考文件/);
  const paragraph = buildGongwenPrompt({ genre: "工作方案", mode: "paragraph" });
  assert.doesNotMatch(paragraph, /参考文件 示例\//);
  assert.match(paragraph, /忽略全篇字数、标题数量/);
});

test("normal writers stay isolated and built-in exports retain their license and callable marker", () => {
  const builtin = createGongwenWriter();
  const normal = { name: "普通执笔人", handle: "普通", enabled: true, skillJson: "{}" };
  const manager = createSkillManager({ state: { styles: [builtin, normal] }, ui: {}, els: {}, persist() {}, toast() {}, eventBus: { emit() {} } });
  assert.doesNotMatch(manager.buildSkillPromptForDocumentGeneration([normal], { genre: "工作方案" }), /参考文件/);
  assert.match(manager.buildSkillPromptForDocumentGeneration([builtin], { genre: "工作方案" }), /参考文件 SKILL.md/);
  assert.equal(manager.buildSkillPromptForDocumentGeneration([{ ...builtin, enabled: false }]), "");
  const packaged = createSkillPackage(builtin);
  assert.equal(packaged.skill.ruleJson.third_party_license.name, source.license);
  assert.ok(isGongwenWriter(parseImportedSkillPackage(packaged)));
});

test("local checks use the selected corpus and remain advisory without mutating text", () => {
  const input = "# 一、主要任务\n（一）准备工作\n1.落实分工\n完成资料、设备和场地检查。\n2026.09.12\n进度为50%，请于【日期】反馈。";
  const report = checkGongwenDocument(input, { genre: "工作方案" });
  assert.equal(report.sampleCount, 10);
  const row = (key) => report.rows.find((item) => item.key === key);
  assert.equal(row("h1").value, 1);
  assert.equal(row("h2").value, 1);
  assert.equal(row("h3").value, 1);
  assert.equal(report.placeholderCount, 1);
  assert.deepEqual(row("chars").range, [2700, 5000, 3600]);
  assert.equal(row("chars").outside, true);
  assert.match(report.note, /偏离不等于错误/);
  assert.equal(report.passed, undefined);
  assert.equal(report.save_allowed, undefined);
  const unknown = checkGongwenDocument(input, { genre: "unsupported" });
  assert.ok(unknown.rows.every((item) => item.range === null && item.outside === false));
  const empty = checkGongwenDocument("\n ", { genre: "领导讲话" });
  assert.ok(empty.empty);
  assert.ok(empty.rows.every((item) => Number.isFinite(item.value) && !item.outside));
});
