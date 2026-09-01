# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing). Firestore now
  also backs the puzzle library (`puzzles/{puzzleId}`) — see `TODO.md` for deploy
  gotchas if redeploying or adding more Firestore-touching functions/rules.
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
(scan-existing-puzzle), the per-number clue gray-out fix, and the save-to-library
feature (deployed, live, saving works) are all done. OCR accuracy has been explicitly
accepted as "good enough for now" by the project owner, confirmed twice. See
`TODO.md`'s Completed Tasks for the full history and every design tradeoff.

**Current objective has three items**:
1. **New design item: consolidate the two separate puzzle-selection UIs (the old
   top "Puzzle" dropdown of built-in samples, and the newer Help-menu library
   modal) into one — the library modal wins.** Two real follow-on requirements: the
   merged list must hide puzzle names until completion (reuse the existing
   `Puzzle N — RxC` placeholder scheme already used by the dropdown, don't invent a
   new one), and the library's entry point should move out of the Help dropdown
   (browsing puzzles isn't a help action) to roughly where the old dropdown lived.
   Built-in samples don't need to migrate into Firestore — just merge both sources
   into one UI list. **Additional scope added this round, some of it real new
   backend work**: reveal a puzzle's real name once the current (or cross-device-
   paired) user has solved it, a solved-status badge, per-puzzle solved/unsolved
   filters and a size filter, and public per-puzzle aggregate stats (times solved,
   fastest time) — the last of which should go through a new server-side Cloud
   Function (following this project's existing pairing-callable pattern) rather
   than a direct client write, since a client-writable "fastest time" field is
   gameable. Also: "Stats & pairing" moves out of the Help dropdown too and gets
   grouped with the library (exact UI shape left to Code's judgment). See
   `TODO.md` for full scope and the size/timeline flag on the aggregate-stats
   piece specifically.
2. **Scroll bug — now with a much sharper repro**: whitespace appears specifically
   after the on-screen keyboard has been used, and persists afterward; no issue
   before any keyboard interaction. Points at the keyboard-triggered resize/re-fit
   path (`handleViewportResize`, `app.js`) leaving something in a wrong state once
   the keyboard closes, rather than a general layout bug. Also need to confirm
   whether the `?debug=scroll` diagnostic button was actually visible/usable in this
   specific scenario — the project owner tried it but isn't sure it captured
   anything.
3. **Bug: a puzzle saves to the library successfully but doesn't show up in the
   library list afterward.** Confirmed write-side works; this is a read/refresh
   problem. Likely causes to check: the library modal not re-fetching after a save
   completes, or a `serverTimestamp()`/`orderBy` race where a brand-new document's
   timestamp isn't resolved yet when the list is queried immediately after saving.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope (private/friends sharing, richer
browsing) also remains deferred — the save-to-library slice is done.
