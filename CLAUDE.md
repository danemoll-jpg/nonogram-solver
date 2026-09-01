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
feature, and the library-consolidation round (merged puzzle-selection UI, per-puzzle
solved tracking + personal stats + filters, deployed and verified live) are all done.
Fully public library visibility is confirmed as the right model — no friends-only
tier needed. OCR accuracy has been explicitly accepted as "good enough for now."
See `TODO.md`'s Completed Tasks for the full history.

**Current objective has three items**:
1. **Scroll bug — ROOT CAUSE CONFIRMED, ready for a targeted fix.** Real
   `?debug=scroll` history from the project owner's device caught a full keyboard
   open/close cycle: iOS panned the visual viewport by 408px to clear a focused
   input, then only reversed 329px of that pan on keyboard close, leaving
   `visualViewport.offsetTop` stuck at 79 — confirmed still 79 a full second after
   focus was gone entirely, exactly matching the tool's own "excess scrollable
   space" measurement. This is a known iOS Safari quirk (the visual-viewport pan
   not fully resetting on keyboard dismiss), not a sizing bug in this app's own
   CSS/JS — don't touch `fitBoardToViewport`'s sizing math. Fix direction: detect
   "keyboard closed but `offsetTop` still nonzero" and issue a corrective
   `window.scrollTo` to force iOS to re-zero the pan. See `TODO.md` for the full
   data and fix approach.
2. **New UI/branding polish round**: tighter toolbar (Stats & pairing → Stats,
   Auto-check into the Help menu, Help becomes a "?" icon), rebrand to "Nonogram
   Pro" with the tagline moved off the play screen and into a new game-hub listing
   (sibling repo, directly accessible), a better icon, bigger/more visible X marks,
   "Clear" becoming a real "Restart" (also resets hint count and elapsed time, not
   just marks), and a new "All games" button back to the hub with a confirmation
   dialog. See `TODO.md` for the full breakdown.
3. **New: saved/incomplete puzzle progress — fully scoped, ready to build.**
   Moderate complexity, reuses the existing scanned-puzzle board-seeding
   mechanism. Save cadence confirmed: explicit in-app triggers only (a "Save"
   button, plus automatic saves on switching puzzles or exiting to the library)
   — no per-move writes, no unreliable browser-level leave detection. See
   `TODO.md` for the full scope.
4. **New: live running count of cells painted while drag-filling** — a small,
   glanceable, transient counter (likely following the cursor/touch point) that
   updates as the player drags, so they can watch it hit a clue's run length
   instead of counting by eye. Primarily for Fill-mode drags; X-mode is a
   lower-priority nice-to-have for consistency.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
