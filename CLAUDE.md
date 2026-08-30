# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project exists (`nonogram-pro-e8a31`) for Auth/Firestore/Storage and Cloud
  Functions. Nothing beyond the initial project setup is wired up yet — see `TODO.md`'s
  Current Objective for the first thing being built on it (a Cloud Function for
  LLM-backed hint phrasing).
- Deploy target: Netlify, static-site mode (`netlify.toml`, `publish = "."`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text. This currently uses a deterministic template; see `TODO.md` for the
  in-progress swap to a real LLM call via Firebase Cloud Function.
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

Short version: items 1–6 (solver engine, hint/mistake/contradiction logic, and a first
playable UI) are done and tested. Item 7, a puzzle UI refinement pass plus real LLM-backed
hint phrasing via a Firebase Cloud Function, is the active objective — see `TODO.md` for
the full breakdown. Items 8–10 (photo→puzzle generation, Firestore shared library,
scan-existing-puzzle) remain deferred pending their own design pass.