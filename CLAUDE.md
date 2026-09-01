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

**Current objective has four active items**, all from real-device testing of the
known-count override:
1. A likely column-crop double-read bug — the project owner directly observed what
   looks like two overlapping columns of digits in some column crops, which would
   explain both dropped numbers and garbled/merged reads at once. This points at a
   column-band width/positioning bug (`computeClueBands`/`sliceVertical` in
   `gridDetect.js`), not general OCR imprecision — verify against the real crop pixels
   before changing any width math.
2. An app-wide scroll regression, confirmed still present on real iOS hardware despite
   the previous round's fix (which was only verified in the browser preview). New
   detail this round: every screen can scroll into genuine blank whitespace beyond real
   content, on every screen — not isolated to the keyboard or the scan wizard. See
   `TODO.md`'s Current Objective for the recommended measurement-first approach given
   this bug class's history in this project.
3. An observation, not a bug to fix: the red-flag consistency check is a pure
   feasibility check, not a correctness check, so it predictably misses real errors and
   flags some fine lines — worth stating plainly to the project owner as a known
   limitation rather than chasing further.
4. A new, more specific idea worth prototyping (same treatment as the reverted
   truncated-glyph signal — build, test against the real image, keep only if it doesn't
   misfire): flag a single outlier digit sitting among an otherwise-uniform run of the
   same digit within one line, since nothing currently catches e.g. a lone `7` misread
   among four `1`s.
5. **Full ground-truth rows/columns for this exact 25×25 test puzzle are now recorded
   in `TODO.md`** (confirmed line-by-line with the project owner) — use it to write a
   real regression test and precisely diff actual vs. correct output, rather than
   judging fixes by visual impression.

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass.