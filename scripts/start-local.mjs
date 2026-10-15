import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_WEB_PORT = 4173;
const DEFAULT_API_PORT = 8787;
const START_TIMEOUT_MS = 15_000;

export async function probeService(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const validate = options.validate || (() => true);
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs || 1500) });
    if (!response.ok) return false;
    return Boolean(await validate(response));
  } catch {
    return false;
  }
}

export async function waitForService(url, options = {}) {
  const timeoutMs = options.timeoutMs || START_TIMEOUT_MS;
  const intervalMs = options.intervalMs || 250;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await probeService(url, options)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`服务启动超时：${url}`);
}

export async function startLocalWorkbench(options = {}) {
  const webPort = Number(options.webPort || process.env.WORKBENCH_PORT || DEFAULT_WEB_PORT);
  const apiPort = Number(options.apiPort || process.env.WORKBENCH_API_PORT || process.env.PORT || DEFAULT_API_PORT);
  const host = options.host || "127.0.0.1";
  const webUrl = `http://${host}:${webPort}/index.html`;
  const apiHealthUrl = `http://${host}:${apiPort}/api/health`;
  const spawnImpl = options.spawnImpl || spawn;
  const ownedChildren = [];

  const webReady = await probeService(webUrl, { validate: (response) => contentTypeIncludes(response, "text/html") });
  const apiReady = await probeService(apiHealthUrl, { validate: validateApiHealth });

  if (!apiReady) {
    ownedChildren.push(spawnImpl(process.execPath, [path.join("server", "src", "server.js")], {
      cwd: process.cwd(),
      env: { ...process.env, HOST: host, PORT: String(apiPort) },
      stdio: "inherit",
      windowsHide: true,
    }));
  } else {
    console.log(`复用本地 API：${apiHealthUrl}`);
  }

  if (!webReady) {
    ownedChildren.push(spawnImpl(process.execPath, [path.join("e2e", "serve-static.mjs")], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(webPort) },
      stdio: "inherit",
      windowsHide: true,
    }));
  } else {
    console.log(`复用工作台页面：${webUrl}`);
  }

  try {
    await Promise.all([
      waitForService(apiHealthUrl, { validate: validateApiHealth }),
      waitForService(webUrl, { validate: (response) => contentTypeIncludes(response, "text/html") }),
    ]);
  } catch (error) {
    stopChildren(ownedChildren);
    throw error;
  }

  console.log(`\n摹文拟笔工作台已就绪：${webUrl}`);
  if (options.openBrowser !== false && process.env.NO_BROWSER !== "1") {
    openBrowser(webUrl, spawnImpl);
  }

  if (ownedChildren.length === 0) return { webUrl, apiHealthUrl, stop: () => {} };
  return new Promise((resolve) => {
    let stopping = false;
    const shutdown = (exitCode = 0) => {
      if (stopping) return;
      stopping = true;
      stopChildren(ownedChildren);
      resolve({ webUrl, apiHealthUrl, exitCode });
    };
    process.once("SIGINT", () => shutdown(0));
    process.once("SIGTERM", () => shutdown(0));
    ownedChildren.forEach((child) => {
      child.once?.("exit", (code, signal) => {
        if (!stopping) {
          console.error(`本地服务意外退出（${signal || code || "unknown"}）`);
          shutdown(code || 1);
        }
      });
    });
  });
}

async function validateApiHealth(response) {
  const body = await response.json().catch(() => null);
  return body?.ok === true && body?.service === "mowen-commercial-api";
}

function contentTypeIncludes(response, expected) {
  return String(response.headers?.get?.("content-type") || "").includes(expected);
}

function openBrowser(url, spawnImpl) {
  try {
    if (process.platform === "win32") {
      const child = spawnImpl("cmd.exe", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once?.("error", () => console.log(`请在浏览器打开：${url}`));
      child.unref?.();
      return;
    }
    const command = process.platform === "darwin" ? "open" : "xdg-open";
    const child = spawnImpl(command, [url], { detached: true, stdio: "ignore" });
    child.once?.("error", () => console.log(`请在浏览器打开：${url}`));
    child.unref?.();
  } catch {
    console.log(`请在浏览器打开：${url}`);
  }
}

function stopChildren(children) {
  children.forEach((child) => {
    if (child && child.exitCode === null && !child.killed) child.kill?.("SIGTERM");
  });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  startLocalWorkbench()
    .then((result) => {
      if (result?.exitCode) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error?.message || error);
      process.exitCode = 1;
    });
}
