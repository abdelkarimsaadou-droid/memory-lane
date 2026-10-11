# Notes for AI agents working on Memory Lane

Memory Lane builds reminiscence sessions for older adults from a short family profile, using Qloo's taste graph.

## Layout
- `server.mjs`: HTTP server, one JSON endpoint (`POST /api/session`), serves `public/`.
- `lib/agent.mjs`: the Qloo query plan. `lib/qloo.mjs`: Qloo MCP client and demo fixtures. `lib/compose.mjs`: session text (EN/FR).
- `public/`: static front end (`index.html`, `styles.css`, `app.js`). No framework, no build step.
- `scripts/a11y-scan.mjs`: the accessibility gate (axe-core, WCAG 2.2 AA, six page states).

## Run
- `npm ci`, then `QLOO_MODE=demo RATE_LIMIT_PER_MIN=200 node server.mjs` (no secrets needed).
- Accessibility scan: `node scripts/a11y-scan.mjs --url http://localhost:3000`.

## Rules
- Users are older adults and carers: keep the 18px base size, high contrast, large targets, visible focus, plain language.
- Never commit secrets. The Qloo key only lives in CI/CD or host environment variables.
- Never weaken the accessibility gate (`.gitlab-ci.yml`, `scripts/a11y-scan.mjs`, `a11y-baseline.json`) to make a pipeline pass.
- Session text must stay identical in meaning between English and French.
