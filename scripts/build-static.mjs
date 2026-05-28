import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "build"), { recursive: true });
await mkdir(path.join(dist, "src", "admin"), { recursive: true });

await Promise.all([
  cp(path.join(root, "index.html"), path.join(dist, "index.html")),
  cp(path.join(root, "admin.html"), path.join(dist, "admin.html")),
  cp(path.join(root, "styles.css"), path.join(dist, "styles.css")),
  cp(path.join(root, "build", "bundle.js"), path.join(dist, "build", "bundle.js")),
  cp(path.join(root, "src", "admin", "adminPage.js"), path.join(dist, "src", "admin", "adminPage.js")),
]);

console.log(`Static site written to ${dist}`);
