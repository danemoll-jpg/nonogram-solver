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
bug-fix/mechanics pass, and the iPad-verification follow-up pass (puzzle-name hidden until
completion, grid scales to fill the screen, sound-effect plumbing and real audio files,
persistent mute toggle, cross-device stats + pairing via Anonymous Auth, and the Node 20→22
runtime bump) are all done, deployed, and confirmed working live. See `TODO.md`'s Completed
Tasks for the full breakdown.

Current objective has two parts, meant to ship together in one push: a still-open
clue-number spacing bug (multi-number clues like `1, 1` can misread as `11`, likely tied to
the dynamic `--cell-size` scaling — CSS-only, no Cloud Function deploy needed), and **item
10, scan-existing-puzzle flow** (read an already-printed puzzle from a photo/scan — grid
detection + clue OCR + a user-correction step — self-contained rather than waiting on item
8). Bundle both into the same commit/push rather than deploying the spacing fix separately.

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass; check with the project owner before picking either
up.