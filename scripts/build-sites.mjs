import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const distDir = path.join(root, "dist");
const workerSource = path.join(root, "sites", "worker.js");
const hostingSource = path.join(root, ".openai", "hosting.json");

await requireFile(path.join(distDir, "index.html"), "请先生成静态站点");
await requireFile(workerSource, "缺少 Sites Worker 入口");
await requireFile(hostingSource, "缺少 Sites 托管配置");

await mkdir(path.join(distDir, "server"), { recursive: true });
await mkdir(path.join(distDir, ".openai"), { recursive: true });
await cp(workerSource, path.join(distDir, "server", "index.js"));
await cp(hostingSource, path.join(distDir, ".openai", "hosting.json"));

console.log(`Sites deployment build written to ${distDir}`);

async function requireFile(target, message) {
  try {
    if ((await stat(target)).isFile()) return;
  } catch {
    // Use the actionable error below.
  }
  throw new Error(`${message}: ${target}`);
}
