import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/core/eventBus.js";
import { createSkillWorkbenchController } from "../src/modules/skills/skillWorkbenchController.js";

function createPrompt(value = "") {
  return {
    value,
    events: [],
    focusCount: 0,
    dispatchEvent(event) {
      this.events.push(event);
    },
    focus() {
      this.focusCount += 1;
    },
  };
}

function createSaveButton() {
  return {
    title: "",
    dataset: {},
    toggles: [],
    classList: {
      toggle: (name, enabled) => {
        saveButton.toggles.push({ name, enabled });
      },
    },
  };
}

const saveButton = createSaveButton();

function createHarness(options = {}) {
  saveButton.toggles = [];
  saveButton.title = "";
  saveButton.dataset = {};
  const state = options.state || {
    styles: [
      {
        id: "skill-1",
        name: "学校通知",
        handle: "notice",
        enabled: true,
        summary: "旧说明",
        examples: [{ name: "样本.txt" }],
      },
    ],
  };
  const ui = options.ui || {
    editingStyle: null,
    skillMarkdownDirty: false,
    skillMarkdownDirtySkillId: null,
  };
  const els = {
    generatePrompt: createPrompt(options.promptValue || ""),
    styleSummaryInput: {
      value: options.summaryValue || "新说明",
      focusCount: 0,
      focus() {
        this.focusCount += 1;
      },
    },
    saveSkillMdBtn: saveButton,
    ...options.els,
  };
  const events = [];
  const toasts = [];
  const calls = [];
  const controller = createSkillWorkbenchController({
    state,
    ui,
    els,
    normalizeSkill: (skill) => ({ ...skill, handle: skill.handle || skill.name, normalized: true }),
    persist: () => calls.push("persist"),
    eventBus: { emit: (eventName) => events.push(eventName) },
    toast: (message, type) => toasts.push({ message, type }),
    getSkillLocation: (skill) => `执笔人库/${skill.name}`,
    switchTab: (tab) => calls.push(`tab:${tab}`),
    openResponsiveTools: () => calls.push("responsive-tools"),
    openSkillDetail: (skillId) => calls.push(`detail:${skillId}`),
    switchSkillDetailTab: (tab) => calls.push(`detail-tab:${tab}`),
    exportSkillPackage: () => calls.push("export-package"),
    deleteStyle: () => calls.push("delete-style"),
    cancelActiveTask: (key) => {
      calls.push(`cancel:${key}`);
      return true;
    },
    documentRef: options.documentRef || (() => globalThis.document),
    clipboard: options.clipboard || (() => ({ writeText: (text) => calls.push(`copy:${text}`) })),
    createInputEvent: () => ({ type: "input", bubbles: true }),
  });
  return { controller, state, ui, els, events, toasts, calls };
}

test("updateBuildState normalizes style, persists, and refreshes skill views", () => {
  const ui = { editingStyle: { id: "skill-1" }, skillMarkdownDirty: false, skillMarkdownDirtySkillId: null };
  const harness = createHarness({ ui });

  const updated = harness.controller.updateBuildState("skill-1", { enabled: false });

  assert.equal(updated.enabled, false);
  assert.equal(updated.normalized, true);
  assert.equal(harness.ui.editingStyle.id, "skill-1");
  assert.notEqual(harness.ui.editingStyle, updated);
  assert.deepEqual(harness.calls, ["persist"]);
  assert.deepEqual(harness.events, [EVENTS.RENDER_STYLE_SELECT, EVENTS.RENDER_STYLE_LIST]);
});

test("createCardProgress writes building progress back to the skill", () => {
  const harness = createHarness();
  const progress = harness.controller.createCardProgress("skill-1");

  progress.update("步骤 1/4：分析样本", 25);

  assert.equal(harness.state.styles[0].status, "building");
  assert.deepEqual(harness.state.styles[0].buildProgress, { message: "步骤 1/4：分析样本", progress: 25 });
  assert.equal(harness.state.styles[0].lastBuildError, "");
});

test("getBuildResult summarizes rule counts and test status", () => {
  const harness = createHarness();

  const result = harness.controller.getBuildResult(
    { examples: [{}, {}] },
    { version: 3 },
    {
      aggregationData: {
        overall_confidence: "medium",
        strong_rules: ["规则一", "规则二"],
        candidate_rules: ["候选"],
        privacy_findings: ["手机号"],
        case_specific_exclusions: ["某次活动"],
      },
      testReport: JSON.stringify({ check_report: { passed: false } }),
    },
  );

  assert.deepEqual(result, {
    version: 3,
    confidence: "medium",
    strongRuleCount: 2,
    candidateRuleCount: 1,
    privacyCount: 1,
    caseSpecificCount: 1,
    passed: false,
    sampleCount: 2,
  });
});

test("getBuildResult reads the multi-case test overall status", () => {
  const harness = createHarness();

  const result = harness.controller.getBuildResult(
    { examples: [{}] },
    { version: 4 },
    {
      qualityReport: { confidence: "high" },
      testReport: JSON.stringify({
        overall_result: {
          passed: true,
          score: 92,
        },
      }),
    },
  );

  assert.equal(result.version, 4);
  assert.equal(result.confidence, "high");
  assert.equal(result.passed, true);
  assert.equal(result.sampleCount, 1);
});

test("invokeFromCard inserts an @handle into the generation prompt and opens generation tab", () => {
  const harness = createHarness({ promptValue: "请起草" });

  const mention = harness.controller.invokeFromCard("skill-1");

  assert.equal(mention, "@notice");
  assert.equal(harness.els.generatePrompt.value, "请起草\n@notice ");
  assert.deepEqual(harness.els.generatePrompt.events, [{ type: "input", bubbles: true }]);
  assert.equal(harness.els.generatePrompt.focusCount, 1);
  assert.deepEqual(harness.calls, ["tab:generate", "responsive-tools"]);
  assert.equal(harness.toasts.at(-1).message, "已插入 @notice，可继续补充生成要求");
});

test("copyHandleFromCard writes the mention to clipboard", async () => {
  const harness = createHarness();

  const mention = await harness.controller.copyHandleFromCard("skill-1");

  assert.equal(mention, "@notice");
  assert.deepEqual(harness.calls, ["copy:@notice"]);
  assert.equal(harness.toasts.at(-1).message, "已复制 @notice");
});

test("copyHandleFromCard warns when the mention cannot be copied", async () => {
  const harness = createHarness({
    clipboard: () => ({ writeText: async () => { throw new Error("blocked"); } }),
    documentRef: () => null,
  });

  const mention = await harness.controller.copyHandleFromCard("skill-1");

  assert.equal(mention, "@notice");
  assert.deepEqual(harness.toasts.at(-1), { message: "复制失败，请手动复制调用名", type: "warn" });
});

test("saveMarkdownEdits stores summary and clears dirty state", () => {
  const ui = {
    editingStyle: { id: "skill-1" },
    skillMarkdownDirty: true,
    skillMarkdownDirtySkillId: "skill-1",
  };
  const harness = createHarness({ ui, summaryValue: "新版说明" });

  const saved = harness.controller.saveMarkdownEdits();

  assert.equal(saved.summary, "新版说明");
  assert.equal(harness.state.styles[0].summary, "新版说明");
  assert.equal(harness.ui.skillMarkdownDirty, false);
  assert.equal(harness.ui.skillMarkdownDirtySkillId, null);
  assert.deepEqual(harness.events, [EVENTS.RENDER_STYLE_LIST]);
  assert.deepEqual(harness.calls, ["persist"]);
  assert.equal(harness.els.saveSkillMdBtn.dataset.dirty, "false");
  assert.equal(harness.toasts.at(-1).message, "说明.md 已保存到：执笔人库/学校通知 / 说明.md");
});

test("saveMarkdownEdits warns when no current skill is selected", () => {
  const ui = { editingStyle: null, skillMarkdownDirty: true, skillMarkdownDirtySkillId: "missing" };
  const harness = createHarness({ ui });

  const saved = harness.controller.saveMarkdownEdits();

  assert.equal(saved, null);
  assert.equal(harness.ui.skillMarkdownDirty, false);
  assert.deepEqual(harness.toasts.at(-1), { message: "请先选择一个执笔人", type: "warn" });
});

test("card secondary actions route through detail, export, delete, and cancel callbacks", () => {
  const harness = createHarness();

  harness.controller.openTestFromCard("skill-1");
  harness.controller.editMarkdownFromCard("skill-1");
  assert.equal(harness.els.styleSummaryInput.focusCount, 1);
  assert.equal(harness.controller.exportPackageById("skill-1"), true);
  assert.equal(harness.controller.deleteById("skill-1"), true);
  assert.equal(harness.controller.cancelBuild("skill-1"), true);

  assert.deepEqual(harness.calls, [
    "detail:skill-1",
    "detail-tab:test",
    "detail:skill-1",
    "detail-tab:markdown",
    "export-package",
    "delete-style",
    "cancel:skill-build:skill-1",
  ]);
  assert.equal(harness.events.filter((eventName) => eventName === EVENTS.RENDER_STYLE_EDITOR).length, 2);
});
