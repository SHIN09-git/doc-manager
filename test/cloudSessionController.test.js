import assert from "node:assert/strict";
import test from "node:test";
import { createCloudSessionController } from "../src/modules/cloud/cloudSessionController.js";

function element(initial = {}) {
  return {
    value: "",
    listeners: {},
    ...initial,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createEls(overrides = {}) {
  return {
    cloudBaseUrlInput: element({ value: " https://api.example.com/api/ " }),
    cloudRefreshBtn: element(),
    cloudLoginBtn: element(),
    cloudRegisterBtn: element(),
    cloudLogoutBtn: element(),
    cloudRequestVerifyBtn: element(),
    cloudVerifyEmailBtn: element(),
    cloudRequestResetBtn: element(),
    cloudConfirmResetBtn: element(),
    cloudLogoutAllBtn: element(),
    cloudEmailInput: element({ value: " owner@example.com " }),
    cloudPasswordInput: element({ value: "secret" }),
    cloudNameInput: element({ value: "王老师" }),
    cloudEmailTokenInput: element(),
    cloudResetTokenInput: element(),
    cloudNewPasswordInput: element({ value: "new-secret" }),
    ...overrides,
  };
}

function createHarness(options = {}) {
  const calls = [];
  const requests = [];
  const toasts = [];
  const state = {
    cloud: {},
    ...options.state,
  };
  const els = createEls(options.els);
  const responses = options.responses || {};
  const controller = createCloudSessionController({
    state,
    els,
    normalizeCloudBaseUrl: (value) => String(value || "").trim().replace(/\/+$/, ""),
    cloudRequest: async (path, requestOptions = {}) => {
      requests.push({ path, options: requestOptions });
      if (options.cloudRequest) return options.cloudRequest(path, requestOptions);
      const response = responses[path];
      if (response instanceof Error) throw response;
      if (typeof response === "function") return response(path, requestOptions);
      return response || {};
    },
    refreshCloudUsage: async (refreshOptions) => calls.push(["usage", refreshOptions]),
    refreshCloudBilling: async (refreshOptions) => calls.push(["billing", refreshOptions]),
    withLoading: async (button, label, task) => {
      calls.push(["loading", label, button]);
      return task();
    },
    persist: () => calls.push(["persist"]),
    renderCloudPanel: () => calls.push(["render"]),
    toast: (message, type) => toasts.push({ message, type }),
    getCloudSettingsLocation: () => "https://api.example.com/api / 当前工作区",
    windowRef: {
      confirm: () => options.confirm ?? true,
    },
  });
  return { controller, state, els, calls, requests, toasts };
}

test("bindEvents wires cloud session controls once", async () => {
  const harness = createHarness({ responses: { "/auth/login": { user: { email: "owner@example.com" } } } });

  harness.controller.bindEvents();
  harness.controller.bindEvents();
  await harness.els.cloudLoginBtn.listeners.click();

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].path, "/auth/login");
  assert.equal(JSON.parse(harness.requests[0].options.body).email, "owner@example.com");
});

test("saveCloudBaseUrlFromInput normalizes, persists, renders, and reports location", () => {
  const harness = createHarness();

  harness.controller.saveCloudBaseUrlFromInput();

  assert.equal(harness.state.cloud.apiBaseUrl, "https://api.example.com/api");
  assert.deepEqual(harness.calls, [["persist"], ["render"]]);
  assert.deepEqual(harness.toasts, [{ message: "云端地址已保存到：https://api.example.com/api / 当前工作区", type: undefined }]);
});

test("applyCloudSession accepts several server response shapes", () => {
  const harness = createHarness();

  const cloud = harness.controller.applyCloudSession({
    authenticated: true,
    user: { email: "owner@example.com" },
    organizations: [{ id: "org-1", name: "一组" }],
    membership: { role: "owner" },
  });

  assert.equal(cloud.authenticated, true);
  assert.equal(cloud.activeOrganization.id, "org-1");
  assert.equal(cloud.membership.role, "owner");
});

test("refreshCloudStatus loads session and usage when authenticated", async () => {
  const harness = createHarness({
    responses: {
      "/me": {
        user: { email: "owner@example.com" },
        organization: { id: "org-1", name: "工作区" },
        membership: { role: "admin" },
      },
    },
  });

  await harness.controller.refreshCloudStatus();

  assert.equal(harness.state.cloud.authenticated, true);
  assert.equal(harness.state.cloud.apiBaseUrl, "https://api.example.com/api");
  assert.deepEqual(harness.requests.map((item) => item.path), ["/me"]);
  assert.deepEqual(harness.calls.map((item) => item[0]), ["loading", "usage", "billing", "persist", "render"]);
  assert.equal(harness.toasts.at(-1).message, "云端状态已刷新");
});

test("refreshCloudStatus clears volatile cloud data on connection failure", async () => {
  const harness = createHarness({
    state: { cloud: { authenticated: true, user: { email: "old@example.com" }, usage: { request_count: 1 }, billing: { plan: "pro" } } },
    responses: { "/me": new Error("server down") },
  });

  const result = await harness.controller.refreshCloudStatus();

  assert.equal(result, null);
  assert.equal(harness.state.cloud.authenticated, false);
  assert.equal(harness.state.cloud.user, null);
  assert.equal(harness.state.cloud.usage, null);
  assert.equal(harness.state.cloud.billing, null);
  assert.equal(harness.toasts.at(-1).type, "error");
});

test("cloudLogin and cloudRegister submit credentials and refresh cloud summaries", async () => {
  const harness = createHarness({
    responses: {
      "/auth/login": { user: { email: "owner@example.com" }, email_verification_token: "verify-token" },
      "/auth/register": { user: { email: "owner@example.com" }, organization: { id: "org-1" } },
    },
  });

  await harness.controller.cloudLogin();
  await harness.controller.cloudRegister();

  assert.equal(harness.els.cloudEmailTokenInput.value, "verify-token");
  assert.deepEqual(harness.requests.map((item) => item.path), ["/auth/login", "/auth/register"]);
  assert.equal(JSON.parse(harness.requests[0].options.body).password, "secret");
  assert.equal(JSON.parse(harness.requests[1].options.body).organizationName, "王老师工作区");
  assert.equal(harness.calls.filter((item) => item[0] === "usage").length, 2);
  assert.equal(harness.calls.filter((item) => item[0] === "billing").length, 2);
});

test("logout actions reset local cloud session", async () => {
  const harness = createHarness({
    state: { cloud: { authenticated: true, user: { email: "owner@example.com" }, members: [{ id: "m1" }], billing: { plan: "pro" } } },
  });

  await harness.controller.cloudLogout();

  assert.equal(harness.state.cloud.authenticated, false);
  assert.deepEqual(harness.state.cloud.members, []);
  assert.equal(harness.requests[0].path, "/auth/logout");

  harness.state.cloud.authenticated = true;
  await harness.controller.cloudLogoutAllDevices();

  assert.equal(harness.state.cloud.authenticated, false);
  assert.equal(harness.requests[1].path, "/auth/logout-all");

  const cancelled = createHarness({ confirm: false });
  assert.equal(await cancelled.controller.cloudLogoutAllDevices(), false);
  assert.deepEqual(cancelled.requests, []);
});

test("email verification and password reset validate input and update token fields", async () => {
  const harness = createHarness({
    responses: {
      "/auth/request-email-verification": { email_verification_token: "email-token" },
      "/auth/verify-email": { user: { email: "verified@example.com", email_verified_at: "now" } },
      "/auth/request-password-reset": { reset_token: "reset-token" },
      "/auth/reset-password": {},
    },
  });

  await harness.controller.cloudRequestEmailVerification();
  assert.equal(harness.els.cloudEmailTokenInput.value, "email-token");

  await harness.controller.cloudVerifyEmail();
  assert.equal(harness.toasts.at(-1).message, "邮箱已验证");
  assert.equal(harness.state.cloud.user.email, "verified@example.com");

  await harness.controller.cloudRequestPasswordReset();
  assert.equal(harness.els.cloudResetTokenInput.value, "reset-token");

  await harness.controller.cloudConfirmPasswordReset();
  assert.equal(harness.els.cloudResetTokenInput.value, "");
  assert.equal(harness.els.cloudNewPasswordInput.value, "");
});

test("email and password flows warn before incomplete requests", async () => {
  const verify = createHarness({ els: { cloudEmailTokenInput: element({ value: "" }) } });
  assert.equal(await verify.controller.cloudVerifyEmail(), null);
  assert.equal(verify.toasts[0].type, "warn");
  assert.deepEqual(verify.requests, []);

  const reset = createHarness({ els: { cloudEmailInput: element({ value: "" }) } });
  assert.equal(await reset.controller.cloudRequestPasswordReset(), null);
  assert.equal(reset.toasts[0].type, "warn");
  assert.deepEqual(reset.requests, []);

  const confirm = createHarness({ els: { cloudResetTokenInput: element({ value: "" }) } });
  assert.equal(await confirm.controller.cloudConfirmPasswordReset(), null);
  assert.equal(confirm.toasts[0].type, "warn");
  assert.deepEqual(confirm.requests, []);
});
