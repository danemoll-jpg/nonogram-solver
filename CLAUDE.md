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

**Current objective: round 2 of the scroll bug (the three follow-ups confirmed after
round 1 shipped, plus the Save-progress placement fix) is now implemented and
committed, but NOT yet real-device-verified** — treat all of it as unverified, not
done, until confirmed on the actual iPhone:
1. **Broadened the fix's trigger — implemented.** `correctResidualViewportPan`
   (`app.js`) no longer just checks "is anything focused" before bailing out; when a
   text input is focused it now checks the input's real `getBoundingClientRect()`
   against the current `visualViewport` pan/height, and corrects via
   `scrollIntoView` (safe while focused) rather than a blind re-zero if the field
   isn't actually visible where the stale pan claims it is. A `focusin` listener was
   added alongside the existing `focusout` one so a field-to-field switch (the
   second capture's repro) gets caught too.
2. **`.explain-panel` counter-translate fix — implemented.** Same defensive
   treatment the diagnostic button/panel already had, applied unconditionally (not
   gated behind `?debug=scroll`) via a small `pinExplainPanelToVisualViewport` IIFE
   in `app.js`, alongside the main correction.
3. **"Save progress" moved to its own main-toolbar button — implemented.** New
   `#btn-save-progress` in `index.html`'s `.library-entry-group`, removed from the
   Help dropdown.

Real-device verification (of round 1's fix AND all three round-2 items above) is
the only remaining step — this bug class has failed that check multiple times
despite passing every local/preview test, so don't treat local verification as
sufficient on its own. See `TODO.md` for the full repro steps and both captures'
exact timestamps.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
