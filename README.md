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
| 4 | Hint phrasing layer | ✅ [src/hintPhrasing.js](src/hintPhrasing.js) — **template-based placeholder, not a real LLM call** (see below) |
| 5 | Mistake handling (auto-check, on-demand check, remove-bad-marks) | ✅ [src/mistakes.js](src/mistakes.js) |
| 6 | Contradiction search (on-demand only) | ✅ [src/contradiction.js](src/contradiction.js) |
| 7 | Full puzzle UI | ✅ [index.html](index.html) / [app.js](app.js) / [styles.css](styles.css) |
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
  fullSolve.js      Solves a whole puzzle (line techniques + contradiction fallback) —
                    used by tests, and later useful for uniqueness-checking generated
                    puzzles and technique-based difficulty rating.
  puzzles.js        A handful of hand-authored sample puzzles standing in for the shared
                    library (item 9).
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

### Hint phrasing is a placeholder, not a real LLM call

`hintPhrasing.js` deterministically templates a few varied phrasings per technique. The
design spec calls for an actual LLM call (varied, conversational explanations); that needs
a backend (e.g. a Firebase Cloud Function so the API key isn't exposed client-side), which
isn't wired up here. `phraseDeduction(deduction)` is the seam: swap its implementation for
a call to that backend and nothing upstream (solver, UI) needs to change — see the comment
at the top of the file. `setPhraser()` lets that swap happen without editing this module.

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
