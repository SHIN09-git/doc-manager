import assert from "node:assert/strict";
import test from "node:test";
import { createSkillPackageController } from "../src/modules/skills/skillPackageController.js";

function element(value = "") {
  return {
    value,
    listeners: {},
    clicked: false,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    click() {
      this.clicked = true;
    },
  };
}

function createFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

function createHarness(options = {}) {
  const calls = [];
  const downloads = [];
  const toasts = [];
  const windowState = {
    confirm: options.confirm || (() => true),
    prompt: options.prompt || (() => "2"),
  };
  const els = {
    importSkillPackageBtn: element(),
    exportSkillPackageBtn: element(),
    importSkillPackageInput: element(),
    exportSkillMdBtn: element(),
    exportSkillJsonBtn: element(),
    styleNameInput: element(options.name || "Notice Writer"),
    skillHandleInput: element(options.handle || "notice"),
    styleSummaryInput: element(options.summary || "# Notice Writer\n"),
    skillJsonInput: element(options.skillJson || "{\"name\":\"Notice Writer\"}"),
    skillDescriptionInput: element(options.description || "Formal notices"),
  };
  const importedPayloads = [];
  const skillManager = {
    createSkillPackage: (skill) => options.packageData || ({
      schema: "mowen.skill.package.v1",
      skill: {
        name: skill.name,
        handle: skill.handle,
        ruleJson: { name: skill.name, style_rules: { must: ["Keep factual"] } },
      },
    }),
    inspectSkillPackageImport: (payload) => ({
      draft: payload.draft || { name: payload.name || "Imported Writer", handle: payload.handle || "imported" },
      duplicate: payload.duplicate || null,
      previewText: payload.previewText || `Writer: ${payload.name || "Imported Writer"}`,
      sensitiveFindings: payload.sensitiveFindings || [],
    }),
    importSkillPackage: (payload, options) => {
      importedPayloads.push({ payload, options });
      return options.draft;
    },
  };
  const controller = createSkillPackageController({
    ui: {
      editingStyle: {
        id: "writer-1",
        name: options.baseName || "Base Writer",
        handle: options.baseHandle || "base",
        summary: "Base summary",
      },
    },
    els,
    skillManager,
    toast: (message, tone) => toasts.push({ message, tone }),
    withProgress: async (message, task) => {
      calls.push(["progress", message]);
      return task({ update: (message, progress) => calls.push(["progress-update", message, progress]) });
    },
    switchTab: (tab) => calls.push(["tab", tab]),
    syncEditingStyleFromInputs: () => options.packageSkill || {
      name: options.packageName ?? "Packaged Writer",
      handle: "packaged",
      skillJson: "{}",
    },
    getSelectedSkillCategory: () => "Official",
    normalizeSkillJsonText: (value, skill) => JSON.stringify({ raw: value, name: skill.name, category: skill.category }),
    downloadBlob: (fileName, content, type) => downloads.push({ fileName, content, type }),
    getDownloadLocation: (fileName) => `Downloads/${fileName}`,
    windowRef: () => windowState,
    logger: { warn: (...args) => calls.push(["warn", ...args.slice(0, 2)]) },
  });
  return { controller, els, calls, downloads, toasts, windowState, importedPayloads };
}

test("bindEvents wires package import and export buttons", async () => {
  const harness = createHarness();

  harness.controller.bindEvents();
  harness.els.importSkillPackageBtn.listeners.click();
  harness.els.exportSkillMdBtn.listeners.click();
  harness.els.exportSkillJsonBtn.listeners.click();

  assert.equal(harness.els.importSkillPackageInput.clicked, true);
  assert.equal(harness.downloads.length, 2);
  assert.match(harness.downloads[0].fileName, /执笔人说明\.md$/);
  assert.match(harness.downloads[1].fileName, /执笔人规则\.json$/);
});

test("exportPackage blocks empty names and privacy-risk cancellation", () => {
  const empty = createHarness({ packageSkill: { name: "   " } });
  assert.equal(empty.controller.exportPackage(), null);
  assert.deepEqual(empty.toasts[0], { message: "请先填写执笔人名称", tone: "warn" });

  const cancelled = createHarness({
    packageName: "Risky Writer",
    packageData: {
      schema: "mowen.skill.package.v1",
      skill: { name: "Risky Writer", handle: "risky", apiKey: "sk-abcdefghijklmnopqrstuvwxyz" },
    },
    confirm: () => false,
  });
  const result = cancelled.controller.exportPackage();
  assert.equal(result, null);
  assert.equal(cancelled.downloads.length, 0);
  assert.equal(cancelled.toasts.at(-1).tone, "warn");
});

test("exportPackage writes a .skill.json package when confirmation passes", () => {
  const harness = createHarness({ packageName: "Shared Writer" });

  const result = harness.controller.exportPackage();

  assert.equal(result.fileName, "Shared Writer.skill.json");
  assert.equal(harness.downloads[0].type, "application/json;charset=utf-8");
  assert.equal(JSON.parse(harness.downloads[0].content).skill.name, "Shared Writer");
  assert.match(harness.toasts[0].message, /已导出执笔人包到/);
});

test("importPackageFiles imports, cancels duplicates, and reports invalid files", async () => {
  const harness = createHarness({
    prompt: () => "3",
  });
  const files = [
    createFile("ok.skill.json", JSON.stringify({ name: "OK", handle: "ok" })),
    createFile("cancel.skill.json", JSON.stringify({ name: "Cancel", duplicate: { handle: "cancel" } })),
    createFile("bad.skill.json", "{not-json"),
  ];

  const result = await harness.controller.importPackageFiles(files);

  assert.equal(result.importedCount, 1);
  assert.equal(result.cancelledCount, 1);
  assert.deepEqual(result.failed, ["bad.skill.json"]);
  assert.equal(harness.importedPayloads.length, 1);
  assert.deepEqual(harness.calls.find((item) => item[0] === "tab"), ["tab", "style"]);
  assert.match(harness.toasts.at(-1).message, /已导入 1 个执笔人/);
});

test("importPackages clears file input after reading", async () => {
  const harness = createHarness();
  harness.els.importSkillPackageInput.files = [createFile("ok.skill.json", JSON.stringify({ name: "OK" }))];
  harness.els.importSkillPackageInput.value = "C:/fake/ok.skill.json";

  await harness.controller.importPackages({ target: harness.els.importSkillPackageInput });

  assert.equal(harness.els.importSkillPackageInput.value, "");
  assert.equal(harness.importedPayloads.length, 1);
});

test("confirmPackageImport maps duplicate choices and simple confirmation", () => {
  const replace = createHarness({ prompt: () => "1" });
  assert.equal(replace.controller.confirmPackageImport("demo.skill.json", {
    duplicate: { handle: "demo" },
    previewText: "demo",
    sensitiveFindings: [],
  }), "replace");

  const rename = createHarness({ prompt: () => "" });
  assert.equal(rename.controller.confirmPackageImport("demo.skill.json", {
    duplicate: { handle: "demo" },
    previewText: "demo",
    sensitiveFindings: [],
  }), "rename");

  const noDuplicate = createHarness({ confirm: () => false });
  assert.equal(noDuplicate.controller.confirmPackageImport("demo.skill.json", {
    duplicate: null,
    previewText: "demo",
    sensitiveFindings: [],
  }), "cancel");
});

test("isPackageFile only accepts .skill.json files", () => {
  const harness = createHarness();
  assert.equal(harness.controller.isPackageFile({ name: "notice.skill.json" }), true);
  assert.equal(harness.controller.isPackageFile({ name: "notice.json" }), false);
});
