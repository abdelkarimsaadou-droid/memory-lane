// Builds the public accessibility statement from the latest scan report.
// Usage: node scripts/accessibility-statement.mjs --report a11y-results/report.json --out site
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const REPORT = arg("report", "a11y-results/report.json");
const OUT = arg("out", "site");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const report = JSON.parse(await readFile(REPORT, "utf8").catch(() => "null"));
await mkdir(OUT, { recursive: true });

const open = report ? report.findings.filter((f) => !f.known) : [];
const blocking = open.filter((f) => f.impact === "serious" || f.impact === "critical");
const status = !report
  ? "Not yet assessed"
  : blocking.length
    ? "Partially conformant"
    : open.length
      ? "Substantially conformant (minor issues listed below)"
      : "No known failures in the tested states";

const rows = (report?.states ?? [])
  .map((s) => {
    const n = report.findings.filter((f) => f.state === s.id).length;
    return `<tr><td>${esc(s.title)}</td><td>${s.ok ? (n ? `${n} issue(s)` : "No failures found") : "Not tested: " + esc(s.error)}</td></tr>`;
  })
  .join("\n");

const issues = open.length
  ? `<ul>${open
      .map((f) => `<li><strong>${esc(f.impact)}</strong>: ${esc(f.plain)} <span class="meta">(${esc(f.rule)}; ${esc(f.wcag.join(", "))}; ${esc(f.stateTitle)})</span></li>`)
      .join("")}</ul>`
  : "<p>None in the tested states.</p>";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility statement · Memory Lane</title>
<style>
  :root { --ink:#173f3a; --soft:#46645f; --line:#cfd9d5; --paper:#fff; --mist:#edf1ef; }
  body { margin:0; background:var(--mist); color:var(--ink); font:18px/1.6 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
  h1 { font-size: 2rem; line-height:1.2; margin: 0 0 .5rem; }
  h2 { font-size: 1.25rem; margin-top: 2rem; }
  .status { display:inline-block; background:var(--paper); border:2px solid var(--ink); border-radius:999px; padding:.3rem 1rem; font-weight:700; }
  table { width:100%; border-collapse: collapse; background:var(--paper); }
  th, td { text-align:left; padding:.55rem .7rem; border-bottom:1px solid var(--line); vertical-align: top; }
  .meta { color: var(--soft); font-size: .9rem; }
  a { color: var(--ink); }
</style>
</head>
<body>
<main>
  <h1>Accessibility statement</h1>
  <p>Memory Lane aims to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA, the level referenced by the European standard EN 301 549 and the European Accessibility Act.</p>
  <p class="status">${esc(status)}</p>

  <h2>How this statement is produced</h2>
  <p>Every change to Memory Lane goes through an automated accessibility gate in its GitLab pipeline. The gate opens the app in six real states (desktop, phone, print, English, French, and an error state) and checks each one with axe-core. A change that adds a serious or critical problem cannot reach production. The live site is scanned again every day, and any regression is turned into an issue and a proposed fix by the Curbcut agent. This page is rebuilt from the latest scan${report ? ` (${esc(report.scannedAt)}, ${esc(report.url)})` : ""}.</p>
  <p>Automated testing finds a large share of WCAG failures but not all of them. Keyboard use, screen reader output and plain language are also reviewed by people when the interface changes.</p>

  <h2>Results by page state</h2>
  <table><thead><tr><th>State</th><th>Result</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No scan available yet.</td></tr>'}</tbody></table>

  <h2>Known issues</h2>
  ${issues}

  <h2>Feedback</h2>
  <p>If something in Memory Lane is hard to use, please open an issue in the project repository and describe what you were trying to do. We aim to respond within five working days.</p>

  <p class="meta">Raw data: <a href="report.json">report.json</a></p>
</main>
</body>
</html>
`;
await writeFile(path.join(OUT, "index.html"), html);
if (report) await copyFile(REPORT, path.join(OUT, "report.json"));
console.log(`Accessibility statement written to ${OUT}/index.html (${status}).`);
