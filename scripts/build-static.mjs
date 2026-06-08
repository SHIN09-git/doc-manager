import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATIC_FILE_COPIES = [
  ["index.html", "index.html"],
  ["admin.html", "admin.html"],
  ["styles.css", "styles.css"],
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

  return dist;
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
