import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATIC_FILE_COPIES = [
  ["LICENSE", "LICENSE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["index.html", "index.html"],
  ["admin.html", "admin.html"],
  ["workbench.css", "workbench.css"],
  ["styles.css", "styles.css"],
  ["ui-refresh.css", "ui-refresh.css"],
  ["runtime-config.js", "runtime-config.js"],
  ["build/bundle.js", "build/bundle.js"],
];

export const STATIC_MODULE_ENTRIES = ["src/admin/adminPage.js"];

const RELATIVE_IMPORT_PATTERN =
  /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

export async function buildStaticSite({ root = process.cwd(), dist = path.join(root, "dist") } = {}) {
  await rm(dist, { recursive: true, force: true });

  const fileCopies = await collectStaticFileCopies({ root });
  await Promise.all(fileCopies.map(async ([source, target]) => {
    const outputPath = path.join(dist, target);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await cp(path.join(root, source), outputPath);
  }));

  if (existsSync(path.join(root, "assets"))) {
    await cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
  }

  const runtimeConfig = buildRuntimeConfig(process.env);
  await writeFile(path.join(dist, "runtime-config.js"), serializeRuntimeConfig(runtimeConfig), "utf8");

  return dist;
}

export function buildRuntimeConfig(env = {}) {
  return {
    apiBaseUrl: normalizePublicApiBaseUrl(env.PUBLIC_API_BASE_URL || ""),
  };
}

export function serializeRuntimeConfig(config) {
  const json = JSON.stringify(config, null, 2).replace(/</g, "\\u003c");
  return `globalThis.__MOWEN_RUNTIME_CONFIG__ = Object.freeze(${json});\n`;
}

function normalizePublicApiBaseUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!candidate) return "";
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_API_BASE_URL 必须是完整的 HTTPS API 地址");
  }
  const isLocalHttp = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("PUBLIC_API_BASE_URL 在非本地环境必须使用 HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("PUBLIC_API_BASE_URL 不得包含账号、查询参数或片段");
  }
  return candidate;
}

export async function collectStaticFileCopies({
  root = process.cwd(),
  fileCopies = STATIC_FILE_COPIES,
  moduleEntries = STATIC_MODULE_ENTRIES,
} = {}) {
  const copies = new Map(fileCopies);
  const queue = [...moduleEntries];
  const visited = new Set();

  moduleEntries.forEach((entry) => copies.set(normalizePath(entry), normalizePath(entry)));

  while (queue.length) {
    const source = normalizePath(queue.shift());
    if (visited.has(source)) continue;
    visited.add(source);

    const absolutePath = path.join(root, source);
    if (!existsSync(absolutePath)) {
      throw new Error(`Static module not found: ${source}`);
    }

    const content = await readFile(absolutePath, "utf8");
    for (const specifier of parseRelativeImports(content)) {
      const dependency = resolveRelativeImport(source, specifier);
      if (!existsSync(path.join(root, dependency))) {
        throw new Error(`Static module dependency not found: ${dependency}`);
      }
      copies.set(dependency, dependency);
      if (isJavaScriptModule(dependency)) queue.push(dependency);
    }
  }

  return Array.from(copies.entries());
}

export function parseRelativeImports(content) {
  return Array.from(String(content || "").matchAll(RELATIVE_IMPORT_PATTERN))
    .map((match) => match[1] || match[2])
    .filter(Boolean);
}

export function resolveRelativeImport(source, specifier) {
  const resolved = normalizePath(path.normalize(path.join(path.dirname(source), specifier)));
  return path.extname(resolved) ? resolved : `${resolved}.js`;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isJavaScriptModule(source) {
  return [".js", ".mjs"].includes(path.extname(source));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const dist = await buildStaticSite();
  console.log(`Static site written to ${dist}`);
}
