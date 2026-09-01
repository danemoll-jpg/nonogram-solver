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
  history, including a confirmed real ground-truth reference puzzle
  (`scratch-images/sample-mid-solve.jpg`) reusable for future OCR-accuracy verification.
- **iOS scroll/touch bugs in this app have proven resistant to incremental CSS/JS
  fixes, across two separate bugs now.** The original scan-wizard scroll bug took four
  rounds; a subsequent app-wide scroll regression failed real-device verification
  twice, even after a specific, plausible-sounding root cause was found and fixed in
  the browser preview. Round 2 (see `TODO.md`) switched to a structural fix —
  `<html>`/`<body>` permanently non-scrolling, one region owning real scroll at a
  time — but **that fix is still only verified in browser preview, not on real
  hardware**; this project's history says that gap has mattered before, so don't treat
  it as resolved until it's actually tested on the device. When investigating this
  class of bug: use the `?debug=scroll` diagnostic tool (`initScrollDiagnostics` in
  `app.js`) to get real on-device measurements rather than reasoning from a plausible
  mechanism alone.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept
more up to date than this file's summary below.

Short version: the full solver/UI stack (items 1–7), the UI consolidation and post-ship
bug-fix passes, the iPad-verification follow-up pass, the clue-number spacing fix, and
**item 10 (scan-existing-puzzle)** are all done and deployed. Item 10 has been hardened
across many real-screenshot rounds, including two confirmed, root-caused, and fixed
bugs verified with real before/after data: a column-band geometry bug that caused
cross-column digit bleed (fixed via a single shared border-centered rect for both
cell-slicing and clue-band slicing), and a repeated-digit consistency check
(`findRepeatedDigitOutlier`) that was built, tested against 50 real ground-truth
clue-lines, tightened after catching its own false positive, and shipped. See
`TODO.md`'s Completed Tasks for the full history, every design tradeoff
(`src/gridDetect.js`, `src/scanPuzzle.js`, `src/ocr.js`, `src/ocrSegment.js`,
`src/scanUI.js`, `src/cellStateDetect.js`), and the confirmed ground-truth reference
puzzle.

**The four items from that "latest real-device round" are now all addressed** (see
`TODO.md`'s Completed Tasks for full writeups): the `11`→`1` OCR misread is root-caused
and fixed (a genuine Tesseract recognition failure, not the geometry — fixed via a
per-glyph OCR fallback with neighbor-clamped padding); clue-number legibility on large
puzzles is fixed (font size now floors independently of shrinking `--cell-size`);
per-number clue gray-out is shipped (`anchoredClueNumbers`, `lineSolver.js`, verified
by a brute-force soundness differential test). **The app-wide scroll bug got a
structural fix (`<html>`/`<body>` now permanently non-scrolling, generalizing the same
technique already proven safe for modals in this codebase) but is the one item NOT yet
confirmed on real hardware** — this project's own history is explicit that a fix
verified only in browser preview has already failed real iOS hardware twice for this
exact bug, so treat it as unresolved until tested on the actual device. A second,
distinct OCR bug (single-digit clue numbers dropping out on long lines) was found
during this round's verification but deliberately left unfixed — see `TODO.md`.

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass.