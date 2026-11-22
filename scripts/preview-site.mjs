import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Read the current build on every request, including newly hashed assets.
// A long-lived preview must not retain a startup-only static resource index.
const site = process.argv[2];
if (site !== "docs" && site !== "website") throw new Error("Expected docs or website preview");
const portAt = process.argv.indexOf("--port");
const port = portAt >= 0 ? Number(process.argv[portAt + 1]) : site === "docs" ? 4174 : 4173;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid preview port");
const root = resolve(dirname(fileURLToPath(import.meta.url)), `../apps/${site}/dist`);
const rootPath = await realpath(root);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".zip": "application/zip",
  ".tgz": "application/gzip",
};
const inside = (path) => {
  const part = relative(rootPath, path);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};
const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    let file = resolve(rootPath, `.${pathname}`);
    if (!inside(file)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    file = await realpath(file);
    if (!inside(file)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(404, { "Cache-Control": "no-store" }).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`${site} preview: http://127.0.0.1:${port}/`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
