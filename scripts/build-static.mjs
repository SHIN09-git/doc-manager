import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATIC_FILE_COPIES = [
  ["index.html", "index.html"],
  ["admin.html", "admin.html"],
  ["styles.css", "styles.css"],
  ["build/bundle.js", "build/bundle.js"],
  ["src/admin/adminPage.js", "src/admin/adminPage.js"],
  ["src/modules/cloud/billingFormatters.js", "src/modules/cloud/billingFormatters.js"],
];

export async function buildStaticSite({ root = process.cwd(), dist = path.join(root, "dist") } = {}) {
  await rm(dist, { recursive: true, force: true });

  await Promise.all(STATIC_FILE_COPIES.map(async ([source, target]) => {
    const outputPath = path.join(dist, target);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await cp(path.join(root, source), outputPath);
  }));

  if (existsSync(path.join(root, "assets"))) {
    await cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
  }

  return dist;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const dist = await buildStaticSite();
  console.log(`Static site written to ${dist}`);
}
