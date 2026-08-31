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
runtime bump), the clue-number spacing fix, and **item 10 (scan-existing-puzzle flow, v1)**
are all done and confirmed working — the spacing fix and item 10 in the live app locally
(item 10 against a synthetic test image only; not yet tried against a real photo or
screenshot). The project owner's actual use case is screenshots of a puzzle rather than a
camera photo of a printed one — a friendlier input (no lighting/skew/camera noise, crisp
digital text) — so the file input no longer nudges mobile browsers toward the camera
(`capture="environment"` removed). The rest is also deployed. See `TODO.md`'s Completed
Tasks for the full breakdown, including item 10's design tradeoffs (`src/gridDetect.js`,
`src/scanPuzzle.js`, `src/ocr.js`, `src/scanUI.js`) and its real-image-testing caveat.

No open Current Objective right now. Item 8 (arbitrary-photo puzzle generation) and item 9
(Firestore shared library) remain deferred pending their own design pass — check with the
project owner before picking either up, or before starting a real-photo tuning pass on
item 10.