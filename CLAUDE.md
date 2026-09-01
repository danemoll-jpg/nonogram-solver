# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern.
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing) — see `TODO.md`
  for deploy gotchas if redeploying or adding more Firestore-touching functions.
- Deploy target: Netlify, static-site mode. The Netlify site auto-deploys from this
  repo's `main` branch — live at https://nonogrampro.netlify.app/.
- Tesseract.js (OCR, item 10's scan-existing-puzzle flow) is loaded lazily from the CDN
  as an ES module (`src/ocr.js`) — its ESM build has no named exports, only a default
  export bundling everything (`(await import(url)).default`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text.
- Each module in `src/` does one job — don't collapse them together.
- Favor small pure functions over classes; `Board` is the one stateful class.
- Comments should explain *why*, especially design tradeoffs.
- No test framework installed — `test/harness.js` is a ~40-line custom runner. Prefer
  differential/property-style tests over hand-picked examples when correctness is
  subtle.
- **Item 10 (scan-existing-puzzle) specifically: prefer testing against a real image
  file over synthetic/guessed pixel data.** See `TODO.md`'s Completed Tasks for the full
  history, including a confirmed real ground-truth reference puzzle
  (`scratch-images/sample-mid-solve.jpg`) reusable for future OCR-accuracy verification.
- **iOS scroll/touch bugs in this app have now failed real-device verification THREE
  times across two separate underlying bugs, despite passing every check this
  project's own tooling can perform each time.** This is a strong signal that the
  verification tooling itself cannot reproduce the real trigger — **before writing
  another CSS/JS fix, get real on-device diagnostic data first**: have the project
  owner load the app with `?debug=scroll` on the affected device and report what the
  existing `initScrollDiagnostics` tool (`app.js`) actually shows. Do not ship another
  fix based only on browser-preview verification for this bug class.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept
more up to date than this file's summary below.

Short version: the full solver/UI stack, the UI consolidation and post-ship bug-fix
passes, the iPad-verification follow-up pass, the clue-number spacing fix, and item 10
(scan-existing-puzzle — grid detection, clue OCR, fill-state capture) are all done and
deployed, hardened across many real-screenshot rounds. See `TODO.md`'s Completed Tasks
for the full history, every design tradeoff, and the confirmed ground-truth reference
puzzle.

**Current objective has three items, all found during the latest real-device round**:
1. **Scroll bug — diagnostic tool investigated + hardened; underlying bug still open.**
   Confirmed `initScrollDiagnostics` already renders visibly (a real button + report
   panel, not console-only) and is already live on production (fetched the deployed
   `app.js` directly and confirmed it's there) — ruling out both the "console-only"
   and "stale deploy" theories from last round. Found a real, code-grounded reason the
   trigger button specifically could still be invisible on-device: it was
   top-anchored, but the round-2 fix (permanently non-scrollable `<html>`/`<body>`)
   means iOS's chrome can likely no longer ever auto-collapse (that collapse is driven
   by document scrolling, per this file's own comment), so it may sit permanently
   expanded, hiding anything pinned near the top. Fixed by moving the diagnostic
   button/panel to bottom-anchored (matching `.explain-panel`, already proven safe on
   real iOS) — the underlying document-lock fix itself was deliberately NOT touched.
   **Needs the project owner to retry `?debug=scroll` on-device** and report what the
   now-hopefully-visible tool shows.
2. **Per-number clue gray-out (`anchoredClueNumbers`) — investigated; confirmed NOT
   broken.** Traced the full render path (no scan-only branch exists) and reproduced
   real gameplay (actual pointer events, not synthetic clicks) against a normal
   puzzle in browser preview: bounding a clue's run with a confirmed-empty cell on
   both sides correctly dims just that number. Likely explanation for the real-device
   report: the anchoring check requires a run bounded on both sides by a *confirmed*
   empty, which a freshly-loaded, lightly-played normal puzzle won't have yet — while
   a scanned puzzle's pre-filled `initialMarks` can satisfy that instantly on load.
   No code change made (didn't want to guess without a found bug) — see TODO.md for
   the exact repro steps to retry on-device.
3. **OCR residual-error question, not a bug to silently fix**: a previously-flagged,
   distinct dropped/extra-digit OCR issue is confirmed still present on real-device
   testing. Asked the project owner directly this round whether the current
   (much-improved, mostly correct) accuracy is acceptable given the correction step
   already catches remaining errors, rather than assuming further chasing is
   automatically worthwhile.
4. **Save-to-library feature — client-side implementation done, NOT yet deployed.**
   Save a scanned puzzle to a public shared library, reusing the scan wizard as the
   authoring tool (`src/puzzleLibrary.js`, plus wiring in `src/scanUI.js`/`app.js`/
   `index.html`). Saving always writes a blank puzzle (grid + clues only, never
   current fill marks), fully decoupled from the player's own current scan session.
   A puzzle played from the library behaves like a normal authored puzzle (real move
   history, counts toward stats). Required title at save time; creator-only
   title-edit rename affordance in the library browse UI. **Blocking step before
   this is live: deploy the updated `firestore.rules`** (`firebase deploy --only
   firestore:rules`) — the project owner needs to run this themselves. See
   `TODO.md` for the full writeup and post-deploy verification checklist.

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9 is no longer fully deferred — its save-to-library slice
(item 4 above) is active work this round; only the remaining parts (friends-only/
private sharing, richer browsing/search) are still deferred.