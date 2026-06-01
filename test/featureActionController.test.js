import assert from "node:assert/strict";
import test from "node:test";
import { createFeatureActionController } from "../src/modules/product/featureActionController.js";

function element(initial = {}) {
  return {
    listeners: {},
    focusCount: 0,
    clickCount: 0,
    ...initial,
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    focus(options) {
      this.focusCount += 1;
      this.focusOptions = options;
    },
    click() {
      this.clickCount += 1;
    },
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  const els = {
    featureMapGrid: element(),
    searchInput: element(),
    contentEditor: element(),
    styleList: element(),
    newStyleBtn: element(),
    generatePrompt: element(),
    pptPromptInput: element(),
    cloudSaveDocBtn: element(),
    cloudManualPackageSelect: element(),
    ...overrides.els,
  };
  const controller = createFeatureActionController({
    els,
    switchMainView: (view) => calls.push(["main", view]),
    switchTab: (tab) => calls.push(["tab", tab]),
    openStandaloneAdminPage: () => {
      calls.push(["admin"]);
      return overrides.adminResult ?? true;
    },
    windowRef: {
      setTimeout: (callback) => callback(),
    },
  });
  return { controller, els, calls };
}

function clickEvent(action) {
  return {
    target: {
      closest: () => ({ dataset: { featureAction: action } }),
    },
  };
}

test("bindEvents wires the feature map once and ignores unknown actions", () => {
  const harness = createHarness();

  harness.controller.bindEvents();
  harness.controller.bindEvents();

  assert.equal(harness.els.featureMapGrid.listeners.click.length, 1);
  assert.equal(harness.els.featureMapGrid.listeners.click[0](clickEvent("missing")), false);
  assert.deepEqual(harness.calls, []);
});

test("document and editor actions open the editor surface and focus the right target", () => {
  const harness = createHarness();

  assert.equal(harness.controller.activateFeature("documents"), true);
  assert.equal(harness.controller.activateFeature("editor"), true);

  assert.deepEqual(harness.calls, [["main", "editor"], ["main", "editor"]]);
  assert.equal(harness.els.searchInput.focusCount, 1);
  assert.equal(harness.els.contentEditor.focusCount, 1);
  assert.deepEqual(harness.els.searchInput.focusOptions, { preventScroll: false });
});

test("writer and draft actions route to the intended right-side tabs", () => {
  const harness = createHarness();

  assert.equal(harness.controller.activateFeature("writer-use"), true);
  assert.equal(harness.controller.activateFeature("writer-build"), true);
  assert.equal(harness.controller.activateFeature("draft"), true);

  assert.deepEqual(harness.calls, [
    ["main", "editor"],
    ["tab", "style"],
    ["main", "editor"],
    ["tab", "style"],
    ["main", "editor"],
    ["tab", "generate"],
  ]);
  assert.equal(harness.els.styleList.focusCount, 1);
  assert.equal(harness.els.newStyleBtn.clickCount, 1);
  assert.equal(harness.els.generatePrompt.focusCount, 1);
});

test("ppt, cloud sync, and billing actions open their dedicated surfaces", () => {
  const harness = createHarness();

  assert.equal(harness.controller.activateFeature("ppt"), true);
  assert.equal(harness.controller.activateFeature("cloud-sync"), true);
  assert.equal(harness.controller.activateFeature("billing"), true);

  assert.deepEqual(harness.calls, [["main", "ppt"], ["main", "cloud"], ["main", "cloud"]]);
  assert.equal(harness.els.pptPromptInput.focusCount, 1);
  assert.equal(harness.els.cloudSaveDocBtn.focusCount, 1);
  assert.equal(harness.els.cloudManualPackageSelect.focusCount, 1);
});

test("admin action delegates to the cloud admin guard", () => {
  const harness = createHarness({ adminResult: false });

  assert.equal(harness.controller.activateFeature("admin"), false);

  assert.deepEqual(harness.calls, [["admin"]]);
});

test("handleFeatureMapAction resolves a known catalog action from the clicked button", () => {
  const harness = createHarness();

  assert.equal(harness.controller.handleFeatureMapAction(clickEvent("draft")), true);

  assert.deepEqual(harness.calls, [["main", "editor"], ["tab", "generate"]]);
  assert.equal(harness.els.generatePrompt.focusCount, 1);
});
