// Minimal web server: serves the page and one JSON endpoint.
// The browser never talks to Qloo directly; the key stays on the server.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "./lib/agent.mjs";
import { resolveMode, warmUp } from "./lib/qloo.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

// Small per-IP limiter so a public demo cannot burn the event quota.
const hits = new Map();
const allow = (ip) => {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length <= 6;
};

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 20_000) reject(new Error("Body too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, mode: resolveMode() });
    }
    if (req.method === "POST" && url.pathname === "/api/session") {
      if (!allow(req.socket.remoteAddress)) return send(res, 429, { error: "Too many requests, wait a minute." });
      const profile = JSON.parse((await readBody(req)) || "{}");
      return send(res, 200, await runAgent(profile));
    }
    if (req.method === "GET") {
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
      const full = path.join(here, "public", safe);
      if (!full.startsWith(path.join(here, "public"))) return send(res, 403, { error: "Forbidden" });
      const body = await readFile(full).catch(() => null);
      if (!body) return send(res, 404, { error: "Not found" });
      return send(res, 200, body, TYPES[path.extname(full)] ?? "application/octet-stream");
    }
    send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Memory Lane running on http://localhost:${PORT} (Qloo mode: ${resolveMode()})`);
  // Start the Qloo MCP server now so the first visitor does not wait for it.
  warmUp().catch((err) => console.error("Qloo warm-up failed:", err.message));
});
