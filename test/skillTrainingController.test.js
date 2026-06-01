import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/core/eventBus.js";
import { createSkillTrainingController } from "../src/modules/skills/skillTrainingController.js";

function textFile(name, text) {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function createInput(files) {
  return {
    files,
    value: "C:/fake/file.txt",
  };
}

function createHarness(options = {}) {
  const calls = [];
  const events = [];
  const toasts = [];
  const progressUpdates = [];
  const commits = [];
  const style = options.style ?? {
    id: "skill-1",
    name: "学校通知",
    handle: "notice",
    description: "",
    examples: [{ id: "ex-1", name: "样本一.txt", text: "通知正文" }],
    versions: [],
  };
  const ui = options.ui ?? {
    editingStyle: style,
    selectedSkillCardId: null,
    activeTasks: {},
  };
  const outputs = options.outputs ?? {
    analyses: [{ document_id: "doc-1" }],
    analysis: "[]",
    aggregationData: { strong_rules: ["规则一"], candidate_rules: ["候选一"] },
    aggregation: "聚合",
    qualityReport: { confidence: "medium" },
    markdown: "# 学校通知",
    skillJson: "{\"description\":\"正式通知\"}",
    testDoc: "测试文档",
    testReport: "{\"overall_result\":{\"save_allowed\":true}}",
  };
  const controller = createSkillTrainingController({
    ui,
    els: {
      styleNameInput: {
        focusCount: 0,
        focus() {
          this.focusCount += 1;
        },
      },
    },
    eventBus: { emit: (eventName) => events.push(eventName) },
    skillBuilder: {
      buildSkillWithAiChain: async (saved, progress, taskOptions) => {
        calls.push(["build", saved.id, Boolean(taskOptions.signal)]);
        progress.update("AI 构建中", 50);
        if (options.buildError) throw options.buildError;
        return outputs;
      },
      createSkillVersion: (saved, buildOutputs) => {
        calls.push(["version", saved.id, buildOutputs.markdown]);
        return { id: "version-1", version: 1, createdAt: "now", skillJson: buildOutputs.skillJson };
      },
    },
    toast: (message, tone) => toasts.push({ message, tone }),
    withProgress: async (message, task) => {
      calls.push(["progress", message]);
      return task({ update: (message, progress) => progressUpdates.push({ message, progress }) });
    },
    importSkillPackageFiles: async (files) => {
      calls.push(["import-package", files.map((file) => file.name)]);
      return { importedCount: files.length };
    },
    isSkillPackageFile: (file) => /\.skill\.json$/i.test(file?.name || ""),
    confirmLargeImport: () => true,
    confirmPrivacyRiskNotice: (intro, findings) => {
      calls.push(["privacy-confirm", intro, findings.length]);
      return options.privacyConfirm ?? true;
    },
    confirmUnstableDraft: () => options.confirmUnstable ?? true,
    syncEditingStyleFromInputs: () => style,
    commitSkillToState: (draft) => {
      commits.push(draft);
      if (options.commitError) throw options.commitError;
      return { ...draft, id: draft.id || "skill-1" };
    },
    parseSkillJsonObject: (value) => JSON.parse(value),
    renderStyleExamples: () => calls.push(["render-examples"]),
    renderSkillDetailExamples: () => calls.push(["render-detail-examples"]),
    closeSkillBuilderModal: (closeOptions) => calls.push(["close-modal", closeOptions]),
    switchTab: (tab) => calls.push(["tab", tab]),
    createSkillCardProgress: (skillId) => ({
      update: (message, progress) => progressUpdates.push({ skillId, message, progress }),
    }),
    getSkillBuildResult: () => ({ version: 1, strongRuleCount: 1, candidateRuleCount: 1 }),
    updateSkillBuildState: (skillId, patch) => calls.push(["update-build", skillId, patch]),
    getSkillLocation: (skillArg) => `执笔人库/${skillArg?.name || "未命名"}`,
    getSkillTrainingLocation: (skillArg) => `执笔人库/${skillArg?.name || "未命名"} / 训练样本`,
    friendlyAiErrorMessage: (error) => `友好错误：${error.message}`,
    isTaskAbortError: (error) => error?.name === "AbortError",
    throwIfTaskAborted: (signal) => {
      if (signal?.aborted) throw Object.assign(new Error("已取消"), { name: "AbortError" });
    },
    createAbortController: () => ({ signal: { aborted: Boolean(options.aborted) } }),
    logger: { warn: (...args) => calls.push(["warn", ...args.slice(0, 2)]) },
  });
  return { controller, ui, style, calls, events, toasts, progressUpdates, commits };
}

test("importStyleExamples imports text samples and clears the file input", async () => {
  const harness = createHarness({ style: { id: "skill-1", name: "通知", examples: [] } });
  const input = createInput([textFile("范文.txt", "这是一份通知范文")]);

  const result = await harness.controller.importStyleExamples({ target: input });

  assert.equal(result.importedCount, 1);
  assert.equal(input.value, "");
  assert.equal(harness.style.examples.length, 1);
  assert.equal(harness.style.examples[0].name, "范文.txt");
  assert.match(harness.style.examples[0].text, /通知范文/);
  assert.ok(harness.calls.some((item) => item[0] === "render-examples"));
  assert.ok(harness.calls.some((item) => item[0] === "render-detail-examples"));
  assert.match(harness.toasts.at(-1).message, /已添加 1 份示范/);
});

test("importStyleDropFiles splits skill packages from training examples", async () => {
  const harness = createHarness({ style: { id: "skill-1", name: "通知", examples: [] } });

  const result = await harness.controller.importStyleDropFiles([
    { name: "notice.skill.json" },
    textFile("范文.md", "Markdown 范文"),
  ]);

  assert.equal(result.packageCount, 1);
  assert.equal(result.exampleCount, 1);
  assert.deepEqual(harness.calls.find((item) => item[0] === "import-package"), ["import-package", ["notice.skill.json"]]);
  assert.equal(harness.style.examples.length, 1);
});

test("importStyleExampleFiles warns when no writer is open and reports unsupported files", async () => {
  const noWriter = createHarness({ ui: { editingStyle: null, activeTasks: {} } });
  const noWriterResult = await noWriter.controller.importStyleExampleFiles([textFile("范文.txt", "正文")]);
  assert.equal(noWriterResult.importedCount, 0);
  assert.deepEqual(noWriter.toasts.at(-1), { message: "请先打开执笔人生成窗口", tone: "warn" });

  const unsupported = createHarness({ style: { id: "skill-1", name: "通知", examples: [] } });
  const result = await unsupported.controller.importStyleExampleFiles([{ name: "旧版.doc", size: 10 }]);
  assert.equal(result.importedCount, 0);
  assert.deepEqual(result.skippedFiles, ["旧版.doc"]);
  assert.match(unsupported.toasts.at(-1).message, /暂不支持旧版 \.doc/);
});

test("summarizeStyle validates required fields and cancellation gates", async () => {
  const missingName = createHarness({ style: { id: "skill-1", name: "", examples: [{ name: "a.txt", text: "a" }] } });
  assert.equal(await missingName.controller.summarizeStyle(), null);
  assert.deepEqual(missingName.toasts.at(-1), { message: "请输入执笔人名称", tone: "warn" });

  const noExamples = createHarness({ style: { id: "skill-1", name: "通知", examples: [] } });
  assert.equal(await noExamples.controller.summarizeStyle(), null);
  assert.deepEqual(noExamples.toasts.at(-1), { message: "请先添加示范文件", tone: "warn" });

  const cancelled = createHarness({ confirmUnstable: false });
  assert.equal(await cancelled.controller.summarizeStyle(), null);
  assert.equal(cancelled.calls.some((item) => item[0] === "build"), false);
});

test("summarizeStyle runs the build chain, saves a ready writer, and cleans active task", async () => {
  const style = {
    id: "skill-1",
    name: "学校通知",
    handle: "notice",
    examples: [
      { id: "ex-1", name: "样本一.txt", text: "通知正文一" },
      { id: "ex-2", name: "样本二.txt", text: "通知正文二" },
    ],
    versions: [],
  };
  const harness = createHarness({ style });

  const committed = await harness.controller.summarizeStyle();

  assert.equal(committed.status, "ready");
  assert.equal(committed.description, "正式通知");
  assert.equal(committed.versions.length, 1);
  assert.equal(committed.lastTest.prompt, "AI 自动生成的执笔人测试");
  assert.equal(harness.ui.selectedSkillCardId, "skill-1");
  assert.equal(harness.ui.activeTasks["skill-build:skill-1"], undefined);
  assert.deepEqual(harness.events, [EVENTS.RENDER_STYLE_EDITOR]);
  assert.ok(harness.calls.some((item) => item[0] === "privacy-confirm"));
  assert.ok(harness.calls.some((item) => item[0] === "close-modal"));
  assert.ok(harness.calls.some((item) => item[0] === "tab" && item[1] === "style"));
  assert.ok(harness.progressUpdates.some((item) => item.message === "正在保存执笔人版本"));
  assert.match(harness.toasts.at(-1).message, /已生成 v1/);
});

test("summarizeStyle records failed builds without leaving an active task", async () => {
  const style = {
    id: "skill-1",
    name: "学校通知",
    examples: [
      { id: "ex-1", name: "样本一.txt", text: "通知正文一" },
      { id: "ex-2", name: "样本二.txt", text: "通知正文二" },
    ],
  };
  const harness = createHarness({ style, buildError: new Error("模型错误") });

  const result = await harness.controller.summarizeStyle();

  assert.equal(result, null);
  assert.equal(harness.ui.activeTasks["skill-build:skill-1"], undefined);
  const update = harness.calls.find((item) => item[0] === "update-build");
  assert.equal(update[1], "skill-1");
  assert.equal(update[2].status, "failed");
  assert.match(update[2].lastBuildError, /友好错误：模型错误/);
  assert.deepEqual(harness.toasts.at(-1), { message: "友好错误：模型错误", tone: "error" });
});
