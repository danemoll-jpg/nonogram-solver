# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project exists (`nonogram-pro-e8a31`) for Auth/Firestore/Storage and Cloud
  Functions. The `phraseHint` Cloud Function (`functions/index.js`) is deployed and live,
  confirmed producing real LLM-phrased hints — see `TODO.md` for deploy gotchas hit along the
  way (Blaze plan requirement, several IAM grants, public-invoker access) if redeploying.
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
playable UI with LLM-backed hint phrasing), the UI consolidation pass, and a post-ship
bug-fix/mechanics pass (Clear-all dialog, stray-footer/scroll cleanup, line locking, red
contradiction numbers) are all done — see `TODO.md`'s Completed Tasks for the full
breakdown. The Cloud Function + Netlify deploy objective is done and verified (real LLM
hint phrasing confirmed live) — only remaining step is the project owner's own iPad check.
There's also a small time-boxed fast-follow: `functions/`'s Node 20 runtime is deprecated
and decommissions 2026-10-30, needs bumping to Node 22 before then. Do not start item 10
until the project owner confirms the iPad check. After that, item 10 (scan-existing-puzzle)
is next, rescoped to be self-contained rather than dependent on item 8. Item 8
(arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain deferred
pending their own design pass; check with the project owner before picking either up.