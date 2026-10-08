// Live smoke test against Qloo. Prints raw envelopes so result shapes can be checked.
// Needs QLOO_API_KEY in the environment. Never prints the key.
import { callQloo } from "../lib/qloo.mjs";
import { runAgent } from "../lib/agent.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

if (!process.env.QLOO_API_KEY) {
  console.error("QLOO_API_KEY is not set.");
  process.exit(1);
}

const calls = [
  ["qloo_find_tags", { query: "Algiers, Algeria cuisine", limit: 5 }],
  ["qloo_find_tags", { query: "Porto, Portugal cuisine", limit: 5 }],
];

const people = process.env.SKIP_AGENTS ? [] : [
  { firstName: "Jeannine", birthYear: 1938, grewUpIn: "Lyon, France", livesIn: "Paris, France", artists: "Édith Piaf, Bourvil", films: "La Grande Vadrouille", dishes: "Gratin dauphinois", language: "fr" },
  { firstName: "Manuel", birthYear: 1944, grewUpIn: "Porto, Portugal", livesIn: "Paris, France", artists: "Amália Rodrigues", films: "", dishes: "Bacalhau", language: "en" },
  { firstName: "Fatima", birthYear: 1950, grewUpIn: "Algiers, Algeria", livesIn: "Marseille, France", artists: "Dahmane El Harrachi", films: "", dishes: "Couscous", language: "fr" },
];

let failures = 0;
const out = [];
for (const [tool, args] of calls) {
  const r = await callQloo(tool, args);
  if (r.status === "error") failures++;
  out.push(r);
  console.log(`\n===== ${tool} ${JSON.stringify(args)} -> ${r.status} (${r.ms} ms)`);
  console.log(JSON.stringify(r, null, 1).slice(0, 6000));
}
const agents = [];
for (const p of people) {
  const r = await runAgent(p);
  console.log(`\n===== agent ${p.firstName}: ${r.trace.map((t) => t.tool.replace("qloo_", "") + ":" + t.status + "(" + t.count + ")").join(" ")}`);
  agents.push(r);
}
mkdirSync("results", { recursive: true });
writeFileSync("results/agents.json", JSON.stringify(agents, null, 1));
writeFileSync("results/live-check.json", JSON.stringify(out, null, 1));
console.log(`\nDone. ${failures} call(s) returned an error.`);
process.exit(0);
