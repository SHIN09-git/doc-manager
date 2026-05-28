import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { closeStaticServer, startStaticServer } from "./serve-static.mjs";

const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
let server = null;

try {
  try {
    ({ server } = await startStaticServer({ host, port }));
  } catch (error) {
    if (error?.code !== "EADDRINUSE") throw error;
    console.warn(`Static server ${host}:${port} is already in use; reusing the existing preview server.`);
  }
  const args = [
    path.join("node_modules", "playwright", "cli.js"),
    "test",
    ...process.argv.slice(2),
  ];
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLAYWRIGHT_NO_WEBSERVER: "1",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  const [code, signal] = await once(child, "exit");
  if (signal) {
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await closeStaticServer(server).catch((error) => {
    console.error("Failed to close e2e static server", error);
    process.exitCode = 1;
  });
}
