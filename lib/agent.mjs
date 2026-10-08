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

  // 1. Turn vague context ("the 1960s", "Algerian music") into Qloo tags.
  const eraQuery = profile.youthDecade ? `${profile.youthDecade}s` : null;
  const eraTags = eraQuery ? toTags(await step(`Find the tag for ${eraQuery}`, "qloo_find_tags", { query: eraQuery, limit: 3 })) : [];
  const originTags = profile.grewUpIn
    ? toTags(await step(`Find tags for the culture of ${profile.grewUpIn}`, "qloo_find_tags", { query: `${profile.grewUpIn} music`, limit: 3 }))
    : [];
  const cuisineTags = profile.grewUpIn
    ? toTags(await step(`Find the cuisine of ${profile.grewUpIn}`, "qloo_find_tags", { query: `${profile.grewUpIn} cuisine`, limit: 3 }))
    : [];

  const firstTag = (tags) => (tags[0]?.id ? [tags[0].id] : []);
  const signalTags = [...firstTag(eraTags), ...firstTag(originTags)];

  // 2. Ask the taste questions. Signals = what the person already loves.
  const music = profile.artists.length || signalTags.length
    ? toEntities(
        await recommend("Music they are likely to love", {
          target_type: "artist",
          ...(profile.artists.length ? { signals: profile.artists } : {}),
          ...(signalTags.length ? { signal_tags: signalTags, signal_tags_operator: "union" } : {}),
          ...(profile.grewUpIn ? { signal_location: profile.grewUpIn } : {}),
          limit: 8,
        }, "artist"),
      )
    : [];

  const films = profile.films.length || signalTags.length
    ? toEntities(
        await recommend("Films from their world", {
          target_type: "movie",
          ...(profile.films.length ? { signals: profile.films } : {}),
          ...(firstTag(eraTags).length ? { signal_tags: firstTag(eraTags) } : {}),
          ...(profile.grewUpIn ? { signal_location: profile.grewUpIn } : {}),
          limit: 6,
        }, "movie"),
      )
    : [];

  const places = profile.livesIn && (cuisineTags.length || profile.dishes.length)
    ? toEntities(
        await step(`A taste of home near ${profile.livesIn}`, "qloo_recommend", {
          target_type: "place",
          filter_location: profile.livesIn,
          ...(firstTag(cuisineTags).length ? { include_tags: firstTag(cuisineTags) } : {}),
          limit: 4,
        }),
      )
    : [];

  const session = composeSession(profile, { music, films, places, eraTags, originTags, cuisineTags });
  const mode = trace[0]?.mode ?? "demo";
  return { profile, session, trace, mode };
}
