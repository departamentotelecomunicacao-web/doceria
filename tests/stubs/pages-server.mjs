// Servidor estático que imita o GitHub Pages para os testes E2E:
// - arquivo existente -> 200
// - diretório com index.html -> 200
// - qualquer outra rota -> 404.html com status 404 (o app SPA assume a rota)
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.env.PAGES_ROOT ?? "dist";
const port = Number(process.env.PAGES_PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
};

function send(res, file, status = 200) {
  // O GitHub Pages responde com Access-Control-Allow-Origin: * (necessário
  // para iframes em sandbox sem allow-same-origin carregarem os módulos JS).
  res.writeHead(status, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const target = join(root, path);
    if (existsSync(target) && statSync(target).isFile()) return send(res, target);
    const index = join(target, "index.html");
    if (existsSync(index)) return send(res, index);
    send(res, join(root, "404.html"), 404);
  })
  .listen(port, "127.0.0.1", () => console.log(`pages-server em http://127.0.0.1:${port} (${root})`));
