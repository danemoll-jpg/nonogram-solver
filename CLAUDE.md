# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Three callables are deployed and confirmed working: `phraseHint`
  (LLM hint phrasing) and `createPairingCode`/`redeemPairingCode` (cross-device stats
  pairing) — see `TODO.md` for deploy gotchas hit along the way (Blaze plan requirement,
  several IAM grants, public-invoker access, and the default Compute Engine service account
  needing an explicit **Cloud Datastore User** IAM role before Cloud Functions can
  read/write Firestore) if redeploying or adding more Firestore-touching functions.
- Deploy target: Netlify, static-site mode (`netlify.toml`, `publish = "."`). The Netlify
  site is connected and auto-deploys from this repo's `main` branch — live at
  https://nonogrampro.netlify.app/.
- Tesseract.js (OCR, item 10's scan-existing-puzzle flow) is also loaded lazily from the CDN
  as an ES module (`src/ocr.js`), same no-bundler pattern as `src/firebase.js` — note its ESM
  build has no named exports, only a default export bundling everything
  (`(await import(url)).default`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text. It calls a Firebase Cloud Function (`phraseHint`) by default and
  falls back to a deterministic template if that call fails (offline, not deployed yet,
  transient error) — hints should never go missing.
- Each module in `src/` does one job (data model, line solving, hint orchestration,
  contradiction search, mistake handling, phrasing) — don't collapse them together.
- Favor small pure functions over classes; `Board` is the one stateful class, and it exists
  specifically to own move history for undo-to-point.
- Comments should explain *why*, especially design tradeoffs (see `lineSolver.js` for an
  example of documenting a bug that was caught by testing and how it was fixed).
- No test framework installed — `test/harness.js` is a ~40-line custom runner. Add new
  solver logic with a corresponding test in `test/`, and prefer differential/property-style
  tests (see `test/lineSolver.test.js`'s brute-force check) over hand-picked examples alone
  when correctness is subtle.
- **Item 10 (scan-existing-puzzle) specifically: prefer testing against a real image file
  over synthetic/guessed pixel data.** This feature's grid/line-detection and OCR code has
  repeatedly had bugs that synthetic mockups missed but a real screenshot immediately
  surfaced (a swamped global threshold, a three-tier line-darkness scheme, filled-cell
  brightness drift, a scrollbar-like false positive, OCR digit-merging) — see `TODO.md`'s
  Completed Tasks for the full history. This applies to any further work in this area,
  including the current fill-state-detection objective.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept more
up to date than this file's summary below.

Short version: items 1–7 (solver engine, hint/mistake/contradiction logic, and a full
playable UI with LLM-backed hint phrasing), the UI consolidation pass, a post-ship
bug-fix/mechanics pass, the iPad-verification follow-up pass (puzzle-name hidden until
completion, grid scales to fill the screen, sound-effect plumbing and real audio files,
persistent mute toggle, cross-device stats + pairing via Anonymous Auth, and the Node 20→22
runtime bump), the clue-number spacing fix, and **item 10 (scan-existing-puzzle flow)** are
all done, deployed, and confirmed working. Item 10 in particular has been tested
end-to-end against the project owner's own real screenshots across three rounds of fixes:
the original missing-confirm-button bug, a full redesign (auto-detect the grid on load with
a highlighted/adjustable overlay, manual drag as fallback), then two deeper rounds of
real-screenshot-driven fixes covering grid-detection accuracy (filled/X-marked cells, a
scrollbar-like false positive, a dark app-chrome background swamping naive thresholds) and
OCR accuracy (clue numbers merging together with no space — fixed via pixel-geometry gap
analysis in `src/ocrSegment.js`, not by trusting Tesseract's own word-spacing). Item 10 is
confirmed as the project's primary current feature, not a side item. See `TODO.md`'s
Completed Tasks for the full round-by-round breakdown and every design tradeoff
(`src/gridDetect.js`, `src/scanPuzzle.js`, `src/ocr.js`, `src/ocrSegment.js`,
`src/scanUI.js`).

**Current objective, now greenlit after a design discussion with the project owner**:
capture the puzzle's CURRENT FILL STATE from a scan (green filled/X-marked cells), not just
its clues — today, scanning a mid-solve puzzle silently discards existing progress and
hands back a blank board, which undercuts the project's actual core use case (mid-solve
scanning to get unstuck on a mistake). See `TODO.md`'s Current Objective for the full
design sketch (per-cell fill/X classification relative to the puzzle's own detected
background rather than a hardcoded color, a new click-to-correct wizard step, and why it
matters: restored fill state can run through the *existing* mistake-checker immediately).

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass — check with the project owner before picking either
up.