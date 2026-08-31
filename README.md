# Nonogram

A browser-based nonogram (picross) app with a solver that doesn't just check answers —
it explains the reasoning behind the next logical move. Plain HTML/CSS/JS, no build step
(matches the [game-hub](../game-hub) project's pattern), deployable to Netlify as-is.

## Status vs. the design spec

Build order from the design spec, and what's done:

| # | Item | Status |
|---|------|--------|
| 1 | Data model | ✅ [src/model.js](src/model.js) |
| 2 | Solver engine (4 line techniques + cross-line propagation) | ✅ [src/lineSolver.js](src/lineSolver.js), [src/solver.js](src/solver.js) |
| 3 | Dev/test harness | ✅ folded into the full UI below — every hint highlights and explains itself, so there's no separate bare-bones view to maintain |
| 4 | Hint phrasing layer | ✅ [src/hintPhrasing.js](src/hintPhrasing.js) — LLM-backed via a Cloud Function, template fallback (see below) |
| 5 | Mistake handling (auto-check, on-demand check, remove-bad-marks) | ✅ [src/mistakes.js](src/mistakes.js) |
| 6 | Contradiction search (on-demand only) | ✅ [src/contradiction.js](src/contradiction.js) |
| 7 | Full puzzle UI + refinement pass | ✅ [index.html](index.html) / [app.js](app.js) / [styles.css](styles.css) — mode toggle, 5×5 chunking, auto-X, mistake pop-up, complete-stats modal, real LLM hint phrasing (**Cloud Function written, not yet deployed** — see [functions/README.md](functions/README.md)) |
| 8 | Photo → puzzle generation | ⬜ not started (needs its own design pass — grid-size/threshold controls, uniqueness-checking) |
| 9 | Firestore schema + shared library | ⬜ not started (needs schema + sharing-model design) |
| 10 | Scan-existing-puzzle flow | ⬜ not started (builds on #8 + OCR) |

Items 1–7 — the fully-designed subsystem plus a genuinely playable UI — are done and
tested. Items 8–10 need their own design pass before building, per the original spec.

## Try it

No install needed — it's static files. Either open `index.html` directly, or serve it:

```bash
npx serve .
```

Run the solver test suite (plain Node, no test framework installed):

```bash
node test/run.js
```

## Architecture

```
src/
  model.js         Board (mutable play state + move history), Puzzle, cell states,
                    clue derivation from a solution grid.
  lineSolver.js     The three line-solving techniques (overlap, edge/completion,
                    general/gap-forcing), each operating on one row or column at a time.
  solver.js         Turns line-solving into structured "deduction" objects, one hint at a
                    time (getNextHint), and the cross-line propagation loop used
                    internally for full-solving (solveToFixpoint).
  contradiction.js  On-demand hypothesize-and-propagate search for when no line technique
                    finds a forced move.
  mistakes.js       auto-check / on-demand check / remove-bad-marks — three independent
                    tools, not one setting.
  hintPhrasing.js   Turns a deduction into player-facing text. See "Hint phrasing" below.
  firebase.js       Lazy Firebase client (CDN ESM import) for Cloud Functions, Anonymous
                    Auth, and Firestore — never touches the network at import time, so it's
                    inert during tests.
  sounds.js         Sound-effect playback + the persistent mute toggle. Built against
                    placeholder/silent audio (assets/sounds/) — see that dir's README.
  stats.js          Cross-device stats + pairing (Anonymous Auth + Firestore + two Cloud
                    Functions) — bucketed by grid size, no accounts/passwords.
  fullSolve.js      Solves a whole puzzle (line techniques + contradiction fallback) —
                    used by tests, and later useful for uniqueness-checking generated
                    puzzles and technique-based difficulty rating.
  puzzles.js        A handful of hand-authored sample puzzles standing in for the shared
                    library (item 9).
functions/          Firebase Cloud Functions: `phraseHint` (LLM hint phrasing, keeping the
                    API key out of client code) and `createPairingCode`/`redeemPairingCode`
                    (cross-device stats pairing) — see functions/README.md for deploy steps.
firestore.rules     Security rules for the stats/pairing Firestore usage above.
assets/sounds/      Placeholder (silent) sound effects — see that dir's README.
test/               Zero-dependency test suite, incl. a brute-force differential test that
                    checks the line solver's DP against exhaustive enumeration.
index.html / app.js / styles.css   The playable UI.
```

The solver never produces player-facing text — only structured facts:

```js
{
  technique: 'overlap' | 'edge' | 'gap-forcing' | 'contradiction' | 'mistake',
  line: { type: 'row' | 'col', index },
  reasoningCells: [{ row, col }, ...],
  resultCells: [{ row, col }, ...],
  resultState: 'filled' | 'empty',
  meta: { ... },   // clue, line length, etc. — context for phrasing
}
```

One hint = one technique application. If a technique resolves several cells at once (an
overlap forcing four cells in a row), they're delivered — and highlighted — together as a
single hint, not one hint per cell.

### Why the line solver is one general DP instead of three separate algorithms

Technique 3 ("gap-forcing") is implemented as a general constraint solve — an automaton
match against the clue's block pattern (`gap, run, gap, run, ..., gap`) — rather than a
narrow "known-empty cells split the line" special case. That's because the narrow version
turns out to be a special case of the general one: once you're tracking which cells known
marks split the line into, you need the general reachability machinery anyway to get
correctness right, and it also happens to catch anything technique 1/2 would have found.
So techniques 1 (overlap) and 2 (edge/completion) are tried first, cheaply, because they
tend to produce cleaner, more human-sounding explanations for the common cases — but
technique 3 is the guaranteed-complete fallback. This was **not** the original plan (a
first pass tried to compute run-coverage and gap-reachability directly from the forward/
backward DP tables) — that approach had a real bug in how it handled a cell mid-way
through a partially-satisfied gap, caught by the brute-force differential test in
`test/lineSolver.test.js`. The current version instead re-runs a cheap validity check per
candidate cell state, which is more obviously correct at a small performance cost that
doesn't matter at nonogram sizes.

### Hint phrasing calls an LLM via a Cloud Function, with a template fallback

`phraseDeduction(deduction)` calls the `phraseHint` Firebase Cloud Function
(`functions/index.js`) through `src/firebase.js`, sending it the structured deduction; the
function calls the LLM API server-side (API key never touches client code) and returns
phrased text. If that call fails for any reason — offline, the function isn't deployed yet,
a transient error — `phraseDeduction` falls back to the original deterministic template
renderer, so a hint is never silently missing. `setPhraser()` still lets tests or dev swap in
a different implementation without editing this module.

**The function is written but not deployed** — see [functions/README.md](functions/README.md)
for the one-time `firebase login` / secret-setup / `firebase deploy` steps. Until deployed,
the app plays exactly as before, using the template phrasings.

## Open questions carried forward from the design spec

- **Puzzle uniqueness at generation time** (item 8): a derived puzzle might not have a
  unique solution. `fullSolve.js`'s `solvePuzzleFully` can already check solvability against
  a *known* solution; a uniqueness checker (solve from clues alone with no target, then see
  if more than one solution exists) is a natural extension once generation exists.
  Deferred per the spec.
- **Firestore schema + sharing model** (item 9): fields, indexing, and friends/share-by-code
  are undesigned. Deferred per the spec.
- **Photo→grid threshold/grid-size controls** (item 8): needs its own design pass.

## Sample puzzles

`src/puzzles.js` has four small hand-authored puzzles (a heart, an arrow, a plus, and a
boat) so the app is playable today. They stand in for the shared library until item 9 is
built.
