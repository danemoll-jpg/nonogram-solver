# Nonogram Pro

A browser-based nonogram (picross) app with a solver that doesn't just check answers —
it explains the reasoning behind the next logical move. Play built-in and community
puzzles, scan an existing puzzle from any image (a photo of a paper puzzle, a screenshot
from another app — anything with a visible grid and clues), or draw your own picture and
let the app turn it into a playable puzzle. Plain HTML/CSS/JS, no build step (matches the
[game-hub](../game-hub) project's pattern), deployed on Netlify.

Live at **https://nonogrampro.netlify.app/**, listed in the
[game hub](https://dansgamehub.netlify.app/).

## Deployment

Hosted on Netlify, auto-deploying from this repo's `main` branch — **any push to `main`
goes live immediately**, no manual deploy step. There's no staging environment; treat a
push to `main` as a real deploy to the live URL above.

## Status vs. the original design spec

The original build order, and what happened with each item:

| # | Item | Status |
|---|------|--------|
| 1 | Data model | ✅ [src/model.js](src/model.js) |
| 2 | Solver engine (line techniques + cross-line propagation + contradiction search) | ✅ [src/lineSolver.js](src/lineSolver.js), [src/solver.js](src/solver.js), [src/contradiction.js](src/contradiction.js) |
| 3 | Dev/test harness | ✅ folded into the full UI — every hint highlights and explains itself |
| 4 | Hint phrasing layer | ✅ [src/hintPhrasing.js](src/hintPhrasing.js) — LLM-backed via a deployed Cloud Function, template fallback if that call fails |
| 5 | Mistake handling (auto-check, on-demand check, remove-bad-marks) | ✅ [src/mistakes.js](src/mistakes.js) |
| 6 | Contradiction search (on-demand only) | ✅ [src/contradiction.js](src/contradiction.js) |
| 7 | Full puzzle UI + refinement pass | ✅ [index.html](index.html) / [app.js](app.js) / [styles.css](styles.css) |
| 8 | Photo → puzzle generation | ❌ **DECIDED: won't be built.** Turning an arbitrary photo into a recognizable ~15–30-cell binary grid is a genuinely hard, open-ended image problem with no reliable general solution — and even done well, it'd realistically see occasional novelty use, not regular play. Closed deliberately, not just deferred. |
| 9 | Firestore schema + shared library | ✅ Full public puzzle library — built-in and community puzzles in one browsable list, personal + global stats, save/resume in-progress puzzles, hide/rename, cross-device sync |
| 10 | Scan-existing-puzzle flow | ✅ Full OCR pipeline (grid detection, clue-strip OCR, fill-state capture) turning an image of an existing puzzle — a paper puzzle photo, a screenshot from another app — into a playable one |

Beyond the original ten items, quite a bit more got built along the way:

- **Draw-a-puzzle**: design your own picture on a blank grid; the app derives the clues,
  verifies the result has a genuinely unique solution (rejecting ambiguous drawings), and
  publishes it to the shared library.
- **Undo**, a dedicated **Eraser mode** (alongside Fill/Mark-empty), and a live cell-count
  badge while drag-painting.
- **Cross-device stats + puzzle pairing**, no accounts or passwords — Anonymous Auth plus
  a short pairing code.
- **A public shared library**: browse, filter (solved/unsolved/incomplete/hidden), rename,
  hide, and see both your own best time and the global fastest time for any puzzle.
- Sound effects for line-locking, mistakes, hints, puzzle completion, and a clue number
  becoming logically anchored.

## Try it

Easiest: just play it live at **https://nonogrampro.netlify.app/** — no setup needed.

To run it locally instead, no install needed either — it's static files. Either open
`index.html` directly, or serve it:

```bash
npx serve .
```

Run the test suite (plain Node, no test framework installed — 822 tests as of this
writing):

```bash
node test/run.js
```

## Architecture

```
src/
  model.js           Board (mutable play state + move history, with baseline support for
                      resumed/scanned/drawn puzzles), Puzzle, cell states, clue derivation.
  lineSolver.js       The line-solving techniques (overlap, edge/completion, general
                      gap-forcing via automaton match), each operating on one row/column,
                      plus anchoredClueNumbers (per-number gray-out).
  solver.js           Turns line-solving into structured "deduction" objects, one hint at
                      a time (getNextHint), and cross-line propagation (solveToFixpoint).
  contradiction.js    On-demand hypothesize-and-propagate search for genuinely stuck states.
  mistakes.js         auto-check / on-demand check / remove-bad-marks.
  hintPhrasing.js     Turns a deduction into player-facing text (LLM-backed, template
                      fallback — see "Hint phrasing" below).
  firebase.js         Lazy Firebase client (CDN ESM import, timeout-wrapped against
                      blocked/stalled requests) for Cloud Functions, Anonymous Auth, and
                      Firestore — never touches the network at import time.
  sounds.js           Sound-effect playback + persistent mute toggle. Real audio files in
                      assets/sounds/ (see that dir's README) — only per-cell click/drag
                      sounds were deliberately removed as too noisy; line-lock, mistake,
                      hint-batch, and puzzle-complete sounds remain.
  stats.js            Cross-device stats + pairing (Anonymous Auth + Firestore + Cloud
                      Functions) — bucketed by grid size, no accounts/passwords.
  fullSolve.js        Solves a whole puzzle (line techniques + contradiction fallback);
                      also the basis for the draw-a-puzzle uniqueness check — every
                      technique it uses is sound, so reaching a full solve is itself a
                      proof the clues have exactly one solution.
  puzzles.js          The four hand-authored built-in sample puzzles — now shown in the
                      same library list as every community/scanned/drawn puzzle, not a
                      stand-in for it.
  puzzleLibrary.js    All Firestore-backed puzzle-library operations: save/fetch/load/
                      rename puzzles, save/load/delete in-progress puzzle state, and the
                      personal + global fastest-time stat reads/writes.
  gridDetect.js       Scan flow: auto-detects a puzzle's grid box in a photo.
  ocr.js / ocrSegment.js   Scan flow: Tesseract.js-based clue-number OCR with
                      glyph-geometry segmentation for reliable multi-digit reads.
  cellStateDetect.js  Scan flow: classifies each detected cell as filled/empty/unknown.
  scanPuzzle.js       Scan flow: turns detected clues + grid into a solved, playable
                      puzzle (also reused by the draw-a-puzzle wizard's own screen flow).
  scanUI.js           The scan-a-puzzle wizard UI — dimension entry on its own screen
                      shown first (matching draw-a-puzzle's pattern, which avoids a real
                      iOS scroll bug — see Technical notes below), then photo → detected
                      grid → clue correction → fill-state review → play.
  tooltip.js          Custom tap/hover tooltips for icon-only toolbar buttons (native
                      `title` tooltips are unreliable on iOS Safari).
functions/            Firebase Cloud Functions: phraseHint (LLM hint phrasing),
                      createPairingCode/redeemPairingCode (cross-device pairing), and
                      recordFastestTime (validates and writes the global fastest-time
                      stat server-side — never a plain client-writable field).
firestore.rules       Security rules for stats/pairing, the puzzle library
                      (puzzles/{puzzleId}), per-user solved/in-progress/hidden tracking,
                      and puzzleStats/{puzzleId} (public-read, callable-only write).
assets/sounds/        Real audio files for every effect, including `anchor.mp3` (a clue
                      number becoming logically anchored) — see that dir's README.
test/                 Zero-dependency test suite (822 tests), incl. a brute-force
                      differential test of the line solver.
index.html / app.js / styles.css   The playable UI, toolbar, library modal, scan/draw
                      wizards, and all client-side wiring.
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
phrased text. If that call fails for any reason — offline, a transient error — `phraseDeduction`
falls back to the original deterministic template renderer, so a hint is never silently
missing. **The function is deployed and live.** `setPhraser()` still lets tests or dev swap
in a different implementation without editing this module.

## Notes on some harder-won design decisions

- **Puzzle uniqueness is enforced, not assumed.** Both the draw-a-puzzle flow and (had it
  been built) item 8 needed a way to reject a puzzle whose clues don't uniquely determine
  one solution — this app's completion/mistake-checking compares against one specific
  stored solution grid, so a non-unique puzzle would produce false "mistakes" for a player
  who found a different, equally valid solution. `fullSolve.js`'s solver is sound (every
  technique it uses only fixes a cell when every valid completion agrees), so reaching a
  full solve from the clues alone is itself a proof of uniqueness — no separate checker
  was needed.
- **A real, hard-won iOS Safari scroll bug** turned out to need six failed rounds of
  attempting to fix the underlying `visualViewport` mechanism directly before the actual
  fix was found: don't fix it, avoid triggering it. The bug's real trigger turned out to be
  a text input's on-screen keyboard opening near the *bottom* of the screen — both the
  scan wizard's dimension entry (moved to its own screen shown first) and the puzzle
  library's rename control (moved to a top-pinned popup instead of editing in place) were
  restructured around this, and both are confirmed fixed on a real device. The underlying
  WebKit behavior itself was never fixed — if a future feature puts a text input near the
  bottom of the screen, the same risk applies.
- **The global fastest-time stat lives in its own `puzzleStats` collection**, not a field on
  `puzzles/{puzzleId}` — built-in puzzles have no document in that collection at all, so a
  stats-only field there would have corrupted the library's "every doc here is a full
  community puzzle" read logic. It's written only through a validating Cloud Function,
  never directly by a client, so a stored time can't be faked.

## Sample puzzles

`src/puzzles.js` has four hand-authored puzzles (a heart, an arrow, a plus, and a boat) —
they now appear in the same browsable library as every scanned, drawn, and community
puzzle, distinguished only by a light "Built-in" badge.
