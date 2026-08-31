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
  over synthetic/guessed pixel data.** This feature's grid/line-detection, OCR, and
  fill-state-detection code has repeatedly had bugs that synthetic mockups missed but a real
  screenshot immediately surfaced — see `TODO.md`'s Completed Tasks for the full history.
- **iOS scroll/touch bugs in this app have proven resistant to incremental CSS fixes.** The
  scan wizard's scroll bug took four rounds; the working fix removed the risky structural
  pattern (an overlay with its own nested scroll region) rather than continuing to patch CSS
  properties on it. Consider that lesson before repeating the same patch-and-retest cycle on
  a similar iOS-only symptom elsewhere.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept more
up to date than this file's summary below.

Short version: items 1–7, the UI consolidation pass, a post-ship bug-fix pass, the
iPad-verification follow-up pass, the clue-number spacing fix, and **item 10
(scan-existing-puzzle flow)** are all done, deployed, and confirmed working. Item 10 — the
project's primary current feature — is complete across grid detection, clue OCR, and
fill-state capture (a new `src/cellStateDetect.js` module restores which cells were already
filled/X-marked in a mid-solve scan, rather than always handing back a blank board), plus a
structural iOS-scroll fix (the wizard is now a full-screen view, not a modal overlay). All
of this was built and repeatedly hardened against the project owner's own real screenshots,
not synthetic mockups alone — see `TODO.md`'s Completed Tasks for the full round-by-round
history and every design tradeoff (`src/gridDetect.js`, `src/scanPuzzle.js`, `src/ocr.js`,
`src/ocrSegment.js`, `src/scanUI.js`, `src/cellStateDetect.js`).

**Current objective is five items from real-world play**, found after item 10 shipped:
(1) clue OCR accuracy and correction tedium — including an idea to cross-check OCR'd clues
against the separately-detected fill state to flag likely-wrong lines automatically; (2) a
bug where the main board stays undersized after returning from the scan wizard until a
puzzle is reselected; (3) eliminating page overscroll bounce app-wide (confirmed: bounce
specifically, not disabling scroll on genuinely-tall content like the scan wizard's
correction list); (4) a bug where dragging to mark cells overwrites already-marked cells it
crosses over, instead of only painting blank ones; and (5) making "Remove bad marks" count
as hint usage in stats, same as an actual hint. See `TODO.md`'s Current Objective for full
detail on each.

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass.