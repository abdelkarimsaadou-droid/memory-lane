// Accessibility scan for Memory Lane.
//
// Opens the app the way people use it (empty form, a validation error, a
// generated session in English and French, a phone-sized screen, the printed
// page) and checks each state against WCAG 2.2 AA with axe-core.
//
// Writes, under --out (default "a11y-results"):
//   report.json        every violation, with the page state it was found in
//   summary.md         plain-language summary for people and for the agent
//   junit.xml          one test per state, so GitLab shows failures in the MR
//   codequality.json   GitLab Code Quality format, for the MR widget
//
// Exit code: 1 when a serious or critical violation is not in the baseline
// (a11y-baseline.json), so the pipeline blocks the release.
//
// Usage: node scripts/a11y-scan.mjs --url http://localhost:3000 [--out dir] [--baseline file] [--update-baseline]
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]);
    return acc;
  }, []),
);
const BASE = String(args.url || process.env.A11Y_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = String(args.out || "a11y-results");
const BASELINE = String(args.baseline || "a11y-baseline.json");
const BLOCKING = new Set(["serious", "critical"]);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Plain-language explanations of the rules most likely to matter here.
const PLAIN = {
  "color-contrast": "Some text is too faint against its background for people with low vision.",
  "image-alt": "An image has no text alternative, so screen-reader users miss it.",
  label: "A form field has no label, so screen-reader users do not know what to type.",
  "button-name": "A button has no name, so screen-reader users hear only 'button'.",
  "link-name": "A link has no readable name.",
  "html-has-lang": "The page does not say which language it is in, so screen readers may mispronounce it.",
  "valid-lang": "The page's language code is not valid.",
  "document-title": "The page has no title, which screen-reader users hear first.",
  "heading-order": "Headings skip levels, which makes the page harder to navigate by headings.",
  region: "Some content sits outside any landmark, so it is easy to miss when navigating by regions.",
  "landmark-one-main": "The page has no main landmark.",
  "target-size": "A control is too small to tap reliably, which matters for older users and tremor.",
  "aria-allowed-attr": "An ARIA attribute is used where it is not allowed.",
  "nested-interactive": "Interactive elements are nested, which confuses keyboard and screen-reader users.",
  "scrollable-region-focusable": "A scrollable area cannot be reached with the keyboard.",
  "list": "A list contains items that are not list items.",
  listitem: "A list item is not inside a list.",
};

const STATES = [
  { id: "home", title: "Home page, empty form", run: async (page) => page.goto(BASE, { waitUntil: "networkidle" }) },
  {
    id: "validation-error",
    title: "Form submitted empty (error message shown)",
    run: async (page) => {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.click('button[type="submit"]');
      await page.waitForSelector("#error:not([hidden])", { timeout: 10000 });
    },
  },
  {
    id: "session-en",
    title: "Generated session in English",
    run: async (page) => {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.click("#example");
      await page.click('button[type="submit"]');
      await page.waitForSelector(".session-title", { timeout: 120000 });
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    },
  },
  {
    id: "session-fr",
    title: "Generated session in French",
    run: async (page) => {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.click("#example");
      await page.check('input[name="language"][value="fr"]');
      await page.click('button[type="submit"]');
      await page.waitForSelector(".session-title", { timeout: 120000 });
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    },
  },
  {
    id: "session-mobile",
    title: "Generated session on a phone-sized screen",
    viewport: { width: 375, height: 812 },
    run: async (page) => {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.click("#example");
      await page.click('button[type="submit"]');
      await page.waitForSelector(".session-title", { timeout: 120000 });
    },
  },
  {
    id: "session-print",
    title: "Printed session",
    run: async (page) => {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.click("#example");
      await page.click('button[type="submit"]');
      await page.waitForSelector(".session-title", { timeout: 120000 });
      await page.emulateMedia({ media: "print" });
    },
  },
];

const fingerprint = (stateId, ruleId, target) =>
  createHash("sha256").update(`${stateId}|${ruleId}|${target}`).digest("hex").slice(0, 16);

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

async function main() {
  await mkdir(OUT, { recursive: true });
  const baseline = new Set(
    JSON.parse(await readFile(BASELINE, "utf8").catch(() => "[]")).map((b) => (typeof b === "string" ? b : b.fingerprint)),
  );

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const findings = [];
  const stateResults = [];

  for (const state of STATES) {
    const context = await browser.newContext({ viewport: state.viewport ?? { width: 1280, height: 900 } });
    const page = await context.newPage();
    const started = Date.now();
    try {
      await state.run(page);
      // Let entrance animations finish so colours are measured as people see them.
      await page.waitForTimeout(900);
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of result.violations) {
        for (const node of v.nodes) {
          const target = node.target.join(" ");
          const fp = fingerprint(state.id, v.id, target);
          findings.push({
            fingerprint: fp,
            state: state.id,
            stateTitle: state.title,
            rule: v.id,
            impact: v.impact ?? "minor",
            help: v.help,
            helpUrl: v.helpUrl,
            plain: PLAIN[v.id] ?? v.help,
            wcag: v.tags.filter((t) => /^wcag\d/.test(t)),
            target,
            html: node.html.slice(0, 300),
            fix: node.failureSummary?.replace(/\s+/g, " ").trim() ?? "",
            known: baseline.has(fp),
          });
        }
      }
      stateResults.push({ ...state, ok: true, ms: Date.now() - started, passes: result.passes.length });
    } catch (err) {
      stateResults.push({ ...state, ok: false, ms: Date.now() - started, error: err.message });
    } finally {
      await context.close();
    }
  }
  await browser.close();

  const blocking = findings.filter((f) => BLOCKING.has(f.impact) && !f.known);
  const report = {
    url: BASE,
    scannedAt: new Date().toISOString(),
    standard: "WCAG 2.2 AA (axe-core)",
    states: stateResults.map(({ id, title, ok, ms, passes, error }) => ({ id, title, ok, ms, passes, error })),
    totals: {
      violations: findings.length,
      blocking: blocking.length,
      byImpact: findings.reduce((acc, f) => ((acc[f.impact] = (acc[f.impact] ?? 0) + 1), acc), {}),
    },
    findings,
  };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  // Plain-language summary.
  const lines = [
    `# Accessibility scan`,
    ``,
    `Scanned ${BASE} in ${stateResults.length} states against WCAG 2.2 AA.`,
    ``,
    blocking.length
      ? `**${blocking.length} new serious or critical problem(s). The release is blocked until they are fixed.**`
      : `**No new serious or critical problems.**`,
    ``,
    `| State | Result |`,
    `|---|---|`,
    ...stateResults.map((s) => {
      const n = findings.filter((f) => f.state === s.id).length;
      return `| ${s.title} | ${s.ok ? (n ? `${n} issue(s)` : "clean") : `could not scan: ${s.error}`} |`;
    }),
    ``,
  ];
  if (findings.length) {
    lines.push(`## Issues`, ``);
    for (const f of findings) {
      lines.push(
        `- **${f.impact}** · \`${f.rule}\` · ${f.stateTitle}${f.known ? " · known (baseline)" : ""}`,
        `  - What it means: ${f.plain}`,
        `  - Where: \`${f.target}\``,
        `  - Fix hint: ${f.fix}`,
        `  - Rule: ${f.helpUrl}`,
      );
    }
  }
  await writeFile(path.join(OUT, "summary.md"), lines.join("\n") + "\n");

  // JUnit: one test case per state.
  const cases = stateResults.map((s) => {
    const mine = findings.filter((f) => f.state === s.id && BLOCKING.has(f.impact) && !f.known);
    const body = !s.ok
      ? `<error message="${xml(s.error)}"/>`
      : mine.length
        ? `<failure message="${mine.length} serious/critical accessibility issue(s)">${xml(mine.map((f) => `${f.rule}: ${f.plain} (${f.target})`).join("\n"))}</failure>`
        : "";
    return `<testcase classname="a11y" name="${xml(s.title)}" time="${(s.ms / 1000).toFixed(2)}">${body}</testcase>`;
  });
  const failures = stateResults.filter((s) => s.ok && findings.some((f) => f.state === s.id && BLOCKING.has(f.impact) && !f.known)).length;
  const errors = stateResults.filter((s) => !s.ok).length;
  await writeFile(
    path.join(OUT, "junit.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="accessibility" tests="${cases.length}" failures="${failures}" errors="${errors}">\n${cases.join("\n")}\n</testsuite>\n`,
  );

  // GitLab Code Quality format.
  const severity = { critical: "blocker", serious: "critical", moderate: "major", minor: "minor" };
  await writeFile(
    path.join(OUT, "codequality.json"),
    JSON.stringify(
      findings.map((f) => ({
        description: `[a11y] ${f.plain} (${f.rule}, ${f.stateTitle}, ${f.target})`,
        check_name: `a11y/${f.rule}`,
        fingerprint: f.fingerprint,
        severity: severity[f.impact] ?? "info",
        location: { path: "public/index.html", lines: { begin: 1 } },
      })),
      null,
      2,
    ),
  );

  if (args["update-baseline"]) {
    await writeFile(BASELINE, JSON.stringify(findings.map((f) => ({ fingerprint: f.fingerprint, rule: f.rule, state: f.state, target: f.target })), null, 2) + "\n");
  }

  console.log(lines.slice(0, 6 + stateResults.length + 3).join("\n"));
  if (errors) process.exitCode = 2;
  else if (blocking.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
