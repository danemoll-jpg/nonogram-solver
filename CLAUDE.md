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
  FOUR rounds** (the original scan-wizard-specific bug took four rounds itself; this
  app-wide regression's round 1 AND round 2 have both since failed real-device testing
  despite passing every local/preview check). **The current leading theory is a
  coverage gap in which events trigger a re-check** — each round has added one more
  specific event listener (focusout, resize, focusin) but a stuck pan can persist
  through transitions none of those cover (closing a modal, navigating screens).
  Consider a periodic/idle re-check instead of chasing individual trigger events one
  at a time. Always get real `?debug=scroll` data from the actual device — this bug
  class has never been reliably reproduced by this project's own tooling.

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
saved/incomplete-puzzle-progress feature, and the live drag-fill cell counter are all
done and deployed. Fully public library visibility is confirmed as the right model.
OCR accuracy has been explicitly accepted as "good enough for now." See `TODO.md`'s
Completed Tasks for the full history.

**Current objective: the scroll bug is NOT resolved, and round 2's fix (deployed and
already reported here previously as "implemented") has now been real-device-tested
and confirmed still failing** — with real new diagnostic data pointing at a specific,
actionable gap:

* A full real-device `?debug=scroll` capture shows the pan getting stuck at
  `offsetTop: 79` and then STAYING stuck through closing the scan wizard (54+
  seconds later) and navigating back to the main play screen — neither of those
  transitions is a `focusout` or `visualViewport resize` event, which are the ONLY
  two triggers round 1 and round 2's fixes listen for. **Recommended next
  direction: stop adding individual event listeners one at a time and consider a
  periodic/idle re-check instead** (poll every so often for "offsetTop nonzero,
  nothing focused" and self-correct regardless of what triggered that state). See
  `TODO.md` for the full timestamped capture and additional diagnosis notes.
* Separately: the `.explain-panel` defensive fix from round 2 appears to actually
  be working in this same capture (its rect stayed within viewport bounds) — a
  real partial win worth keeping, even though the main pan issue remains open.
* Also: the toolbar button height/alignment fix from round 2 does not appear to
  have resolved the visual issue on the real device — "Puzzle library" still
  looks taller than its neighbors in the project owner's screenshot, despite
  passing the earlier desktop-preview measurement. Needs re-verification directly
  on-device, not just via preview numbers.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
