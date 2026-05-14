import {
  AI_MAX_RETRIES,
  AI_REQUEST_TIMEOUT_MS,
  AI_RETRY_BASE_DELAY_MS,
} from "../../config/constants.js";
import { parseLooseJson } from "../../utils/formatters.js";
import { normalizeEndpointPath } from "../../utils/helpers.js";

export function createAiClient({ getSettings, notify = () => {} }) {
  async function callAi(messages, options = {}) {
    const settings = getSettings() || {};
    if (!settings.baseUrl || !settings.model) {
      throw new Error("请先在“接口”中配置 Base URL 和模型。");
    }

    const endpointPath = normalizeEndpointPath(settings.endpointPath);
    const url = `${settings.baseUrl.replace(/\/+$/, "")}${endpointPath}`;
    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || AI_REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: options.temperature ?? 0.35,
        }),
      });
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("AI 请求超时");
        timeoutError.code = "timeout";
        timeoutError.retryable = true;
        throw timeoutError;
      }
      const networkError = new Error("AI 接口无法连接");
      networkError.cause = error;
      networkError.retryable = true;
      throw networkError;
    } finally {
      window.clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = new Error(`AI 接口返回 ${response.status}：${text.slice(0, 180) || response.statusText}`);
      error.status = response.status;
      error.responseText = text;
      error.retryAfter = response.headers.get("retry-after");
      error.retryable = isRetryableStatus(response.status);
      throw error;
    }

    const data = await response.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.output_text ||
      data?.content;
    if (!content) {
      throw new Error("AI 接口未返回可用文本。");
    }
    return String(content).trim();
  }

  async function callAiWithRetry(messages, options = {}, maxRetries = AI_MAX_RETRIES) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return await callAi(messages, options);
      } catch (error) {
        lastError = error;
        const friendly = friendlyAiErrorMessage(error);
        const shouldRetry = attempt < maxRetries - 1 && shouldRetryAiError(error);
        if (!shouldRetry) {
          throw new Error(friendly);
        }
        const delayMs = getRetryDelayMs(error, attempt);
        notify(`${friendly}，${Math.round(delayMs / 1000)} 秒后重试（${attempt + 2}/${maxRetries}）`, "warn");
        await sleep(delayMs);
      }
    }
    throw new Error(friendlyAiErrorMessage(lastError));
  }

  async function callAiJsonWithRepair(messages, label, options = {}) {
    const first = await callAiWithRetry(messages, { temperature: options.temperature ?? 0.15 });
    const parsed = parseLooseJson(first);
    if (parsed.ok) return parsed.value;

    const repairMessages = [
      ...messages,
      { role: "assistant", content: first.slice(0, 12000) },
      {
        role: "user",
        content: `上一次“${label}”不是有效 JSON。请修复为严格 JSON：不加 Markdown、不加解释、不要尾随逗号、字符串必须用双引号。`,
      },
    ];
    const second = await callAiWithRetry(repairMessages, { temperature: 0 });
    const repaired = parseLooseJson(second);
    if (repaired.ok) return repaired.value;
    throw new Error(`${label} 解析失败，请重试或检查模型输出格式。`);
  }

  return {
    callAi,
    callAiWithRetry,
    callAiJsonWithRepair,
    friendlyAiErrorMessage,
    sleep,
  };
}

export function friendlyAiErrorMessage(error) {
  const message = String(error?.message || "");
  const status = error?.status || Number(message.match(/\b(401|403|404|408|409|429|500|502|503|504)\b/)?.[1]);
  if (status === 401 || status === 403) return "API Key 无效或无权限，请检查接口配置";
  if (status === 404) return "AI 接口地址或模型不存在，请检查 Base URL、Endpoint Path 和模型名称";
  if (status === 429) return "请求过于频繁或额度不足";
  if (status >= 500) return "AI 服务暂时不可用";
  if (error?.code === "timeout" || /timeout|超时|AbortError/i.test(message)) return "AI 请求超时";
  if (/Failed to fetch|无法连接|NetworkError|Load failed/i.test(message)) {
    return "AI 接口无法连接，请检查网络、Base URL 或跨域设置";
  }
  if (/Base URL|模型/.test(message)) return message;
  return message || "AI 调用失败，请稍后重试";
}

function shouldRetryAiError(error) {
  if (error?.retryable) return true;
  const message = String(error?.message || "");
  return /timeout|超时|无法连接|Failed to fetch|NetworkError|Load failed/i.test(message);
}

function isRetryableStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function getRetryDelayMs(error, attempt) {
  const retryAfter = Number(error?.retryAfter || 0);
  if (retryAfter > 0) return retryAfter * 1000;
  return AI_RETRY_BASE_DELAY_MS * (attempt + 1);
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
