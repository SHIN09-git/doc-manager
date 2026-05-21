import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), "..");
const defaultPort = Number(process.env.PORT || 4173);

const mimeTypes = new Map([
  [".css", "text/css;charset=utf-8"],
  [".html", "text/html;charset=utf-8"],
  [".js", "text/javascript;charset=utf-8"],
  [".json", "application/json;charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = path.resolve(root, `.${requestedPath}`);
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const info = await stat(filePath);
      const targetPath = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
      response.writeHead(200, {
        "Content-Type": mimeTypes.get(path.extname(targetPath)) || "application/octet-stream",
      });
      createReadStream(targetPath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

export function startStaticServer(options = {}) {
  const port = Number(options.port || defaultPort);
  const host = options.host || "127.0.0.1";
  const server = createStaticServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      console.log(`Serving static app at http://${host}:${port}/index.html`);
      resolve({ server, host, port });
    });
  });
}

export function closeStaticServer(server) {
  return new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

let closing = false;

async function shutdown(signal, server) {
  if (closing) return;
  closing = true;
  console.log(`Static server received ${signal}, shutting down...`);
  const forceExitTimer = setTimeout(() => process.exit(), 1500);
  forceExitTimer.unref();
  try {
    await closeStaticServer(server);
  } catch (error) {
    console.error("Static server shutdown failed", error);
    process.exitCode = 1;
  }
  process.exit();
}

if (path.resolve(process.argv[1] || "") === currentFile) {
  const { server } = await startStaticServer();
  process.on("SIGTERM", () => shutdown("SIGTERM", server));
  process.on("SIGINT", () => shutdown("SIGINT", server));
}
