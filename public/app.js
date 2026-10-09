const form = document.getElementById("profile");
const result = document.getElementById("result");
const errorBox = document.getElementById("error");
const submit = form.querySelector('button[type="submit"]');

// Most nursing-home residents in France are very old women born in France,
// so the first example is the common case; the others show other cultures.
const EXAMPLES = [
  {
    firstName: "Jeannine", birthYear: "1938", grewUpIn: "Lyon, France", livesIn: "Paris, France",
    artists: "Édith Piaf, Bourvil", films: "La Grande Vadrouille", dishes: "Gratin dauphinois", avoid: "",
  },
  {
    firstName: "Manuel", birthYear: "1945", grewUpIn: "Porto, Portugal", livesIn: "Champigny-sur-Marne, France",
    artists: "Amália Rodrigues", films: "O Pátio das Cantigas", dishes: "Bacalhau", avoid: "",
  },
  {
    firstName: "Fatima", birthYear: "1948", grewUpIn: "Algiers, Algeria", livesIn: "Paris, France",
    artists: "Warda, Dahmane El Harrachi", films: "", dishes: "Couscous", avoid: "War",
  },
];
let exampleIndex = 0;

fetch("/api/health")
  .then((r) => r.json())
  .then((h) => { document.getElementById("demo-banner").hidden = h.mode !== "demo"; })
  .catch(() => {});

document.getElementById("example").addEventListener("click", () => {
  const example = EXAMPLES[exampleIndex];
  exampleIndex = (exampleIndex + 1) % EXAMPLES.length;
  for (const [k, v] of Object.entries(example)) form.elements[k].value = v;
  form.elements.firstName.focus();
});

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function chipList(items, labels) {
  const ul = el("ul", "chips");
  for (const it of items) {
    const li = el("li", `chip ${it.origin}`);
    const dot = el("i", `dot ${it.origin}`);
    dot.setAttribute("aria-hidden", "true");
    li.append(dot, document.createTextNode(it.name));
    li.title = it.origin === "qloo" ? labels.qloo : labels.family;
    ul.append(li);
  }
  return ul;
}

// First sentence of a Qloo description, so a caregiver knows who or what it is.
const firstSentence = (text, max = 160) => {
  if (!text) return "";
  const m = String(text).match(/^.*?[.!?](\s|$)/);
  const out = (m ? m[0] : String(text)).trim();
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
};

function whoIsWho(items, title) {
  const known = items.filter((i) => i.origin === "qloo" && i.description);
  if (!known.length) return null;
  const d = el("details", "who");
  d.append(el("summary", null, title));
  const ul = el("ul", "who-list");
  for (const i of known) {
    const li = el("li");
    li.append(el("strong", null, i.name), document.createTextNode(` — ${firstSentence(i.description)}`));
    ul.append(li);
  }
  d.append(ul);
  return d;
}

function placeCards(items, mapLabel = "Map") {
  const ul = el("ul", "places");
  for (const p of items) {
    const li = el("li", "place");
    li.append(el("strong", null, p.name));
    if (p.address) li.append(el("span", "addr", p.address));
    if (p.description) li.append(el("span", "desc", firstSentence(p.description, 140)));
    const map = el("a", "map", mapLabel);
    map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(" "))}`;
    map.target = "_blank";
    map.rel = "noopener";
    li.append(map);
    ul.append(li);
  }
  return ul;
}

const argSummary = (args = {}) => {
  const parts = [];
  if (args.query) parts.push(`query "${args.query}"`);
  if (args.target_type) parts.push(`target ${args.target_type}`);
  if (args.signals) parts.push(`signals ${args.signals.length}`);
  if (args.signal_tags) parts.push(`signal tags ${args.signal_tags.map((t) => t.split(":").pop()).join(", ")}`);
  if (args.include_tags) parts.push(`filter ${args.include_tags.map((t) => t.split(":").pop()).join(", ")}`);
  if (args.signal_location || args.filter_location) parts.push(`location ${args.filter_location ?? args.signal_location}`);
  return parts.join(" · ");
};

function render(data) {
  const { session, trace } = data;
  const node = document.getElementById("session-tpl").content.cloneNode(true);
  node.querySelector(".session-title").textContent = session.title;
  node.querySelector(".k-family").textContent = session.labels.family;
  node.querySelector(".k-qloo").textContent = session.labels.qloo;

  const timeline = node.querySelector(".timeline");
  for (const s of session.sections) {
    const li = el("li", `segment ${s.id}`);
    li.append(el("h3", null, s.title));
    const body = s.id === "notes" ? el("div", "notes-box") : li;
    if (s.intro) body.append(el("p", null, s.intro));
    if (s.id === "music" && s.items?.length) {
      body.append(chipList(s.items, session.labels));
      const who = whoIsWho(s.items, session.labels.whoTitle ?? "Who are the suggested artists?");
      if (who) body.append(who);
    }
    if (s.questions?.length) {
      const ul = el("ul");
      for (const q of s.questions) ul.append(el("li", null, q));
      body.append(ul);
    }
    if (s.id !== "music" && s.extraTitle) body.append(el("p", "extra", s.extraTitle));
    if (s.id === "taste" && s.items?.length) body.append(placeCards(s.items, session.labels.map));
    else if (s.id !== "music" && s.items?.length) body.append(chipList(s.items, session.labels));
    if (body !== li) li.append(body);
    timeline.append(li);
  }

  const traceList = node.querySelector(".trace-list");
  for (const t of trace) {
    const li = el("li");
    li.append(document.createTextNode(`${t.purpose} — `));
    li.append(el("code", null, t.tool));
    li.append(document.createTextNode(` · ${t.status}, ${t.count} result${t.count === 1 ? "" : "s"}${t.mode === "demo" ? " (demo data)" : ""}`));
    const a = argSummary(t.args);
    if (a) li.append(el("span", "trace-args", a));
    traceList.append(li);
  }

  result.replaceChildren(node);
  result.querySelector(".session").classList.add("reveal");
  result.querySelector("#print").addEventListener("click", () => window.print());
}

// Printed sessions should include the artist notes even if they were folded.
window.addEventListener("beforeprint", () => {
  document.querySelectorAll("details.who").forEach((d) => (d.open = true));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  const profile = Object.fromEntries(new FormData(form));
  if (!profile.artists && !profile.films && !profile.grewUpIn) {
    errorBox.textContent = "Add at least where they grew up, a singer or a film, so Memory Lane has something to start from.";
    errorBox.hidden = false;
    return;
  }
  submit.setAttribute("aria-busy", "true");
  submit.textContent = "Creating the session…";
  const steps = [
    "Finding their decade and culture in Qloo…",
    "Matching the artists they love…",
    "Looking for films from their youth…",
    "Searching for a taste of home nearby…",
    "Writing the session…",
  ];
  let stepIndex = 0;
  const waiting = el("div", "empty waiting");
  const waitingText = el("p", null, steps[0]);
  waiting.append(waitingText);
  result.replaceChildren(waiting);
  const ticker = setInterval(() => {
    stepIndex = Math.min(stepIndex + 1, steps.length - 1);
    waitingText.textContent = steps[stepIndex];
  }, 1800);
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The session could not be created.");
    render(data);
    if (window.matchMedia("(max-width: 880px)").matches) result.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    errorBox.textContent = `${err.message} Try again in a moment.`;
    errorBox.hidden = false;
  } finally {
    clearInterval(ticker);
    submit.removeAttribute("aria-busy");
    submit.textContent = "Create the session";
  }
});
