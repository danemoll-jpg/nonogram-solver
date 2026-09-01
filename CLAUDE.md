# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern
  (`C:\Users\danmo\game-hub` — a separate repo Code can access directly).
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing). Firestore also
  backs the puzzle library (`puzzles/{puzzleId}`) and per-user solved-puzzle tracking
  (`users/{uid}/solvedLibraryPuzzles/{puzzleId}`).
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
  multiple times, despite passing every check this project's own tooling can perform
  each time.** The latest repro is specifically keyboard-triggered whitespace that
  persists after the keyboard closes. The `?debug=scroll` diagnostic tool now
  captures `visualViewport.offsetTop`/`pageTop` (the iOS keyboard-pan amount) — get
  real on-device data from it before touching `handleViewportResize`/
  `fitBoardToViewport` again; don't guess blind on this bug class.

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
feature, the library-consolidation round (merged puzzle-selection UI, per-puzzle
solved tracking + personal stats + filters, deployed and verified live), the UI/
branding polish round (Nonogram Pro rebrand, trimmed toolbar, bigger X marks,
Restart, All games, game-hub listing), the saved/incomplete-puzzle-progress
feature (Firestore-backed save/resume, deployed and verified live), and the
live drag-fill cell counter are all done. Fully public library visibility is
confirmed as the right model — no friends-only tier needed. OCR accuracy has
been explicitly accepted as "good enough for now." See `TODO.md`'s Completed
Tasks for the full history.

**Current objective has one item left**:
1. **Scroll bug — fix implemented, NOT YET VERIFIED ON A REAL DEVICE.** Root
   cause: real `?debug=scroll` history from the project owner's device caught a
   full keyboard open/close cycle — iOS panned the visual viewport by 408px to
   clear a focused input, then only reversed 329px of that pan on keyboard
   close, leaving `visualViewport.offsetTop` stuck at 79, confirmed still 79 a
   full second after focus was gone entirely. A known iOS Safari quirk (the
   visual-viewport pan not fully resetting on keyboard dismiss), not a sizing
   bug in this app's own CSS/JS — `fitBoardToViewport`'s sizing math was NOT
   touched. Fix implemented in `app.js` (`correctResidualViewportPan`): on
   `focusout` of a text input and on every `visualViewport` `resize`, if
   `offsetTop` is nonzero and no text input is focused, issue a corrective
   `window.scrollTo` to force iOS to re-zero the pan. **This bug class has
   failed real-device verification multiple times before despite passing every
   local check — do not consider it done until confirmed on the actual iPhone
   with `?debug=scroll`.** See `TODO.md` for the full data and verification
   steps.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
