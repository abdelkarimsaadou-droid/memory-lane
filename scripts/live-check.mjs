// Live smoke test against Qloo. Prints raw envelopes so result shapes can be checked.
// Needs QLOO_API_KEY in the environment. Never prints the key.
import { callQloo } from "../lib/qloo.mjs";

if (!process.env.QLOO_API_KEY) {
  console.error("QLOO_API_KEY is not set.");
  process.exit(1);
}

const calls = [
  ["qloo_capabilities", {}],
  ["qloo_find_tags", { query: "1950s", limit: 3 }],
  ["qloo_find_tags", { query: "Lyon cuisine", limit: 3 }],
  ["qloo_recommend", { target_type: "artist", signals: ["Édith Piaf", "Bourvil"], limit: 5 }],
  ["qloo_recommend", { target_type: "movie", signals: ["La Grande Vadrouille"], limit: 5 }],
  ["qloo_recommend", { target_type: "place", filter_location: "Paris", signals: ["Gratin dauphinois"], limit: 3 }],
];

let failures = 0;
for (const [tool, args] of calls) {
  const r = await callQloo(tool, args);
  if (r.status === "error") failures++;
  console.log(`\n===== ${tool} ${JSON.stringify(args)} -> ${r.status} (${r.ms} ms)`);
  console.log(JSON.stringify(r, null, 1).slice(0, 6000));
}
console.log(`\nDone. ${failures} call(s) returned an error.`);
process.exit(0);
