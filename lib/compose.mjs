// Turns Qloo results into a session plan a caregiver can run in 30–45 minutes.
//
// Design rules (reminiscence-therapy good practice):
//   - no right or wrong answers: questions invite memories, never test them;
//   - no invented facts: we only name what Qloo returned or what the family typed;
//   - topics the family asked to avoid are never mentioned.

// "Algiers, Algeria" -> "Algiers"
const city = (place) => String(place).split(",")[0].trim();

const T = {
  en: {
    title: (n) => `A trip down memory lane with ${n}`,
    warmup: "Warm-up (5 min)",
    music: "Music corner (10 min)",
    film: "Film moment (10 min)",
    game: "This or that? (5 min)",
    taste: "A taste of home (10 min)",
    notes: "Notes for the person leading",
    warmupQs: (p) =>
      [
        p.grewUpIn && `When you were young in ${city(p.grewUpIn)}, what did the streets smell like?`,
        p.youthDecade && `What did you and your friends do on a Sunday in the ${p.youthDecade}s?`,
        "Who was the best cook in your family? What did they make?",
      ].filter(Boolean),
    playIntro: "Play one or two songs from each artist, then pause and ask:",
    musicQs: (a) => [`Does ${a} remind you of anyone?`, `Where were you when you used to hear ${a}?`],
    filmIntro: (f) => `Watch a short scene from “${f}”, then ask:`,
    filmQs: ["Did you go to the cinema? Who did you go with?", "What did people wear to go out back then?"],
    alsoTry: "Also worth trying:",
    gameIntro: "There is no wrong answer — the goal is to start a story.",
    pair: (a, b) => `${a} or ${b}?`,
    tasteIntro: (d) => (d ? `Talk about ${d}: who made it, for which occasions, what made it special.` : "Ask about a favourite family dish and who made it."),
    nearby: (p) => `Places near ${city(p)} that may serve the food of their childhood:`,
    noNearby: "Add where they live now to find places nearby.",
    notesList: (p) =>
      [
        "Keep it short and calm. Stop as soon as they seem tired.",
        "Follow the story they want to tell, not the plan.",
        "Never correct a memory, even if a detail seems wrong.",
        p.avoid.length ? `Avoid these topics: ${p.avoid.join(", ")}.` : null,
      ].filter(Boolean),
    source: "Suggested by Qloo's taste graph",
    family: "From the family",
  },
  fr: {
    title: (n) => `Un voyage dans les souvenirs avec ${n}`,
    warmup: "Mise en route (5 min)",
    music: "Coin musique (10 min)",
    film: "Moment cinéma (10 min)",
    game: "Plutôt ceci ou cela ? (5 min)",
    taste: "Un goût de chez soi (10 min)",
    notes: "Conseils pour la personne qui anime",
    warmupQs: (p) =>
      [
        p.grewUpIn && `Quand vous étiez jeune, à ${city(p.grewUpIn)}, quelle odeur avaient les rues ?`,
        p.youthDecade && `Que faisiez-vous le dimanche avec vos amis dans les années ${String(p.youthDecade).slice(2)} ?`,
        "Qui cuisinait le mieux dans votre famille ? Que préparait-il ou elle ?",
      ].filter(Boolean),
    playIntro: "Faites écouter une ou deux chansons de chaque artiste, puis demandez :",
    musicQs: (a) => [`Est-ce que ${a} vous fait penser à quelqu'un ?`, `Où étiez-vous quand vous écoutiez ${a} ?`],
    filmIntro: (f) => `Regardez un court extrait de « ${f} », puis demandez :`,
    filmQs: ["Alliez-vous au cinéma ? Avec qui ?", "Comment s'habillait-on pour sortir à l'époque ?"],
    alsoTry: "À essayer aussi :",
    gameIntro: "Il n'y a pas de mauvaise réponse : le but est de lancer une histoire.",
    pair: (a, b) => `${a} ou ${b} ?`,
    tasteIntro: (d) => (d ? `Parlez du plat « ${d} » : qui le préparait, pour quelles occasions, ce qui le rendait spécial.` : "Parlez d'un plat de famille préféré et de la personne qui le préparait."),
    nearby: (p) => `Adresses autour de ${city(p)} qui pourraient servir la cuisine de leur enfance :`,
    noNearby: "Indiquez où la personne vit aujourd'hui pour trouver des adresses proches.",
    notesList: (p) =>
      [
        "Restez court et calme. Arrêtez dès que la personne semble fatiguée.",
        "Suivez l'histoire qu'elle a envie de raconter, pas le programme.",
        "Ne corrigez jamais un souvenir, même si un détail semble faux.",
        p.avoid.length ? `Sujets à éviter : ${p.avoid.join(", ")}.` : null,
      ].filter(Boolean),
    source: "Suggéré par le graphe de goûts de Qloo",
    family: "Indiqué par la famille",
  },
};

const mentionsAvoided = (name, avoid) =>
  avoid.some((a) => name.toLowerCase().includes(a.toLowerCase()));

export function composeSession(profile, data) {
  const t = T[profile.language];
  const clean = (items) => items.filter((e) => !mentionsAvoided(e.name, profile.avoid));
  const music = clean(data.music);
  const films = clean(data.films);
  const places = clean(data.places);

  // Mix what the family named with what Qloo found, family first.
  const playlist = [
    ...profile.artists.map((name) => ({ name, origin: "family" })),
    ...music.filter((m) => !profile.artists.some((a) => a.toLowerCase() === m.name.toLowerCase())).map((m) => ({ ...m, origin: "qloo" })),
  ].slice(0, 6);

  const mainFilm = films[0]?.name ?? profile.films[0] ?? null;
  const otherFilms = films.slice(1, 4).map((f) => ({ ...f, origin: "qloo" }));

  // "This or that" pairs built only from real names (never a quiz with a right answer).
  const pool = [...music.map((m) => m.name), ...films.map((f) => f.name)];
  const pairs = [];
  for (let i = 0; i + 1 < pool.length && pairs.length < 3; i += 2) pairs.push(t.pair(pool[i], pool[i + 1]));

  const sections = [
    { id: "warmup", title: t.warmup, questions: t.warmupQs(profile) },
    {
      id: "music",
      title: t.music,
      intro: t.playIntro,
      items: playlist,
      questions: playlist[0] ? t.musicQs(playlist[0].name) : [],
    },
    mainFilm && {
      id: "film",
      title: t.film,
      intro: t.filmIntro(mainFilm),
      questions: t.filmQs,
      extraTitle: otherFilms.length ? t.alsoTry : null,
      items: otherFilms,
    },
    pairs.length && { id: "game", title: t.game, intro: t.gameIntro, questions: pairs },
    {
      id: "taste",
      title: t.taste,
      intro: t.tasteIntro(profile.dishes[0]),
      extraTitle: profile.livesIn ? (places.length ? t.nearby(profile.livesIn) : null) : t.noNearby,
      items: places.map((p) => ({ ...p, origin: "qloo" })),
    },
    { id: "notes", title: t.notes, questions: t.notesList(profile) },
  ].filter(Boolean);

  return { title: t.title(profile.firstName), labels: { qloo: t.source, family: t.family }, sections };
}
