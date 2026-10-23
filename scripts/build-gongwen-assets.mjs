import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../assets/third-party/lieflat-gongwen/", import.meta.url);
const files = ["SKILL.md", "参数卡.md", "标题技法库.md", "句子对照库.md"];
for (const directory of ["公文语料", "党建语料", "示例"]) {
  const entries = await readdir(new URL(`${directory}/`, root));
  files.push(...entries.filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort().map((name) => `${directory}/${name}`));
}
const documents = {};
const sha256 = {};
for (const name of files) {
  const content = await readFile(new URL(name, root), "utf8");
  documents[name] = content;
  sha256[name] = createHash("sha256").update(content).digest("hex");
}
await writeFile(new URL("bundle.json", root), JSON.stringify({
  source: "https://github.com/larashero3-dotcom/lieflat-gongwen",
  revision: "e0a5aba6b6ce66402aff799ea213af2d987d99dd",
  license: "PolyForm-Noncommercial-1.0.0",
  license_text: await readFile(new URL("LICENSE", root), "utf8"),
  sha256,
  documents,
}, null, 2) + "\n", "utf8");
console.log(`Bundled ${files.length} pinned writing references.`);
