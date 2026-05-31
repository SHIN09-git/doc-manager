import { DEFAULT_SYSTEM_PROMPT } from "../../config/constants.js";
import { normalizeEndpointPath } from "../../utils/helpers.js";

const DEFAULT_SETTINGS = {
  provider: "openai-compatible",
  baseUrl: "",
  endpointPath: "/chat/completions",
  model: "",
  apiKey: "",
};

export function createApiSettingsController(deps = {}) {
  const {
    state,
    els,
    persist = () => {},
    toast = () => {},
    callAiWithRetry = async () => "",
    withLoading = async (_button, _text, task) => task(),
    withProgress = async (_message, task) => task({ update: () => {} }),
    getApiSettingsLocation = () => "本机接口配置",
    confirm = (message) => globalThis.window?.confirm?.(message) ?? true,
    defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT,
  } = deps;

  function bindEvents() {
    els.saveApiBtn?.addEventListener("click", saveApiSettings);
    els.testApiBtn?.addEventListener("click", testApiSettings);
    els.clearApiBtn?.addEventListener("click", clearApiSettings);
  }

  function renderApiSettings() {
    const settings = state.settings || {};
    els.providerSelect.value = settings.provider || DEFAULT_SETTINGS.provider;
    els.baseUrlInput.value = settings.baseUrl || "";
    els.endpointPathInput.value = settings.endpointPath || DEFAULT_SETTINGS.endpointPath;
    els.modelInput.value = settings.model || "";
    els.apiKeyInput.value = settings.apiKey || "";
    els.systemPromptInput.value = settings.systemPrompt || defaultSystemPrompt;
  }

  function saveApiSettings() {
    state.settings = readSettingsFromInputs();
    persist();
    updateAiStatus();
    toast(`接口配置已保存到：${getApiSettingsLocation()}`);
    return state.settings;
  }

  async function testApiSettings() {
    saveApiSettings();
    await withLoading(els.testApiBtn, "测试中", async () => withProgress("正在测试 AI 接口", async (progress) => {
      progress.update("正在发送连通性请求", 35);
      const reply = await callAiWithRetry([
        { role: "system", content: "你是接口连通性测试助手。" },
        { role: "user", content: "请只回复：连接正常" },
      ]);
      progress.update("接口已返回响应", 90);
      toast(`接口返回：${String(reply).slice(0, 40)}`);
      return reply;
    }));
  }

  function clearApiSettings() {
    const ok = confirm("清除本机保存的 AI 接口配置？");
    if (!ok) return false;
    state.settings = {
      ...DEFAULT_SETTINGS,
      systemPrompt: defaultSystemPrompt,
    };
    persist();
    renderApiSettings();
    updateAiStatus();
    toast("已清除接口配置", "warn");
    return true;
  }

  function updateAiStatus() {
    const ready = Boolean(state.settings?.baseUrl && state.settings?.model);
    const cloudProxy = ready && state.settings?.credentials === "include" && state.settings?.endpointPath === "/ai/chat";
    els.aiStatus.textContent = cloudProxy ? "云端代理" : ready ? "已配置" : "未配置";
    els.aiStatus.className = `status-pill ${ready ? "ready" : ""}`;
    els.apiSavedLabel.textContent = cloudProxy ? "云端代理已启用" : ready ? "本机已保存" : "待配置";
  }

  function readSettingsFromInputs() {
    return {
      provider: els.providerSelect.value || DEFAULT_SETTINGS.provider,
      baseUrl: els.baseUrlInput.value.trim().replace(/\/+$/, ""),
      endpointPath: normalizeEndpointPath(els.endpointPathInput.value),
      model: els.modelInput.value.trim(),
      apiKey: els.apiKeyInput.value.trim(),
      systemPrompt: els.systemPromptInput.value.trim() || defaultSystemPrompt,
    };
  }

  return {
    bindEvents,
    renderApiSettings,
    saveApiSettings,
    testApiSettings,
    clearApiSettings,
    updateAiStatus,
    readSettingsFromInputs,
  };
}
