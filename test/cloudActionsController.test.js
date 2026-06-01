import assert from "node:assert/strict";
import test from "node:test";
import { createCloudActionsController } from "../src/modules/cloud/cloudActionsController.js";

function element(initial = {}) {
  return {
    value: "",
    listeners: {},
    focusCount: 0,
    ...initial,
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    focus() {
      this.focusCount += 1;
    },
  };
}

function createEls(overrides = {}) {
  return {
    cloudManualOrderBtn: element(),
    cloudManualPackageSelect: element({ value: "pro-credit-100" }),
    cloudManualPaymentMethodSelect: element({ value: "alipay" }),
    cloudManualOrderNoteInput: element({ value: "付款备注" }),
    cloudManualProofInput: element({ value: "" }),
    cloudExportDataBtn: element(),
    cloudDeleteAccountBtn: element(),
    cloudSendFeedbackBtn: element(),
    cloudFeedbackInput: element({ value: "建议增加通知模板" }),
    ...overrides,
  };
}

function httpError(status, message = "failed") {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createHarness(options = {}) {
  const state = {
    cloud: {
      authenticated: true,
      user: { email: "owner@example.com" },
      activeOrganization: { id: "org-1", name: "工作区" },
      membership: { role: "owner" },
      billing: { plan: "pro" },
      usage: { request_count: 3 },
      limits: { daily_limit: 10 },
    },
    ...options.state,
  };
  const els = createEls(options.els);
  const requests = [];
  const calls = [];
  const toasts = [];
  const downloads = [];
  const responses = options.responses || {};
  const windowRef = {
    location: { hash: "", href: "" },
    confirm: () => options.confirm ?? true,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    ...options.windowRef,
  };
  const controller = createCloudActionsController({
    state,
    els,
    cloudRequest: async (path, requestOptions = {}) => {
      requests.push({ path, options: requestOptions });
      if (options.cloudRequest) return options.cloudRequest(path, requestOptions, requests.length);
      const response = responses[path];
      if (response instanceof Error) throw response;
      if (typeof response === "function") return response(path, requestOptions, requests.length);
      return response || {};
    },
    withLoading: async (button, label, task) => {
      calls.push(["loading", label, button]);
      return task();
    },
    persist: () => calls.push(["persist"]),
    renderCloudPanel: () => calls.push(["render"]),
    renderCloudManualPaymentMethods: () => calls.push(["render-manual-payment"]),
    downloadBlob: (fileName, content, type) => downloads.push({ fileName, content, type }),
    toast: (message, type) => toasts.push({ message, type }),
    switchTab: (tabName) => calls.push(["tab", tabName]),
    switchMainView: (viewName) => calls.push(["main-view", viewName]),
    windowRef,
    dateProvider: () => new Date("2026-06-01T12:00:00.000Z"),
  });
  return { controller, state, els, requests, calls, toasts, downloads, windowRef };
}

test("bindEvents wires cloud actions once and handles initial hash route", async () => {
  const harness = createHarness({ windowRef: { location: { hash: "#cloud", href: "" } } });

  harness.controller.bindEvents();
  harness.controller.bindEvents();

  assert.equal(harness.els.cloudManualOrderBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudManualPackageSelect.listeners.change.length, 1);
  assert.equal(harness.els.cloudManualPaymentMethodSelect.listeners.change.length, 1);
  assert.equal(harness.els.cloudExportDataBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudDeleteAccountBtn.listeners.click.length, 1);
  assert.equal(harness.els.cloudSendFeedbackBtn.listeners.click.length, 1);
  assert.equal(harness.windowRef.listeners.hashchange.length, 1);
  assert.ok(harness.calls.some((item) => item[0] === "main-view" && item[1] === "cloud"));

  await harness.els.cloudManualPackageSelect.listeners.change[0]();
  assert.ok(harness.calls.some((item) => item[0] === "render-manual-payment"));
});

test("refreshCloudUsage stores usage and can stay silent", async () => {
  const harness = createHarness({
    responses: { "/usage/current": { usage: { request_count: 9 }, limits: { daily_limit: 20 } } },
  });

  await harness.controller.refreshCloudUsage({ silent: true });

  assert.deepEqual(harness.state.cloud.usage, { request_count: 9 });
  assert.deepEqual(harness.state.cloud.limits, { daily_limit: 20 });
  assert.deepEqual(harness.toasts, []);
});

test("refreshCloudBilling falls back to manual orders for non-admin users", async () => {
  const harness = createHarness({
    responses: {
      "/billing/summary": httpError(403, "forbidden"),
      "/billing/manual-orders": {
        manual_payment: { enabled: true },
        orders: [{ id: "order-1" }],
        credits: { balance: 88 },
        credit_ledger: [{ id: "ledger-1" }],
      },
    },
  });

  const billing = await harness.controller.refreshCloudBilling();

  assert.equal(billing.checkout.enabled, false);
  assert.equal(billing.manual_orders[0].id, "order-1");
  assert.equal(harness.state.cloud.billing.credits.balance, 88);
  assert.deepEqual(harness.toasts, []);
});

test("refreshCloudBilling clears stale billing and warns on readable failures", async () => {
  const harness = createHarness({
    responses: { "/billing/summary": httpError(500, "server down") },
  });

  const billing = await harness.controller.refreshCloudBilling();

  assert.equal(billing, null);
  assert.equal(harness.state.cloud.billing, null);
  assert.equal(harness.toasts.at(-1).type, "warn");
});

test("cloudSubmitManualOrder validates proof info and refreshes billing after submit", async () => {
  const invalid = createHarness({
    els: {
      cloudManualOrderNoteInput: element({ value: " " }),
      cloudManualProofInput: element({ value: "" }),
    },
  });

  assert.equal(await invalid.controller.cloudSubmitManualOrder(), null);
  assert.equal(invalid.els.cloudManualOrderNoteInput.focusCount, 1);
  assert.deepEqual(invalid.requests, []);

  const valid = createHarness({
    responses: {
      "/billing/manual-orders": (_path, requestOptions, callNumber) => {
        if (callNumber === 1) return { order: { id: "order-1", title: "100 次额度" } };
        return { manual_payment: {}, orders: [], credits: { balance: 100 }, credit_ledger: [] };
      },
      "/billing/summary": httpError(403, "forbidden"),
    },
  });

  const data = await valid.controller.cloudSubmitManualOrder();

  assert.equal(data.order.id, "order-1");
  assert.equal(valid.requests[0].path, "/billing/manual-orders");
  assert.equal(JSON.parse(valid.requests[0].options.body).payment_channel, "alipay");
  assert.equal(valid.els.cloudManualOrderNoteInput.value, "");
  assert.equal(valid.els.cloudManualProofInput.value, "");
  assert.ok(valid.calls.some((item) => item[0] === "render"));
  assert.match(valid.toasts.at(-1).message, /订单号：order-1/);
});

test("cloudExportMyData downloads a dated JSON export", async () => {
  const harness = createHarness({ responses: { "/me/export": { documents: [{ id: "doc-1" }] } } });

  await harness.controller.cloudExportMyData();

  assert.equal(harness.downloads[0].fileName, "mowen-cloud-export-2026-06-01.json");
  assert.equal(harness.downloads[0].type, "application/json;charset=utf-8");
  assert.deepEqual(JSON.parse(harness.downloads[0].content).documents, [{ id: "doc-1" }]);
  assert.equal(harness.toasts.at(-1).message, "我的云端数据已导出");
});

test("cloudDeleteAccount confirms, deletes remote account, and clears stale billing", async () => {
  const harness = createHarness();

  assert.equal(await harness.controller.cloudDeleteAccount(), true);

  assert.equal(harness.requests[0].path, "/me");
  assert.equal(harness.requests[0].options.method, "DELETE");
  assert.equal(harness.state.cloud.authenticated, false);
  assert.equal(harness.state.cloud.user, null);
  assert.equal(harness.state.cloud.billing, null);
  assert.ok(harness.calls.some((item) => item[0] === "persist"));
  assert.ok(harness.calls.some((item) => item[0] === "render"));

  const cancelled = createHarness({ confirm: false });
  assert.equal(await cancelled.controller.cloudDeleteAccount(), false);
  assert.deepEqual(cancelled.requests, []);
});

test("admin and cloud hash routes route through the proper surfaces", () => {
  const admin = createHarness({ windowRef: { location: { hash: "#admin", href: "" } } });

  assert.equal(admin.controller.handleHashRoute(), true);
  assert.equal(admin.windowRef.location.href, "./admin.html");

  const blocked = createHarness({
    state: { cloud: { authenticated: true, membership: { role: "member" } } },
    windowRef: { location: { hash: "#admin", href: "" } },
  });

  assert.equal(blocked.controller.handleHashRoute(), false);
  assert.equal(blocked.windowRef.location.href, "");
  assert.ok(blocked.calls.some((item) => item[0] === "tab" && item[1] === "cloud"));
  assert.equal(blocked.toasts.at(-1).type, "warn");

  const cloud = createHarness({ windowRef: { location: { hash: "#cloud", href: "" } } });
  assert.equal(cloud.controller.handleHashRoute(), true);
  assert.ok(cloud.calls.some((item) => item[0] === "main-view" && item[1] === "cloud"));
});

test("cloudSendFeedback validates and submits feedback", async () => {
  const invalid = createHarness({ els: { cloudFeedbackInput: element({ value: " " }) } });

  assert.equal(await invalid.controller.cloudSendFeedback(), null);
  assert.equal(invalid.toasts[0].type, "warn");
  assert.deepEqual(invalid.requests, []);

  const valid = createHarness({ responses: { "/feedback": { id: "feedback-1" } } });
  const data = await valid.controller.cloudSendFeedback();

  assert.equal(data.id, "feedback-1");
  assert.equal(valid.requests[0].path, "/feedback");
  assert.deepEqual(JSON.parse(valid.requests[0].options.body), { message: "建议增加通知模板", source: "cloud_panel" });
  assert.equal(valid.els.cloudFeedbackInput.value, "");
  assert.equal(valid.toasts.at(-1).message, "反馈已提交");
});
