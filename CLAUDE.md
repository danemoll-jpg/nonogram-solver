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
- **iOS scroll/touch bugs in this app have now failed real-device verification
  multiple times, despite passing every check this project's own tooling can perform
  each time.** A round-1 fix for keyboard-triggered residual viewport pan is deployed
  but has three confirmed follow-ups still outstanding (see `TODO.md`'s Current
  Objective) — don't treat round 1 alone as done. Always get real `?debug=scroll` data
  from the actual device before further changes to this area.

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
feature, the library-consolidation round, the UI/branding polish round (Nonogram Pro
rebrand, trimmed toolbar, bigger X marks, Restart, All games, game-hub listing), the
saved/incomplete-puzzle-progress feature, and the live drag-fill cell counter are all
done and deployed. Fully public library visibility is confirmed as the right model.
OCR accuracy has been explicitly accepted as "good enough for now." See `TODO.md`'s
Completed Tasks for the full history.

**Current objective: the scroll bug's round-1 fix is deployed but NOT the whole
story** — three real follow-ups were confirmed with the project owner after round 1
shipped, and Code should treat all of them as still outstanding, not already covered:
1. **Broaden the fix's trigger.** A second real capture shows the residual pan can
   settle to a nonzero value while an input is still actively focused (switching
   between two fields mid-keyboard-session), not only after `focusout` — round 1's
   fix explicitly requires no input focused before correcting, so this case isn't
   handled. The real fix needs to compare the current `offsetTop` against what the
   *current* keyboard state actually implies (not just "is anything focused"),
   since forcibly re-zeroing while a field is genuinely focused would break that
   field's visibility above the keyboard.
2. **Apply the diagnostic button's existing defensive counter-translate fix to the
   real player-facing `.explain-panel` too** — confirmed it disappears during the
   same stuck-pan state, the same class of issue as the diagnostic button had
   before its own fix. This is a safety net alongside the main correction, not a
   replacement for it.
3. **Move "Save progress" from the Help menu to its own main-toolbar button** —
   round 1 shipped it under Help; the project owner confirmed afterward it should
   move, same reasoning as Library/Stats leaving Help earlier.

Real-device verification (of round 1 AND all three follow-ups) remains the other
half of "done" — this bug class has failed that check multiple times despite
passing every local/preview test, so don't treat local verification as sufficient
on its own. See `TODO.md` for full data and the second capture's exact timestamps.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
