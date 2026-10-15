import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";

async function listScripts(dir) {
  const entries = await readdir(new URL(dir, import.meta.url), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) return listScripts(`${path}/`);
    return entry.name.endsWith(".js") ? [path] : [];
  }));
  return files.flat();
}

test("every data-lucide icon used by the workbench is registered", async () => {
  const iconSource = await readFile(new URL("../src/ui/icons.js", import.meta.url), "utf8");
  const registered = new Set([...iconSource.matchAll(/^\s+"?([a-z0-9-]+)"?:\s*'/gm)].map((match) => match[1]));
  const sources = ["../index.html", "../app.js", ...(await listScripts("../src/"))];
  const used = new Set();
  for (const source of sources) {
    const text = await readFile(new URL(source, import.meta.url), "utf8");
    for (const match of text.matchAll(/data-lucide=["']([a-z0-9-]+)/g)) used.add(match[1]);
  }
  assert.ok(used.size > 30, `expected to find the workbench icons, found ${used.size}`);
  const missing = [...used].filter((name) => !registered.has(name)).sort();
  assert.deepEqual(missing, [], "Unregistered icons fall back to the sparkles glyph");
});
