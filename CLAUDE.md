# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing). Firestore also
  backs the puzzle library (`puzzles/{puzzleId}`) and per-user solved-puzzle tracking
  (`users/{uid}/solvedLibraryPuzzles/{puzzleId}`) — see `TODO.md` for deploy gotchas if
  redeploying or adding more Firestore-touching functions/rules.
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
- **iOS scroll/touch bugs in this app have now failed real-device verification
  multiple times, across two separate underlying bugs, despite passing every check
  this project's own tooling can perform each time.** The latest round narrowed the
  repro specifically to keyboard-triggered whitespace that persists after the
  keyboard closes (previously it was just "sometimes scrolls into whitespace") —
  use that specificity, not the old vague framing, when investigating next. Always
  get real `?debug=scroll` data from the actual device, and confirm the diagnostic
  tool itself is visible/usable in the exact scenario under test before trusting its
  absence of output.

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
feature, and the library-consolidation round (merged puzzle-selection UI, per-puzzle
solved tracking + personal stats + filters, deployed and verified live) are all done.
OCR accuracy has been explicitly accepted as "good enough for now" by the project
owner, confirmed twice. See `TODO.md`'s Completed Tasks for the full history and
every design tradeoff.

**Current objective has one open item** (the library-consolidation round's one
deliberately-deferred piece — an optional global fastest-time-per-puzzle stat,
which would need a Cloud Function to avoid a gameable public field — is not it;
pick that up only if the project owner asks for it):

* **Scroll bug — now with a much sharper repro**: whitespace appears specifically
  after the on-screen keyboard has been used, and persists afterward; no issue
  before any keyboard interaction. Points at the keyboard-triggered resize/re-fit
  path (`handleViewportResize`, `app.js`) leaving something in a wrong state once
  the keyboard closes, rather than a general layout bug. The `?debug=scroll` tool
  itself has since been upgraded (always-on history log, `visualViewport.offsetTop`/
  `pageTop` now captured, button/panel pinned against a stuck viewport pan) — see
  TODO.md's "Round 3" note — but the underlying bug is still unfixed and unverified
  on real hardware; don't touch `handleViewportResize`/`fitBoardToViewport` again
  without an actual on-device `offsetTop` reading from the new tool.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope (private/friends sharing, richer
browsing) also remains deferred — the save-to-library slice is done.
