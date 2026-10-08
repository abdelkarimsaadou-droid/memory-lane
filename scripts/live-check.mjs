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
  ["qloo_recommend", { target_type: "movie", signals: ["La Grande Vadrouille"], signal_location: "France", include_tags: ["urn:tag:keyword:media:1960s"], limit: 15 }],
  ["qloo_recommend", { target_type: "movie", signals: ["La Grande Vadrouille"], signal_location: "France", include_tags: ["urn:tag:interests:qloo:classic_french_cinema"], limit: 15 }],
  ["qloo_recommend", { target_type: "movie", signal_location: "France", include_tags: ["urn:tag:keyword:media:1950s", "urn:tag:interests:qloo:french_cinema"], include_tags_operator: "intersection", limit: 15 }],
  ["qloo_recommend", { target_type: "movie", signal_location: "Portugal", include_tags: ["urn:tag:keyword:media:1950s"], limit: 15 }],
  ["qloo_recommend", { target_type: "movie", signal_location: "Algeria", include_tags: ["urn:tag:keyword:media:1960s"], limit: 15 }],
  ["qloo_find_tags", { query: "1960s", limit: 5 }],
  ["qloo_find_tags", { query: "France music", limit: 5 }],
  ["qloo_find_tags", { query: "Portugal music", limit: 5 }],
  ["qloo_find_tags", { query: "Algeria music", limit: 5 }],
  ["qloo_recommend", { target_type: "artist", signals: ["Amália Rodrigues"], include_tags: ["urn:tag:genre:music:fado"], limit: 12 }],
  ["qloo_recommend", { target_type: "artist", signals: ["Dahmane El Harrachi"], include_tags: ["urn:tag:genre:music:chaabi"], limit: 12 }],
  ["qloo_recommend", { target_type: "artist", signals: ["Dahmane El Harrachi"], limit: 12 }],
  ["qloo_recommend", { target_type: "place", filter_location: "Marseille, France", signal_location: "Marseille, France", include_tags: ["urn:tag:cuisine:qloo:algerian"], limit: 5 }],
  ["qloo_recommend", { target_type: "place", filter_location: "Paris, France", signal_location: "Paris, France", include_tags: ["urn:tag:interests:qloo:portuguese_cuisine"], limit: 5 }],
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
