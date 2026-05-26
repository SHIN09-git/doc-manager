import { createApp } from "./app.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

loadDotEnv();
const server = createApp();

server.listen(server.env.port, server.env.host, () => {
  console.log(`Mowen commercial API listening at http://${server.env.host}:${server.env.port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down commercial API...`);
  server.close(() => process.exit());
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function loadDotEnv() {
  const candidates = [path.resolve("server/.env"), path.resolve(".env")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return;
  const text = readFileSync(file, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) return;
    process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  });
}
