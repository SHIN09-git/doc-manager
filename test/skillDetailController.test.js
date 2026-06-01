import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/core/eventBus.js";
import { createSkillDetailController } from "../src/modules/skills/skillDetailController.js";

function element(value = "") {
  return {
    value,
    dataset: {},
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createHarness(options = {}) {
  const calls = [];
  const events = [];
  const toasts = [];
  const progressUpdates = [];
  const style = options.style || {
    id: "skill-1",
    name: "学校通知",
    skillJson: "{\"name\":\"学校通知\"}",
    aggregationData: {},
    qualityReport: {},
    feedbacks: [],
  };
  const ui = {
    editingStyle: style,
    skillMarkdownDirty: Boolean(options.dirty),
    skillMarkdownDirtySkillId: options.dirty ? style.id : null,
  };
  const tabs = [
    { dataset: { detailTab: "training" }, addEventListener: (type, handler) => calls.push(["tab-listener", type, handler]) },
    { dataset: { detailTab: "test" }, addEventListener: (type, handler) => calls.push(["tab-listener", type, handler]) },
  ];
  const els = {
    styleSummaryInput: element(options.summary || "旧说明"),
    saveSkillMdBtn: element(),
    skillJsonInput: element(style.skillJson),
    runSkillTestBtn: element(),
    saveSkillFeedbackBtn: element(),
    skillDetailCloseBtn: element(),
    skillTestPrompt: element(options.testPrompt ?? "请写一份通知"),
    skillFeedbackInput: element(options.feedback ?? "以后不要写得太宣传化"),
  };
  const controller = createSkillDetailController({
    ui,
    els,
    eventBus: { emit: (eventName) => events.push(eventName) },
    skillRenderer: {
      openSkillDetail: (skillId) => {
        calls.push(["open-detail", skillId]);
        return "opened";
      },
      hideSkillDetailMenu: () => calls.push(["hide-detail"]),
      switchSkillDetailTab: (tabName) => calls.push(["switch-detail", tabName]),
    },
    skillBuilder: {
      testSkillOnGeneration: async (styleArg, skillJson, input, optionsArg) => {
        calls.push(["test-skill", styleArg.id, skillJson.name, input.用户测试任务, Boolean(optionsArg.signal)]);
        return { document: "测试文档", report: { overall_result: { passed: true, score: 92 } } };
      },
      normalizeSkillQualityReport: (styleArg, aggregationData, qualityReport, report) => {
        calls.push(["normalize-quality", styleArg.id, Boolean(aggregationData), Boolean(qualityReport), report.overall_result.score]);
        return { normalized: true };
      },
    },
    toast: (message, tone) => toasts.push({ message, tone }),
    syncEditingStyleFromInputs: () => style,
    parseSkillJsonObject: (value) => JSON.parse(value),
    commitSkillToState: (draft) => {
      calls.push(["commit", draft.id]);
      return draft;
    },
    getSkillLocation: (skill) => `执笔人库/${skill?.name || "未命名"}`,
    cancelActiveTask: (key) => {
      calls.push(["cancel-check", key]);
      return Boolean(options.cancelActive);
    },
    withCancelableTask: async (taskOptions, task) => {
      calls.push(["task", taskOptions.key, taskOptions.busyText]);
      return task({
        progress: { update: (message, progress) => progressUpdates.push({ message, progress }) },
        signal: { aborted: false },
      });
    },
    throwIfTaskAborted: (signal) => calls.push(["throw-if-aborted", signal.aborted]),
    openSkillBuilderModal: (skillId) => calls.push(["open-builder", skillId]),
    flushSkillMarkdownEdits: () => calls.push(["flush-md"]),
    updateSkillMarkdownSaveState: () => calls.push(["update-md-state"]),
    saveSkillMarkdownEdits: (saveOptions) => calls.push(["save-md", saveOptions]),
    documentRef: () => ({ querySelectorAll: () => tabs }),
  });
  return { controller, ui, els, style, calls, events, toasts, progressUpdates, tabs };
}

test("bindEvents wires detail controls and markdown editing state", () => {
  const harness = createHarness();

  harness.controller.bindEvents();
  harness.els.styleSummaryInput.value = "新版说明";
  harness.els.styleSummaryInput.listeners.input();
  harness.els.styleSummaryInput.listeners.blur();
  harness.els.skillJsonInput.value = "{\"name\":\"新版\"}";
  harness.els.skillJsonInput.listeners.input();
  harness.els.skillDetailCloseBtn.listeners.click();
  harness.calls.find((item) => item[0] === "tab-listener" && item[2])?.[2]();

  assert.equal(harness.style.summary, "新版说明");
  assert.equal(harness.ui.skillMarkdownDirty, true);
  assert.equal(harness.ui.skillMarkdownDirtySkillId, "skill-1");
  assert.equal(harness.style.skillJson, "{\"name\":\"新版\"}");
  assert.deepEqual(harness.calls.filter((item) => item[0] === "save-md"), [["save-md", { silent: true }]]);
  assert.ok(harness.calls.some((item) => item[0] === "hide-detail"));
  assert.ok(harness.calls.some((item) => item[0] === "switch-detail"));
});

test("open flushes markdown edits and resets dirty flags", () => {
  const harness = createHarness({ dirty: true });

  const result = harness.controller.open("skill-1");

  assert.equal(result, "opened");
  assert.equal(harness.ui.skillMarkdownDirty, false);
  assert.equal(harness.ui.skillMarkdownDirtySkillId, null);
  assert.deepEqual(harness.calls, [["flush-md"], ["open-detail", "skill-1"], ["update-md-state"]]);
});

test("runGenerationTest validates input and saves the generated report", async () => {
  const missingJson = createHarness({ style: { id: "skill-1", name: "空规则", skillJson: "" } });
  assert.equal(await missingJson.controller.runGenerationTest(), null);
  assert.deepEqual(missingJson.toasts.at(-1), { message: "请先生成或填写执笔人规则 JSON", tone: "warn" });

  const harness = createHarness();
  const result = await harness.controller.runGenerationTest();

  assert.equal(result.result, "测试文档");
  assert.equal(harness.style.lastTest.prompt, "请写一份通知");
  assert.equal(harness.style.qualityReport.normalized, true);
  assert.deepEqual(harness.events, [EVENTS.RENDER_SKILL_TEST, EVENTS.RENDER_SKILL_QUALITY]);
  assert.deepEqual(harness.progressUpdates, [
    { message: "步骤 1/2：正在生成测试文档", progress: 35 },
    { message: "正在保存测试报告", progress: 86 },
  ]);
  assert.match(harness.toasts.at(-1).message, /测试结果已保存到/);
});

test("saveFeedback stores long-term feedback and opens retrain modal", () => {
  const empty = createHarness({ feedback: "   " });
  assert.equal(empty.controller.saveFeedback(), null);
  assert.deepEqual(empty.toasts.at(-1), { message: "请输入反馈内容", tone: "warn" });

  const harness = createHarness({ feedback: "以后少用口号式表达" });
  const feedback = harness.controller.saveFeedback();

  assert.equal(feedback.text, "以后少用口号式表达");
  assert.equal(harness.style.feedbacks.length, 1);
  assert.deepEqual(harness.events, [EVENTS.RENDER_SKILL_TEST]);
  assert.ok(harness.calls.some((item) => item[0] === "commit"));
  assert.ok(harness.calls.some((item) => item[0] === "open-builder" && item[1] === "skill-1"));
});
