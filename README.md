# Memory Lane

An agent that helps families and nursing-home staff plan a personalized reminiscence session for an older person, grounded in Qloo's taste graph.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## The problem

Reminiscence activities (music, films, food from someone's youth) are one of the most used non-drug approaches in elder care. They only work when the material actually belongs to that person's life. Staff and families usually fall back on generic playlists, which rarely fit someone who grew up in another country or culture.

## What it does

From a two-minute profile (year of birth, where they grew up, where they live now, a few favourite singers, films and dishes), Memory Lane:

1. resolves the era and culture into Qloo tags (`qloo_find_tags`);
2. asks Qloo which artists and films resonate with that taste profile (`qloo_recommend`, `target_type: artist / movie`);
3. looks for places near where they live now that serve the food of their childhood (`qloo_recommend`, `target_type: place`, `filter_location`);
4. writes a calm 40-minute session: warm-up questions, a playlist, a film moment, a "this or that?" game with no wrong answers, a taste of home, and notes for the person leading.

Every suggestion is labelled with its source ("from the family" or "suggested by Qloo"), and a "How Memory Lane used Qloo" panel lists each Qloo call.

### Design rules

- No invented facts: the session only names what the family typed or what Qloo returned.
- No wrong answers: questions invite memories, they never test them.
- Topics the family asks to avoid are filtered out.
- The Qloo key stays on the server; the browser never calls Qloo.

## Run it

Requires Node.js 22.19 or newer.

```sh
npm install
QLOO_API_KEY=your-event-key \
QLOO_BASE_URL=https://hackathon.api.qloo.com \
QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com \
npm start                                  # live mode
npm run demo                               # demo mode, sample data, no key needed
```

Open http://localhost:3000.

Demo mode uses hand-written sample data from `fixtures/demo.json` and shows a banner saying so. It exists only so the interface can be tried without a key.

## Architecture

```
browser ── POST /api/session ──> server.mjs ──> lib/agent.mjs ──> lib/qloo.mjs ──> qloo mcp (stdio) ──> Qloo
                                                     │
                                                     └──> lib/compose.mjs (session text, EN/FR)
```

## Known limitations

- Qloo recommends at the artist and film level, not specific songs or scenes; the person leading picks the track or the clip.
- Recommendations reflect taste affinity, not personal history: a suggested artist may never have been heard by that person. That is why the game and the questions invite stories rather than test memory.
- Qloo's film graph leans towards recent releases, even with a decade filter. Memory Lane keeps a Qloo film only when its release year falls in the person's youth; otherwise the film moment uses the film the family named, or is left out rather than filled with something that does not fit.
- When a name is ambiguous (Édith Piaf is an artist, an album and an author in Qloo), the agent picks the entity of the kind it needs and asks again with its ID; names it cannot place are dropped, never guessed.
- Sessions are in English or French for now.

## License

MIT
