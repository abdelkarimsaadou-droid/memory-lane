// The Memory Lane agent: turns a short life profile into Qloo questions,
// then into a ready-to-run reminiscence session.
//
// Every Qloo call is recorded in `trace` so the person running the session
// (and the judges) can see where each suggestion came from.
import { callQloo, toEntities, toTags } from "./qloo.mjs";
import { composeSession } from "./compose.mjs";

const list = (s) =>
  String(s ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5);

export function normalizeProfile(input = {}) {
  const birthYear = Number.parseInt(input.birthYear, 10);
  const valid = Number.isFinite(birthYear) && birthYear > 1900 && birthYear < 1990;
  // Reminiscence "bump": memories from ages ~10–30 are the most vivid.
  const youthStart = valid ? birthYear + 10 : null;
  const youthDecade = valid ? Math.floor((birthYear + 15) / 10) * 10 : null;
  return {
    firstName: String(input.firstName ?? "").trim().slice(0, 40) || "your guest",
    birthYear: valid ? birthYear : null,
    youthDecade,
    youthStart,
    grewUpIn: String(input.grewUpIn ?? "").trim().slice(0, 80),
    livesIn: String(input.livesIn ?? "").trim().slice(0, 80),
    artists: list(input.artists),
    films: list(input.films),
    dishes: list(input.dishes),
    avoid: list(input.avoid),
    language: input.language === "fr" ? "fr" : "en",
  };
}

export async function runAgent(rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const trace = [];
  const step = async (purpose, tool, args) => {
    const env = await callQloo(tool, args, { demoKey: profile.grewUpIn });
    trace.push({
      purpose,
      tool,
      args,
      status: env.status,
      summary: env.summary,
      count: env.result_count ?? (env.results?.length ?? 0),
      mode: env.mode,
      ms: env.ms,
    });
    return env;
  };

  // Qloo resolves names to entities. When a name is ambiguous ("Édith Piaf" is
  // an artist, an album and an author), it answers `needs_input` with candidates.
  // The agent picks the candidate of the expected kind and asks again with its ID.
  // Names it cannot place are dropped rather than guessed.
  const recommend = async (purpose, args, signalKind) => {
    let env = await step(purpose, "qloo_recommend", args);
    const issues = env.resolution?.issues ?? [];
    if (env.status !== "needs_input" || !args.signals || !issues.length) return env;
    const wanted = `urn:entity:${signalKind}`;
    const fixed = [];
    for (const name of args.signals) {
      const issue = issues.find((i) => i.input === name && i.field === "signals");
      if (!issue) { fixed.push(name); continue; }
      const pick = (issue.candidates ?? []).find((c) => c.type === wanted);
      if (pick) fixed.push(pick.id);
    }
    const retry = { ...args };
    if (fixed.length) retry.signals = fixed; else delete retry.signals;
    if (!retry.signals && !retry.signal_tags) return env;
    return step(`${purpose} (names matched to Qloo ${signalKind}s)`, "qloo_recommend", retry);
  };

  // Tuning notes from live tests (Oct 2026):
  // - Artist signals + a music-style filter give era-true lists (Piaf -> Gréco, Trenet, Brel).
  // - Location and decade *signals* pull towards recent, popular titles, so for films the
  //   decade is used as a filter, then years are checked on our side.
  // - Places need a location signal plus a cuisine filter; dish names alone match unrelated places.
  const country = (profile.grewUpIn.split(",").pop() || "").trim();
  const pickTags = (tags, test, n = 3) => tags.filter((t) => t.id && test(t.id)).slice(0, n).map((t) => t.id);

  // 1. Turn vague context ("the 1950s", "music from Portugal") into Qloo tags.
  const decade = profile.youthDecade;
  const eraTags = decade
    ? toTags(await step(`Find the tag for the ${decade}s`, "qloo_find_tags", { query: `${decade}s`, limit: 5 }))
    : [];
  const musicTags = country
    ? toTags(await step(`Find the music of ${country}`, "qloo_find_tags", { query: `${country} music`, limit: 5 }))
    : [];
  const cuisineTags = profile.grewUpIn
    ? toTags(await step(`Find the cuisine of ${profile.grewUpIn}`, "qloo_find_tags", { query: `${profile.grewUpIn} cuisine`, limit: 5 }))
    : [];

  const eraFilmTags = pickTags(eraTags, (id) => id.startsWith("urn:tag:keyword:media:"), 1);
  const musicStyle = pickTags(musicTags, (id) => id.includes(":genre:music:"));
  const cuisine = pickTags(cuisineTags, (id) => id.includes("cuisine"));

  // 2. Music: what the family named is the strongest signal; the country's music style keeps it on track.
  let musicEnv = null;
  if (profile.artists.length) {
    musicEnv = await recommend("Music they are likely to love", {
      target_type: "artist",
      signals: profile.artists,
      ...(musicStyle.length ? { include_tags: musicStyle, include_tags_operator: "union" } : {}),
      limit: 12,
    }, "artist");
    if (musicStyle.length && !toEntities(musicEnv).length) {
      musicEnv = await recommend("Music they are likely to love (without the style filter)", {
        target_type: "artist", signals: profile.artists, limit: 12,
      }, "artist");
    }
  } else if (musicStyle.length) {
    musicEnv = await step("Music from where they grew up", "qloo_recommend", {
      target_type: "artist",
      signal_tags: [...musicStyle, ...pickTags(eraTags, (id) => id.startsWith("urn:tag:keyword:"), 1)],
      signal_tags_operator: "union",
      include_tags: musicStyle,
      include_tags_operator: "union",
      limit: 12,
    });
  }
  const music = musicEnv ? toEntities(musicEnv) : [];

  // 3. Films from their youth: decade as a filter, then keep only titles released in that window.
  let films = [];
  if (eraFilmTags.length) {
    const filmEnv = await step(`Films of the ${decade}s`, "qloo_recommend", {
      target_type: "movie",
      signal_tags: eraFilmTags,
      include_tags: eraFilmTags,
      ...(country ? { signal_location: country } : {}),
      limit: 20,
    });
    films = toEntities(filmEnv).filter((f) => !f.year || (f.year >= decade - 10 && f.year <= decade + 19)).slice(0, 6);
  }

  // 4. A taste of home near where they live now.
  let places = [];
  if (profile.livesIn && cuisine.length) {
    const placeEnv = await step(`A taste of home near ${profile.livesIn}`, "qloo_recommend", {
      target_type: "place",
      signal_location: profile.livesIn,
      filter_location: profile.livesIn,
      include_tags: cuisine,
      include_tags_operator: "union",
      limit: 8,
    });
    const seen = new Set();
    places = toEntities(placeEnv).filter((p) => !seen.has(p.name) && seen.add(p.name)).slice(0, 4);
  }

  const session = composeSession(profile, { music, films, places });
  const mode = trace[0]?.mode ?? "demo";
  return { profile, session, trace, mode };
}
