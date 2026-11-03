const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../docs");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
http.createServer((request, response) => {
  const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname.replace(/\/$/, "/index.html"));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "text/plain", "Cache-Control": "no-store" });
    response.end(bytes);
  });
}).listen(5180, "127.0.0.1", () => console.log("Entry preview: http://127.0.0.1:5180"));
