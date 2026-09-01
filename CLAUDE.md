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
  properties on it — and a scroll regression has since recurred post-fix (see `TODO.md`'s
  Current Objective). Always verify on real hardware, including with an on-screen keyboard
  genuinely open where relevant, not just a simulator or desktop responsive view.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept more
up to date than this file's summary below.

Short version: items 1–7, the UI consolidation pass, a post-ship bug-fix pass, the
iPad-verification follow-up pass, the clue-number spacing fix, item 10 (scan-existing-
puzzle flow, complete across grid detection/clue OCR/fill-state capture), a
five-item real-world-feedback round (OCR-vs-fill-state cross-check flagging, an
undersized-board-on-return bug, app-wide overscroll-bounce removal, a drag-overwrite bug,
and "Remove bad marks" counting as hint usage), and a known-row/col-count override for the
scan wizard's recheck-warning UX (fixes the original 25-vs-26 grid miscount directly; a
companion truncated-glyph detection idea was tried, tested against a real image, and
dropped as unreliable — see `TODO.md`) are all done and deployed. See `TODO.md`'s
Completed Tasks for the full round-by-round history and every design tradeoff
(`src/gridDetect.js`, `src/scanPuzzle.js`, `src/ocr.js`, `src/ocrSegment.js`,
`src/scanUI.js`, `src/cellStateDetect.js`).

**Current objective**: an iOS scroll regression, both symptoms (baseline overflow with no
keyboard, and extra whitespace once the on-screen keyboard opens) root-caused and fixed —
see `TODO.md`'s Current Objective for the three separate baseline causes and the
`visualViewport`/`dvh` keyboard fix. **Verified only in the browser preview so far; still
needs real iOS hardware confirmation (keyboard genuinely open) before this is done**, per
this project's own repeated history with this exact bug class.

Item 8 (arbitrary-photo puzzle generation) and item 9 (Firestore shared library) remain
deferred pending their own design pass.