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
- **iOS scroll/touch bugs in this app have now failed real-device verification across
  FIVE rounds** (the original scan-wizard-specific bug took four rounds itself; this
  app-wide regression's rounds 1, 2, and 3 have all since failed real-device testing
  despite passing every local/preview check — round 3's periodic poll made literally
  no observable difference, pointing at the corrective action itself possibly being
  ineffective on this device, not just a trigger-coverage gap). **Before writing any
  more trigger/polling logic, isolate whether the correction mechanism itself
  actually works when manually forced** — see `TODO.md`'s Current Objective. Always
  get real `?debug=scroll` data from the actual device before treating any fix in
  this area as done.
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
saved/incomplete-puzzle-progress feature, the live drag-fill cell counter, and the
toolbar alignment fix (round 4 — confirmed working on the real device, not just
preview) are all done and deployed. Fully public library visibility is confirmed as
the right model. OCR accuracy has been explicitly accepted as "good enough for now."
See `TODO.md`'s Completed Tasks for the full history.

**Current objective is the one remaining item — the scroll bug**:

**Scroll bug, round 3 — tested on the real device and made no observable
difference at all ("nothing has changed, it is doing the exact same thing").**
This is a significant new finding: round 3's periodic poll (every 400ms,
unconditional) specifically eliminated the trigger-coverage gap round 2's
diagnosis identified — so a continued total failure now points at the
corrective action itself (`window.scrollTo`) possibly not working on this real
device/iOS version, not at when it runs. **Required next step before any more
trigger/polling changes**: isolate mechanism from trigger by adding a manual
"force correct now" button to `?debug=scroll` so the project owner can
reproduce the stuck state and directly observe whether `offsetTop` changes at
all when the correction is deliberately invoked. If it doesn't change even
then, the correction itself is the problem; if manually forcing it does work,
the automatic poll/listeners aren't actually executing and that's the real
bug to chase instead.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
