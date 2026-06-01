import assert from "node:assert/strict";
import test from "node:test";
import { createViewController } from "../src/ui/viewController.js";

function classList(initial = []) {
  const set = new Set(initial);
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    toggle(name, force) {
      const enabled = force === undefined ? !set.has(name) : Boolean(force);
      if (enabled) set.add(name);
      else set.delete(name);
      return enabled;
    },
    contains(name) {
      return set.has(name);
    },
  };
}

function element(options = {}) {
  return {
    id: options.id || "",
    dataset: options.dataset || {},
    classList: classList(options.classes || []),
    listeners: {},
    attributes: {},
    hidden: Boolean(options.hidden),
    focusCount: 0,
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    focus(options) {
      this.focusCount += 1;
      this.focusOptions = options;
    },
  };
}

function createDocumentRef(tabs, panels) {
  const tabsRoot = element();
  return {
    tabsRoot,
    getElementById(id) {
      return [...tabs, ...panels].find((item) => item.id === id) || null;
    },
    querySelector(selector) {
      if (selector === ".tabs") return tabsRoot;
      if (selector === ".tab-panel.active:not(#pptPanel)") {
        return panels.find((panel) => panel.id !== "pptPanel" && panel.classList.contains("active")) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".tab") return tabs;
      if (selector === ".tab-panel") return panels;
      return [];
    },
  };
}

function clickTarget(tabName) {
  return {
    closest: () => ({ dataset: { tab: tabName } }),
  };
}

function createHarness(options = {}) {
  const tabs = [
    element({ dataset: { tab: "generate" } }),
    element({ dataset: { tab: "style" }, classes: ["active"] }),
    element({ dataset: { tab: "api" } }),
    element({ dataset: { tab: "ppt" } }),
  ];
  const panels = [
    element({ id: "generatePanel" }),
    element({ id: "stylePanel", classes: ["active"] }),
    element({ id: "apiPanel" }),
    element({ id: "pptPanel", hidden: true }),
  ];
  const documentRef = createDocumentRef(tabs, panels);
  const calls = [];
  const ui = { mainView: "editor" };
  const els = {
    apiTopBtn: element(),
    cloudTopBtn: element(),
    cloudBackToEditorBtn: element(),
    pptBackToEditorBtn: element(),
    editorPanel: element(),
    cloudPanel: element({ hidden: true }),
    pptPanel: panels.find((panel) => panel.id === "pptPanel"),
    ...options.els,
  };
  const layoutController = {
    openResponsiveTools: () => calls.push(["responsive-tools"]),
    isMobileWorkspace: () => Boolean(options.mobile),
    setMobileView: (view) => calls.push(["mobile", view]),
  };
  const windowRef = {
    lucide: { createIcons: () => calls.push(["icons"]) },
    requestAnimationFrame: (callback) => {
      calls.push(["raf"]);
      callback();
    },
  };
  const controller = createViewController({
    els,
    ui,
    layoutController,
    renderCloudPanel: () => calls.push(["render-cloud"]),
    documentRef,
    windowRef,
  });
  return { controller, tabs, panels, documentRef, calls, ui, els };
}

test("bindEvents wires top buttons, back buttons, and tabs once", () => {
  const harness = createHarness();

  harness.controller.bindEvents();
  harness.controller.bindEvents();

  assert.equal(harness.els.apiTopBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudTopBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudBackToEditorBtn.listeners.click.length, 1);
  assert.equal(harness.els.pptBackToEditorBtn.listeners.click.length, 1);
  assert.equal(harness.documentRef.tabsRoot.listeners.click.length, 1);
});

test("api top button opens the API panel and responsive tools", () => {
  const harness = createHarness();
  harness.controller.bindEvents();

  harness.els.apiTopBtn.listeners.click[0]();

  assert.equal(harness.ui.mainView, "editor");
  assert.equal(harness.panels.find((panel) => panel.id === "apiPanel").classList.contains("active"), true);
  assert.equal(harness.els.apiTopBtn.classList.contains("active"), true);
  assert.deepEqual(harness.calls.filter((item) => item[0] === "responsive-tools"), [["responsive-tools"]]);
});

test("cloud top button toggles cloud view and renders cloud panel", () => {
  const harness = createHarness();
  harness.controller.bindEvents();

  harness.els.cloudTopBtn.listeners.click[0]();

  assert.equal(harness.ui.mainView, "cloud");
  assert.equal(harness.els.cloudPanel.hidden, false);
  assert.equal(harness.els.cloudTopBtn.attributes["aria-pressed"], "true");
  assert.equal(harness.els.apiTopBtn.attributes["aria-pressed"], "false");
  assert.equal(harness.els.cloudPanel.focusCount, 1);
  assert.ok(harness.calls.filter((item) => item[0] === "render-cloud").length >= 1);

  harness.els.cloudTopBtn.listeners.click[0]();
  assert.equal(harness.ui.mainView, "editor");
  assert.equal(harness.els.cloudPanel.hidden, true);
});

test("tab clicks switch regular panels and mobile tools view", () => {
  const harness = createHarness({ mobile: true });
  harness.controller.bindEvents();

  const handled = harness.controller.handleTabClick({ target: clickTarget("generate") });

  assert.equal(handled, true);
  assert.equal(harness.ui.mainView, "editor");
  assert.equal(harness.panels.find((panel) => panel.id === "generatePanel").classList.contains("active"), true);
  assert.equal(harness.tabs.find((tab) => tab.dataset.tab === "generate").attributes["aria-selected"], "true");
  assert.deepEqual(harness.calls.filter((item) => item[0] === "mobile"), [["mobile", "tools"]]);
});

test("ppt tab opens the PPT main view and focuses the panel", () => {
  const harness = createHarness({ mobile: true });

  harness.controller.switchTab("ppt");

  assert.equal(harness.ui.mainView, "ppt");
  assert.equal(harness.els.pptPanel.hidden, false);
  assert.equal(harness.els.pptPanel.classList.contains("active"), true);
  assert.equal(harness.tabs.find((tab) => tab.dataset.tab === "ppt").attributes["aria-selected"], "true");
  assert.deepEqual(harness.calls.filter((item) => item[0] === "mobile"), [["mobile", "editor"]]);
  assert.equal(harness.els.pptPanel.focusCount, 1);
});

test("editor main view falls back to style tab when no regular panel is active", () => {
  const harness = createHarness();
  harness.panels.forEach((panel) => panel.classList.remove("active"));
  harness.els.pptPanel.classList.add("active");

  harness.controller.switchMainView("editor");

  assert.equal(harness.ui.mainView, "editor");
  assert.equal(harness.panels.find((panel) => panel.id === "stylePanel").classList.contains("active"), true);
  assert.equal(harness.tabs.find((tab) => tab.dataset.tab === "style").attributes["aria-selected"], "true");
  assert.equal(harness.els.editorPanel.attributes["aria-label"], "文档编辑");
});

test("unknown regular tab leaves the current active panel intact after returning to editor", () => {
  const harness = createHarness();

  harness.controller.switchTab("missing");

  assert.equal(harness.ui.mainView, "editor");
  assert.equal(harness.panels.find((panel) => panel.id === "stylePanel").classList.contains("active"), true);
});
