import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "apps/web/dist/codeguard-web/browser");
const port = Number(process.argv[3] ?? 4200);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", `http://localhost:${port}`).pathname);
  const requested = normalize(join(root, urlPath));
  const candidate = requested.startsWith(root) && existsSync(requested) && statSync(requested).isFile()
    ? requested
    : join(root, "index.html");

  res.setHeader("content-type", contentTypes[extname(candidate)] ?? "application/octet-stream");
  res.setHeader("x-content-type-options", "nosniff");
  createReadStream(candidate).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
