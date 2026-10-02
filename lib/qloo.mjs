// Qloo access through the official `qloo mcp` server (from @qloo/qloo-harness).
// The API key never leaves the server process: it is read from QLOO_API_KEY.
//
// Two modes:
//   live — calls Qloo through MCP (needs QLOO_API_KEY)
//   demo — returns hand-written sample data from fixtures/demo.json, clearly
//          flagged as NOT coming from Qloo. Used until the event key arrives.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const QLOO_BIN = path.join(here, "..", "node_modules", ".bin", "qloo");

export function resolveMode() {
  const forced = (process.env.QLOO_MODE || "").toLowerCase();
  if (forced === "demo" || forced === "live") return forced;
  return process.env.QLOO_API_KEY ? "live" : "demo";
}

// ---------- live client ----------
let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const transport = new StdioClientTransport({
        command: QLOO_BIN,
        args: ["mcp"],
        env: process.env, // forward QLOO_API_KEY to the server
      });
      const client = new Client({ name: "memory-lane-agent", version: "0.1.0" });
      await client.connect(transport);
      return client;
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

async function callLive(tool, args) {
  const client = await getClient();
  const res = await client.callTool({ name: tool, arguments: args });
  const env = res.structuredContent ?? {};
  return { status: env.status ?? "error", ...env };
}

// ---------- demo client ----------
let demoData = null;
async function callDemo(tool, args, ctx = {}) {
  if (!demoData) {
    demoData = JSON.parse(await readFile(path.join(here, "..", "fixtures", "demo.json"), "utf8"));
  }
  // Pick the sample persona whose home town matches; fall back to the first one.
  const personas = demoData.personas ?? {};
  const town = String(ctx.demoKey ?? "").toLowerCase();
  const persona = personas[Object.keys(personas).find((k) => town.includes(k)) ?? Object.keys(personas)[0]] ?? {};
  const results =
    tool === "qloo_recommend" ? persona[args.target_type] ?? [] : tool === "qloo_find_tags" ? demoData.tags ?? [] : [];
  return {
    status: results.length ? "ok" : "empty",
    summary: "Demo data (not from Qloo).",
    results,
    result_count: results.length,
    demo: true,
  };
}

// ---------- public API ----------
export async function callQloo(tool, args, ctx = {}) {
  const mode = resolveMode();
  const started = Date.now();
  let envelope;
  try {
    envelope = mode === "live" ? await callLive(tool, args) : await callDemo(tool, args, ctx);
  } catch (err) {
    envelope = {
      status: "error",
      summary: err.message,
      results: [],
      error: { code: "CLIENT", retryable: false, recovery: "Check that the qloo harness is installed." },
    };
  }
  return { tool, args, mode, ms: Date.now() - started, ...envelope };
}

// Results from the harness are envelopes; entity fields vary by type.
// Keep only what the product needs, tolerating missing fields.
export function toEntities(envelope) {
  const raw = Array.isArray(envelope?.results) ? envelope.results : [];
  return raw
    .map((r) => {
      const e = r.entity ?? r;
      const props = e.properties ?? {};
      return {
        id: e.entity_id ?? e.id ?? null,
        name: e.name ?? e.title ?? null,
        type: e.type ?? e.subtype ?? null,
        year: props.release_year ?? props.year ?? e.year ?? null,
        affinity: typeof (r.affinity ?? e.affinity) === "number" ? (r.affinity ?? e.affinity) : null,
        tags: (e.tags ?? []).map((t) => t.name ?? t).filter(Boolean).slice(0, 4),
        address: props.address ?? e.address ?? null,
        why: r.explanation ?? r.why ?? null,
      };
    })
    .filter((e) => e.name);
}

export function toTags(envelope) {
  const raw = Array.isArray(envelope?.results) ? envelope.results : [];
  return raw
    .map((r) => ({ id: r.id ?? r.tag_id ?? r.urn ?? null, name: r.name ?? r.label ?? null }))
    .filter((t) => t.id || t.name);
}
