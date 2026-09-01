# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing) — see `TODO.md`
  for deploy gotchas (Blaze plan requirement, IAM grants including a Cloud Datastore User
  role on the default Compute Engine service account, and public-invoker access) if
  redeploying or adding more Firestore-touching functions.
- Deploy target: Netlify, static-site mode. The Netlify site auto-deploys from this
  repo's `main` branch — live at https://nonogrampro.netlify.app/.
- Tesseract.js (OCR, item 10's scan-existing-puzzle flow) is loaded lazily from the CDN
  as an ES module (`src/ocr.js`) — its ESM build has no named exports, only a default
  export bundling everything (`(await import(url)).default`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text. It calls a Firebase Cloud Function (`phraseHint`) by default and
  falls back to a deterministic template if that call fails — hints should never go
  missing.
- Each module in `src/` does one job (data model, line solving, hint orchestration,
  contradiction search, mistake handling, phrasing) — don't collapse them together.
- Favor small pure functions over classes; `Board` is the one stateful class, and it
  exists specifically to own move history for undo-to-point.
- Comments should explain *why*, especially design tradeoffs.
- No test framework installed — `test/harness.js` is a ~40-line custom runner. Prefer
  differential/property-style tests over hand-picked examples when correctness is
  subtle.
- **Item 10 (scan-existing-puzzle) specifically: prefer testing against a real image
  file over synthetic/guessed pixel data.** This feature's grid/line-detection, OCR, and
  fill-state-detection code has repeatedly had bugs that synthetic mockups missed but a
  real screenshot immediately surfaced — see `TODO.md`'s Completed Tasks for the full
  history.
- **iOS scroll/touch bugs in this app have proven resistant to incremental CSS fixes,
  more than once.** The scan wizard's original scroll bug took four rounds; a
  subsequent app-wide scroll regression's own multi-part fix has since failed real-device
  re-verification too (see `TODO.md`'s Current Objective). When investigating this class
  of bug, prefer directly measuring the real gap on a real device (e.g. `scrollHeight`
  vs. viewport height per screen) over proposing another plausible CSS fix blind, and
  always verify on real hardware — this project's own tooling cannot reliably reproduce
  it.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept
more up to date than this file's summary below.

Short version: the full solver/UI stack (items 1–7), the UI consolidation and post-ship
bug-fix passes, the iPad-verification follow-up pass, the clue-number spacing fix, and
**item 10 (scan-existing-puzzle)** — including grid detection, clue OCR, fill-state
capture, and a known-row/col-count override that fixed the original 25-vs-26 column
miscount — are all done and deployed. Item 10 in particular has been hardened against
the project owner's own real screenshots across many rounds; see `TODO.md`'s Completed
Tasks for the full history and every design tradeoff (`src/gridDetect.js`,
`src/scanPuzzle.js`, `src/ocr.js`, `src/ocrSegment.js`, `src/scanUI.js`,
`src/cellStateDetect.js`).

**Current objective has one open item left**, from real-device testing of the
known-count override — of the other four, two are fixed and shipped, one was always
just a documented non-issue (not a task), and one is a reusable reference (see
`TODO.md`'s Completed Tasks for full detail):
- ~~Column-crop double-read bug~~ — confirmed against real crop pixels, root-caused
  (clue-band slicing used a plain border-snapped rect instead of the border-centered one
  cell-slicing already used, causing per-column pitch error to compound across the
  strip), fixed in `src/scanUI.js`, and verified with a real before/after OCR diff
  against the ground-truth puzzle below. Regression test in `test/gridDetect.test.js`.
- ~~Repeated-digit consistency check~~ — built, tested against all 50 real ground-truth
  lines (below), tightened after real data caught a false positive, and shipped as a
  distinct amber "suspect" flag in the scan wizard (`findRepeatedDigitOutlier` in
  `src/ocrSegment.js`, wired into `src/scanUI.js`).
- **App-wide scroll bug — fix implemented this round, still needs real-device
  confirmation.** The project owner corrected the diagnosis: it's not extra scrollable
  space, it's the screen moving on its own during ordinary scrolling with nothing on
  screen to justify it. Root cause: `fitBoardToViewport` (`app.js`) recomputed board
  sizing on every `resize`/`visualViewport resize` event, including the ones iOS fires
  constantly as its chrome bar collapses/expands during normal scrolling — each
  recompute nudged page height enough for iOS to compensate by shifting scroll position.
  Fixed by gating those listeners behind a magnitude threshold
  (`handleViewportResize`/`VIEWPORT_CHANGE_THRESHOLD_PX`, `app.js`) so routine chrome
  noise no longer triggers a re-layout, while a real keyboard/rotation/resize still
  does. Verified in the browser preview (manually dispatched resize events at both a
  below-threshold and above-threshold delta); **real iPhone confirmation is still
  outstanding** — this bug class has failed that confirmation twice before, so don't
  treat preview verification as done here. An on-device `?debug=scroll` measurement
  tool (`app.js`'s `initScrollDiagnostics`) also exists as a fallback if the screen
  still moves after this fix.
- Not a bug, just documented: the scan wizard's red-flag consistency check
  (`isLineConsistent`) is a pure feasibility check, not a correctness check, so it
  predictably misses real errors and flags some fine lines — a known limitation, not
  something to chase further.
- Full ground-truth rows/columns for the 25×25 real test puzzle used throughout this
  investigation are recorded in `TODO.md` (confirmed line-by-line with the project
  owner) — reusable for verifying future OCR-accuracy work.

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass.