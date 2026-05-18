import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);

const mimeTypes = new Map([
  [".css", "text/css;charset=utf-8"],
  [".html", "text/html;charset=utf-8"],
  [".js", "text/javascript;charset=utf-8"],
  [".json", "application/json;charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

createServer(async (request, response) => {
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
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving static app at http://127.0.0.1:${port}/index.html`);
});
