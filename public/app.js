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
    if (s.id === "music" && s.items?.length) body.append(chipList(s.items, session.labels));
    if (s.questions?.length) {
      const ul = el("ul");
      for (const q of s.questions) ul.append(el("li", null, q));
      body.append(ul);
    }
    if (s.id !== "music" && s.extraTitle) body.append(el("p", "extra", s.extraTitle));
    if (s.id !== "music" && s.items?.length) body.append(chipList(s.items, session.labels));
    if (body !== li) li.append(body);
    timeline.append(li);
  }

  const traceList = node.querySelector(".trace-list");
  for (const t of trace) {
    const li = el("li");
    li.append(document.createTextNode(`${t.purpose} — `));
    li.append(el("code", null, t.tool));
    li.append(document.createTextNode(` · ${t.status}, ${t.count} result${t.count === 1 ? "" : "s"}${t.mode === "demo" ? " (demo data)" : ""}`));
    traceList.append(li);
  }

  result.replaceChildren(node);
  result.querySelector(".session").classList.add("reveal");
  result.querySelector("#print").addEventListener("click", () => window.print());
}

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
    submit.removeAttribute("aria-busy");
    submit.textContent = "Create the session";
  }
});
