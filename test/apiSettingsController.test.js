import assert from "node:assert/strict";
import test from "node:test";
import { createApiSettingsController } from "../src/modules/settings/apiSettingsController.js";

function input(value = "") {
  return { value, addEventListener: () => {} };
}

function makeElements() {
  return {
    saveApiBtn: { addEventListener: () => {} },
    testApiBtn: { addEventListener: () => {} },
    clearApiBtn: { addEventListener: () => {} },
    providerSelect: input(),
    baseUrlInput: input(),
    endpointPathInput: input(),
    modelInput: input(),
    apiKeyInput: input(),
    systemPromptInput: input(),
    aiStatus: { textContent: "", className: "" },
    apiSavedLabel: { textContent: "" },
  };
}

test("api settings controller renders and saves normalized settings", () => {
  const state = {
    settings: {
      provider: "openai-compatible",
      baseUrl: "https://api.example.com",
      endpointPath: "/v1/chat",
      model: "model-a",
      apiKey: "old",
      systemPrompt: "system",
    },
  };
  const els = makeElements();
  let persisted = 0;
  const toasts = [];
  const controller = createApiSettingsController({
    state,
    els,
    persist: () => { persisted += 1; },
    toast: (message) => toasts.push(message),
    getApiSettingsLocation: () => "浏览器",
    defaultSystemPrompt: "default prompt",
  });

  controller.renderApiSettings();
  assert.equal(els.baseUrlInput.value, "https://api.example.com");

  els.baseUrlInput.value = "https://api.example.com///";
  els.endpointPathInput.value = "chat/completions";
  els.modelInput.value = "model-b";
  els.apiKeyInput.value = " key ";
  els.systemPromptInput.value = "";
  const saved = controller.saveApiSettings();

  assert.equal(saved.baseUrl, "https://api.example.com");
  assert.equal(saved.endpointPath, "/chat/completions");
  assert.equal(saved.model, "model-b");
  assert.equal(saved.apiKey, "key");
  assert.equal(saved.systemPrompt, "default prompt");
  assert.equal(persisted, 1);
  assert.equal(els.aiStatus.textContent, "已配置");
  assert.match(toasts[0], /接口配置已保存/);
});

test("api settings controller clears settings only after confirmation", () => {
  const state = {
    settings: {
      provider: "openai-compatible",
      baseUrl: "https://api.example.com",
      endpointPath: "/chat",
      model: "model",
      apiKey: "key",
      systemPrompt: "custom",
    },
  };
  const els = makeElements();
  const controller = createApiSettingsController({
    state,
    els,
    confirm: () => false,
    defaultSystemPrompt: "default prompt",
  });

  assert.equal(controller.clearApiSettings(), false);
  assert.equal(state.settings.model, "model");

  const confirmed = createApiSettingsController({
    state,
    els,
    confirm: () => true,
    defaultSystemPrompt: "default prompt",
  });
  assert.equal(confirmed.clearApiSettings(), true);
  assert.equal(state.settings.baseUrl, "");
  assert.equal(state.settings.endpointPath, "/chat/completions");
  assert.equal(state.settings.systemPrompt, "default prompt");
  assert.equal(els.aiStatus.textContent, "未配置");
});

test("api settings controller tests connection through AI client", async () => {
  const state = { settings: {} };
  const els = makeElements();
  els.baseUrlInput.value = "https://api.example.com";
  els.endpointPathInput.value = "/chat/completions";
  els.modelInput.value = "model";
  const progressMessages = [];
  const toasts = [];
  const controller = createApiSettingsController({
    state,
    els,
    callAiWithRetry: async (messages) => {
      assert.equal(messages[1].content, "请只回复：连接正常");
      return "连接正常";
    },
    withProgress: async (_message, task) => task({ update: (message) => progressMessages.push(message) }),
    toast: (message) => toasts.push(message),
  });

  await controller.testApiSettings();

  assert.deepEqual(progressMessages, ["正在发送连通性请求", "接口已返回响应"]);
  assert.equal(toasts.some((message) => /接口返回：连接正常/.test(message)), true);
});
