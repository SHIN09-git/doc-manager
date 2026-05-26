import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("server");
const files = [];

function collect(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) collect(full);
    else if (full.endsWith(".js") || full.endsWith(".mjs")) files.push(full);
  }
}

collect(path.join(root, "src"));
collect(path.join(root, "tests"));
collect(path.join(root, "scripts"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Checked ${files.length} server files.`);
