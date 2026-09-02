# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern
  (`C:\Users\danmo\game-hub` — a separate repo Code can access directly; the nonogram's
  listing there is live at https://dansgamehub.netlify.app/).
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing). Firestore also
  backs the puzzle library (`puzzles/{puzzleId}`), per-user solved-puzzle tracking
  (`users/{uid}/solvedLibraryPuzzles/{puzzleId}`), and per-user in-progress puzzle saves
  (`users/{uid}/inProgressPuzzles/{puzzleId}`).
- Deploy target: Netlify, static-site mode. The Netlify site auto-deploys from this
  repo's `main` branch — live at https://nonogrampro.netlify.app/.
- Tesseract.js (OCR, item 10's scan-existing-puzzle flow) is loaded lazily from the CDN
  as an ES module (`src/ocr.js`) — its ESM build has no named exports, only a default
  export bundling everything (`(await import(url)).default`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text.
- Each module in `src/` does one job — don't collapse them together.
- Favor small pure functions over classes; `Board` is the one stateful class.
- Comments should explain *why*, especially design tradeoffs.
- No test framework installed — `test/harness.js` is a ~40-line custom runner. Prefer
  differential/property-style tests over hand-picked examples when correctness is
  subtle.
- **Item 10 (scan-existing-puzzle) specifically: prefer testing against a real image
  file over synthetic/guessed pixel data.** See `TODO.md`'s Completed Tasks for the full
  history, including a confirmed real ground-truth reference puzzle
  (`scratch-images/sample-mid-solve.jpg`) reusable for future OCR-accuracy verification.
- **The main scroll bug's diagnosis was overturned by two real captures spanning the
  bug's full timeline: it is NOT a stuck `visualViewport.offsetTop`/pan (what five
  rounds of fixes targeted) — it's a stuck-shrunk `visualViewport.height` that never
  recovers to match `window.innerHeight`, independent of pan/scroll state.** At onset,
  both height values AND the pan shrink/stick together; over time, `window.innerHeight`
  recovers and the pan gets correctly reset to 0 by the existing poll mechanism (which
  is thus confirmed genuinely working as designed) — but `visualViewport.height` alone
  never rejoins the recovery. `window.scrollTo` (every prior round's corrective action)
  can only affect scroll position, never viewport height — it was never capable of
  fixing this. **Do not attempt another pan/scroll-based fix** — see `TODO.md`'s
  Current Objective for the full timeline data and next steps (likely a focus/blur
  nudge or forced layout recalculation to make Safari recompute its viewport metrics —
  research needed, not prescribed).
- **When a project owner describes a visual bug in plain language, take it literally
  before assuming a more complex/technical cause.** The toolbar-alignment bug took two
  misdiagnosed rounds (chasing a size difference) before the project owner's direct
  correction — "It isn't size, the buttons aren't lined up" — led straight to the real
  cause (a leaked CSS margin) in round 4.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept
more up to date than this file's summary below.

Short version: the full solver/UI stack, the UI consolidation and post-ship bug-fix
passes, the iPad-verification follow-up pass, the clue-number spacing fix, item 10
(scan-existing-puzzle), the per-number clue gray-out fix, the save-to-library
feature, the library-consolidation round, the UI/branding polish round, the
saved/incomplete-puzzle-progress feature, the live drag-fill cell counter, the
toolbar alignment fix, a real geometry bug behind a row-OCR failure (a filled first
row defeating the border-detection heuristic), a focused-input-vs-scroll fix, a
scan-correction numeric-keyboard fix, a repeatable Undo button, a row/column
interaction highlight, and making every played scan auto-publish to the library (so
it saves/undoes/tracks stats like any other puzzle, closing the save-progress gap for
scanned puzzles) are all done, deployed, and **confirmed working on the real device**
(not just preview — see `TODO.md`'s Completed Tasks; the Undo/highlight/save-gate trio
is preview-verified but not yet real-device-confirmed, being UI/Firestore logic rather
than an iOS-Safari-specific bug). Fully public library visibility is confirmed as the
right model. General OCR digit-level noise (as opposed to the geometry bug above) has
been explicitly accepted as "good enough for now." See `TODO.md`'s Completed Tasks for
the full history.

**Current objective**: the main scroll bug's diagnosis broke open this round (the real
bug is a stuck-shrunk `visualViewport.height`, not a stuck pan — every prior round's
`window.scrollTo`-based fix was never capable of touching that variable) and now has a
shipped, researched fix (`healStuckViewportHeight` in `app.js`, a documented WebKit
viewport-recompute workaround). **Waiting on the project owner for real-device
verification** — this project's own preview tooling can't reproduce the real iOS bug,
and five straight prior rounds on this bug class needed real hardware to confirm or
refute. See `TODO.md` for the full capture data and the fix's details.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
