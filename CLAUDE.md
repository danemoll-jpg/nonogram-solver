# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Three callables are deployed: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (item 4's cross-device stats pairing) — see
  `TODO.md` for deploy gotchas hit along the way (Blaze plan requirement, several IAM grants,
  public-invoker access, and — newly, for item 4 — the default Compute Engine service account
  needing an explicit **Cloud Datastore User** IAM role before Cloud Functions can read/write
  Firestore) if redeploying or adding more Firestore-touching functions.
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
completion, grid scales to fill the screen, sound-effect plumbing against placeholder audio,
persistent mute toggle, cross-device stats + pairing via Anonymous Auth, and the bundled
Node 20→22 runtime bump) are all done and coded — see `TODO.md`'s Completed Tasks for the
full breakdown. `phraseHint`, `createPairingCode`, and `redeemPairingCode` are all deployed;
Anonymous Auth is enabled; Firestore is provisioned with `firestore.rules` published.
**Not yet confirmed working end-to-end**: the project owner hit an IAM permissions gap
testing pairing live (see the Tech Stack note above) and applied the fix, but hasn't yet
re-confirmed "Generate a code" actually returns a code. Two real-world follow-ups remain
outside code: the project owner generating real audio files for `assets/sounds/` (the
drag-sweep prototype resolved on a 'retrigger' playback approach — see `TODO.md` for what
kind of asset that means to ask for), and re-confirming pairing works live. Nothing has been
committed/pushed yet — check with the project owner before doing so. Item 10
(scan-existing-puzzle) is next per the project owner, once the above is confirmed. Item 8
(arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain deferred
pending their own design pass; check with the project owner before picking either up.