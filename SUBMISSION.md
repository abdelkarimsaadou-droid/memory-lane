# Devpost submission — Memory Lane

Copy each block into the matching Devpost field.

---

## Project name

Memory Lane

## Elevator pitch (max 200 characters)

An agent that turns a two-minute family profile into a ready-to-run reminiscence session for an older person: their music, their era, a taste of home nearby. Grounded in Qloo, never invented.

## Try it out

- Live app: https://memory-lane-8dv1.onrender.com
- Code: https://github.com/abdelkarimsaadou-droid/memory-lane

(The app is on a free plan: if nobody has visited for 15 minutes, the first load takes about a minute.)

## Built with

qloo, qloo-mcp, model-context-protocol, node.js, javascript, html, css, render, github-actions

---

## About the project

### Inspiration

In hospitals and nursing homes, there are older patients and residents for whom one song, one film or the smell of one dish can open a door that nothing else opens. Reminiscence activities are one of the most widely used non-drug approaches in elder care, but they only work when the material belongs to *that* person's life. In practice, staff and families fall back on the same generic playlist for everyone, and it rarely fits someone who grew up in Lyon in the 1950s, in Porto, or in Algiers.

The people who know the resident best (their family) have five minutes, not five hours. The people who run the activity (care staff) have many residents and little time to research each one. Memory Lane sits between them.

### What it does

A family member or caregiver fills in a short profile: first name, year of birth, where the person grew up, where they live now, and a few singers, films and dishes they loved. Memory Lane then builds a calm, 40-minute session the staff can run the same day:

1. **Warm-up questions** anchored in the right place and decade ("When you were young in Lyon, what did the streets smell like?").
2. **A music corner** mixing the artists the family named with artists Qloo finds close to them (from Édith Piaf, Qloo surfaces Juliette Gréco, Fréhel, Yves Montand, Françoise Hardy).
3. **A film moment** built around a film from their youth.
4. **A "this or that?" game** with no wrong answers: it starts stories instead of testing memory.
5. **A taste of home**: real restaurants near where they live *now* that cook the food of where they grew up (a Lyon-style bouchon in Paris, a Portuguese restaurant, an Algerian restaurant in Marseille), so a family can plan an outing or bring a dish in.
6. **Notes for the person leading**, including topics the family asked to avoid.

Every suggestion is labelled with its source, "from the family" or "suggested by Qloo", and a **"How Memory Lane used Qloo"** panel lists each call the agent made and why. Sessions can be generated in English or French and printed.

### How it is Qloo-powered

Qloo is not a decoration here: every name in the session is either typed by the family or returned by Qloo. The agent runs a small, explicit plan against Qloo's MCP server (`@qloo/qloo-harness`):

- `qloo_find_tags` turns vague context into Qloo tags: the decade of their youth, the music of their country, the cuisine of their home town.
- `qloo_recommend` (artists) uses the family's favourite artists as signals and the country's music style as a filter, so recommendations stay in the right culture.
- `qloo_recommend` (movies) uses the decade as a filter, then the agent checks release years itself.
- `qloo_recommend` (places) combines the current city as a location signal with the home cuisine as a filter.

The agent also handles Qloo's answers like an agent should:

- **Ambiguity:** "Édith Piaf" is an artist, an album and an author in Qloo. When Qloo answers `needs_input`, the agent picks the candidate of the kind it needs (an artist for music, a movie for films) and asks again with its ID. Names it cannot place are dropped, never guessed.
- **Gaps:** some cities have few tagged restaurants for a given cuisine; the agent retries with the cuisine as the signal instead of the location.
- **Honesty over filler:** Qloo's film graph leans towards recent releases even with a decade filter. Rather than suggest *Oppenheimer* to someone born in 1938, the agent keeps a Qloo film only if its release year falls in the person's youth, and otherwise uses the film the family named.

### How I built it

- Node.js server with no front-end framework; the browser never talks to Qloo and the API key stays on the server.
- Qloo accessed through the official MCP server (`qloo mcp`) over stdio with the MCP TypeScript SDK.
- Plain HTML/CSS front end designed for older readers and caregivers: 18px base text, a hyperlegible typeface, high contrast, a printable layout.
- A GitHub Actions workflow runs live Qloo checks for three example residents (Lyon, Porto, Algiers) and stores the raw responses, which is how the query strategy was tuned against real data.
- Deployed on Render.

### Challenges I ran into

- Getting era-true results. The first live runs returned modern films and singers from the wrong countries. Testing tag types one by one showed that artist signals plus a music-style *filter* work very well, while decade and location *signals* pull towards whatever is popular today.
- Ambiguous names, solved by reading Qloo's resolution candidates instead of failing.
- Making sure nothing is invented: the session text is templated around real names only, and sources are always shown.

### Accomplishments I'm proud of

- For a woman born in Lyon in 1938 who loved Piaf and Bourvil, Memory Lane suggests Juliette Gréco, Fréhel and Yves Montand, and a Lyon-style bistro "Chez Fred, depuis 1945" in Paris. For a man from Porto it suggests Carlos do Carmo and Maria Teresa de Noronha; for a woman from Algiers, Lili Boniche and Abdel Ali Slimani, and an Algerian restaurant in Marseille. These are the kind of names a caregiver would not have found alone.
- A transparent agent: anyone can open the trace and see exactly what was asked of Qloo.

### What I learned

How a taste graph behaves across cultures and decades, and that the most useful thing an agent can do with uncertain data is to say what it knows, where it came from, and leave out what does not fit.

### What's next

- Talk with care staff to test sessions with real residents and adjust the format.
- Use `qloo_compare_audiences` to help staff plan group sessions for residents from different backgrounds.
- More languages (Portuguese, Arabic, Italian) for families and staff.
- A "session journal" so staff can note what sparked a reaction and refine the next session.
