# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- No backend yet. Firebase (Auth/Firestore/Storage) is planned for accounts, puzzle
  storage, and the shared library (build-order item 9), but not wired up.
- Deploy target: Netlify, static-site mode (`netlify.toml`, `publish = "."`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text (see its comments for the LLM-backend seam that isn't wired up yet).
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
See `README.md` for the full build-order status against the design spec. Short version:
items 1–7 (solver engine, hint/mistake/contradiction logic, full playable UI) are done and
tested; items 8–10 (photo→puzzle generation, Firestore shared library, scan-existing-puzzle)
are deferred pending their own design pass.
