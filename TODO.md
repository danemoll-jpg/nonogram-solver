Active Development Plan

Completed Tasks

* Data model — cell states, clue derivation, `Board` w/ move history (`src/model.js`)
* Line-solving engine: overlap, edge/completion, general/gap-forcing + cross-line propagation (`src/lineSolver.js`, `src/solver.js`)
* Hint orchestration — one structured deduction per technique application
* Mistake handling: auto-check, on-demand check w/ undo-to-point, remove-bad-marks (`src/mistakes.js`)
* On-demand contradiction search for genuinely stuck states (`src/contradiction.js`)
* Full playable UI — click/right-click/drag marking, clue graying, hint highlighting (`index.html`, `app.js`, `styles.css`)
* 425-test suite, incl. a brute-force differential test of the line solver
* `CLAUDE.md` project context file
* **Item 7 — puzzle UI refinement pass** (mode toggle, 5×5 chunking, solver-based auto-X,
  auto-check mistake pop-up, puzzle-complete modal, real LLM-backed hint phrasing via
  Firebase Cloud Function). All six sub-items landed — summarized here since it's
  long-settled.
* **UI consolidation pass + auto-X-on-hint fix** — single "Help" dropdown replacing
  scattered panels, persistent bottom-anchored explanation panel, auto-X now runs on the
  hint path too.
* **Post-ship bug fixes**: Clear All (native `window.confirm()` silently suppressed in some
  contexts — replaced with an in-page dialog), stray "TODO" footer text removed, line
  locking added on top of auto-X (`isLineLocked` in `src/model.js`), red clue numbers for
  genuine contradictions (`isLineConsistent` in `src/lineSolver.js`, DP-based feasibility
  check, not brute force).

  **Existing Firebase project config** (already created; used by `src/firebase.js`):
  ```js
  const firebaseConfig = {
    apiKey: "AIzaSyDGKW2ZrpieqZQuL75XLjIAU0z7vovrnRM",
    authDomain: "nonogram-pro-e8a31.firebaseapp.com",
    projectId: "nonogram-pro-e8a31",
    storageBucket: "nonogram-pro-e8a31.firebasestorage.app",
    messagingSenderId: "537841607435",
    appId: "1:537841607435:web:ec0c35f40f7053ba9db80e"
  };
  ```
  Note: this config's `apiKey` is a normal public Firebase web-app identifier, not a secret
  — safe to check in. The LLM provider's API key is the one that must stay server-side
  inside the Cloud Function only.

* **Post-iPad-verification pass**: puzzle name hidden until completion, grid scales to fill
  available screen space (`fitBoardToViewport`, one `--cell-size` CSS variable everything
  else scales off of), sound-effect plumbing + real audio files in `assets/sounds/`
  (drag-sweep uses a 'retrigger' short-tick approach, not a long glissando), persistent
  mute toggle, cross-device stats + pairing via Firebase Anonymous Auth
  (`createPairingCode`/`redeemPairingCode`, per-uid Firestore rules, 10-minute code expiry,
  cumulative bucket-summed stats merge on redemption — confirmed working live), and a
  bundled Node.js 20→22 runtime bump. Deploy gotchas worth remembering for any future
  Firebase redeploy: Blaze plan required for 2nd-gen functions, the default Compute Engine
  service account needs an explicit **Cloud Datastore User** IAM role added by hand
  (console.cloud.google.com → IAM & Admin → IAM) before Firestore access works, and a
  callable function defaults to "Require authentication" and needs "Allow public access"
  explicitly set.

* **Clue-number spacing bug — fixed.** Multi-number clues (e.g. `1, 1`) were misreadable as
  `11` at large `--cell-size` values — gap now uses `em` instead of `rem` so it scales with
  the font. CSS-only.

* **Item 10 — Scan-existing-puzzle flow: complete across grid detection, clue OCR, and
  fill-state capture. This is the project's primary current feature, not a side item**
  (per the project owner: get unstuck on a real puzzle when stuck). New "Scan a puzzle"
  entry opens a wizard: pick an image → confirm the detected (or manually-drawn) grid →
  OCR each clue strip → correct any misreads → review/correct detected fill state → solve
  and play, as a `source: 'scan'` puzzle (no move history; never counts toward stats).
  1. **v1**: `src/gridDetect.js` (pure, unit-tested) — cell/clue-margin boundaries as an
     even subdivision of one detected outer rectangle. `src/ocr.js` — Tesseract.js loaded
     lazily from CDN (default-export-only build — `(await import(url)).default`).
     `src/scanPuzzle.js` — derives a solution from confirmed clues via `fullSolve.js`.
     `src/scanUI.js` — the wizard's DOM/canvas layer.
  2. **Redesign**: replaced manual-drag-then-hidden-button with auto-detect-on-load +
     highlighted adjustable overlay + one always-enabled "Looks good" confirm button
     (`gridDetect.js`'s `findGridCandidates`/`detectBestGrid`, requiring ≥4 lines per axis
     to reject ordinary UI chrome, scored and confidence-gated before auto-accepting).
  3. **Real-screenshot round 1**: fixed a global-threshold-swamped-by-dark-background bug
     (`adaptiveBinarize`, tile-local thresholding) and an Otsu-can't-handle-three-
     darkness-tiers undercount bug (`inkThreshold`, background-percentile-relative cut).
     Confirmed mid-solve scanning is the actual core use case, not an edge case.
  4. **Real-screenshot round 2**: fixed filled/X-cells shifting a whole line's average
     brightness past what one threshold can handle (`countDarkRunsLocal`, multi-pass local
     background estimate) and a scrollbar-like false positive merging into the grid's line
     cluster (`trimClusterEndOutliers`, end-only trimming so real internal gaps aren't
     mistaken for the same problem).
  5. **Real-screenshot round 3**: fixed "Looks good" growing the confirmed box onto
     dark clue-number background chips (`snapRectToBorder` search radius 4%→1%) and OCR
     silently merging adjacent clue numbers with no separator — fixed via new
     **`src/ocrSegment.js`** (real-measured ~10-12px intra-number vs. ~18-27px
     inter-number pixel gaps; OCR each whole line for context-accuracy, then re-split
     using real pixel-geometry glyph counts, falling back to isolated per-number OCR only
     when digit counts disagree).
  6. **Fill-state detection**: new pure module `src/cellStateDetect.js` —
     `estimateBackgroundColor` (a color mode over pooled cell pixels, not a hardcoded
     palette) and `classifyCellPixels` (FILLED/EMPTY/UNKNOWN, using a two-part
     diagonal-AND-span test for X-marks so a stray straight line through a cell's center
     isn't mistaken for an X). Fixed a real bug where this screenshot's unusually thick
     outer border offset the even-subdivided cell boundaries inward, corrupting
     classification near the edges — new `gridDetect.js` export `centerRectOnBorders`
     (walks inward only from a rough edge to the border's true inner edge; outward search
     is unreliable here since the clue margin sits flush against the border with no white
     gap). New wizard step: a compact clickable grid previewing detected state, cycling
     UNKNOWN→FILLED→EMPTY→UNKNOWN on click (same order normal play already uses). Feeds
     into a new `puzzle.initialMarks` field, seeded via `Board.fromGrid` — fits the
     existing snapshot-origin `Board` shape with no data-model change, as the original
     design sketch predicted. Verified against real screenshot crops directly and via a
     full wizard walkthrough (synthetic puzzle with known ground truth, including a manual
     correction surviving into the final playable board).
  7. **iOS scroll bug — four rounds to actually fix.** The scan wizard couldn't be
     scrolled on a real iOS device. Three CSS-only attempts on the modal shape each fixed
     the reported symptom and broke or missed the next one on-device (nested-scroll
     conflict → missing background-scroll lock → that lock's own `position: fixed` side
     effect breaking the modal's own scroll). **The fix that actually worked was
     architectural**: the scan wizard is no longer a modal overlay at all — it's a
     full-screen view that replaces the normal page content in the DOM (`.scan-screen` in
     `styles.css`, `openWizard`/`closeWizard` in `scanUI.js`), scrolled by the browser's
     own native page scroll instead of a nested `overflow` region fighting a
     `position: fixed` ancestor. **Confirmed working on a real iOS device.** General
     lesson for this app: when an iOS-only scroll/touch bug survives a couple of targeted
     CSS fixes, consider removing the risky structural pattern (overlay + nested scroll)
     rather than continuing to patch it — each on-device retest round has a real cost.
  8. **Status: functionally complete, confirmed working on a real device.** 493+ tests
     passing (all real-data-driven). See Current Objective below for post-ship feedback
     from further real-world use.

Current Objective (Focus Area)

* **Five items from real-world play, after item 10 shipped.** All found by the project
  owner using the app for real, not synthetic testing — consistent with this project's
  established pattern of real usage surfacing bugs synthetic tests miss.

  1. **Clue OCR accuracy still needs improvement, and correction is tedious.** Rows are
     worse than columns: sometimes entire numbers are dropped or extra ones added, and
     specific digit confusions recur (1↔7, and separately what's probably 3↔5 or 2↔5 —
     the project owner wasn't certain which, worth re-confirming against real examples
     rather than guessing which digit pairs to specifically target). Columns fare better
     but line up wrong and get misinterpreted when a column's clue band runs off/across
     half the visible screen area — worth checking whether the column-band crop
     coordinates account for the actual rendered/scrolled position correctly, since a
     column running along more of the image than fits in one clean crop view seems like
     the likely trigger. **Idea for reducing correction tedium, not just chasing raw OCR
     accuracy**: item 10 now separately detects fill state per cell (`cellStateDetect.js`)
     — cross-check each line's OCR'd clue against its own detected fill pattern (e.g. does
     the total filled-cell count roughly match the clue's implied total; do detected runs
     roughly line up with clue run boundaries) and visually flag likely-wrong lines in the
     correction step, rather than requiring the player to manually eyeball every single
     line against the source image. This reuses data already being computed for a
     different purpose — not a new detection system.
  2. **Bug: returning from the scan wizard leaves the main board undersized until the
     player picks a puzzle.** `fitBoardToViewport` isn't being re-run when `closeWizard`
     restores the main page content — it only fires today on puzzle selection. Fix: call
     the same fit/resize logic `closeWizard` runs (or trigger the same resize path
     selection already triggers) so the board is correctly sized immediately on return,
     not just after the next selection.
  3. **Eliminate page scroll bounce/rubber-band, app-wide — confirmed with the project
     owner: this means the overscroll bounce effect specifically, not disabling scroll on
     content that's genuinely taller than the viewport (e.g. the scan wizard's correction
     list or fill-state grid for a large puzzle stay scrollable as needed).** Apply
     `overscroll-behavior: none` (or equivalent) to eliminate bounce on the outer
     page/main play screen, which per `fitBoardToViewport` should already never need to
     scroll at all in normal play — audit whether it currently does regardless (if the
     board is correctly sized, the page shouldn't scroll during play; if it does, that's
     its own bug worth root-causing, not just suppressing via CSS). For the scan wizard,
     keep its necessary internal scroll intact but eliminate the bounce/rubber-band
     specifically — likely `overscroll-behavior: contain` (or `none` at the outer
     boundary) on the relevant scrollable regions, consistent with how the other modals
     already use `overscroll-behavior: contain` per item 10.7's iOS fix above.
  4. **Bug: dragging to fill/mark cells overwrites already-marked cells it crosses,
     instead of leaving them alone.** E.g. dragging in Fill mode over a cell that's
     already filled currently clears it back to unknown (since a single click's
     already-in-that-state → clear behavior is being applied per-cell across the whole
     drag, not just to the drag's starting cell). Fix: during a **drag** specifically
     (not a single click — single-click toggle-off-if-same-state should stay as-is,
     unchanged), skip any cell that isn't currently UNKNOWN entirely — a drag should only
     ever paint blank cells with the drag's mode, never modify a cell that's already
     FILLED or EMPTY(X) regardless of what mode the drag is in.
  5. **"Remove bad marks" should count as hint usage in stats**, both in a single
     puzzle's completion stats (time/hints/mistakes) and in the cross-device
     avg-hints-used stat bucketed by grid size. Currently only moves tagged
     `source: 'hint'` count; using Remove Bad Marks should increment the same hint-usage
     counter used everywhere else, rather than being tracked separately or not at all.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid; the
  pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's grid
  detection — worth revisiting whether these share code now that item 10's detection code
  exists and is battle-tested). Still open: is grid size user-adjustable at generation time
  or fixed per image; slider vs. automatic threshold/contrast tuning; reject, flag, or allow
  non-unique-solution puzzles (solver can validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a
  friends/share-by-code model. Schema and permissions are undesigned. The stats-tracking
  and cross-device pairing piece was pulled out into its own item, already confirmed done —
  what's left here is the library/sharing side: puzzle storage, browsing, and whether stats
  become visible to friends.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function
  (`functions/index.js`) by default, with `defaultPhraser`'s old deterministic templates kept
  as the fallback for when that call fails.
* Firebase project exists (`nonogram-pro-e8a31`). `firebase.json` / `.firebaserc` at the
  repo root declare Functions and Firestore (rules only). Deploy target for the static site
  stays Netlify regardless. Anonymous Auth + Firestore are in active use for the
  stats/pairing item; item 9's puzzle-library Firestore usage is still separate/later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* **Node.js 20→22 runtime bump — done and deployed.** No longer outstanding.
* **Firestore security rules: in active use** — `firestore.rules` (repo root) covers
  `users/{uid}/stats/*` (owning-uid only) and locks `pairingCodes/*` to the Admin SDK
  entirely. Full puzzle-library rules still belong to item 9 when it's scoped.
* Hint phrasing has an invisible-by-design fallback (real LLM call → deterministic template
  on any failure), which means "a hint appeared" is not proof the LLM call actually
  succeeded. **When verifying hint phrasing after any Cloud Function change, check the
  console/Cloud Function logs, not just that a hint shows up.**
* A diagnostic `console.error(response.status, JSON.stringify(data))` is deliberately left
  in `functions/index.js` on the "LLM response had no text content" error path, as a
  tripwire in case that failure recurs — harmless, only logs on that one path. Has not
  fired again since the original clean redeploy.
* Real audio files are in place in `assets/sounds/` — sound effects are fully done as far
  as this project's build order is concerned.
* Tesseract.js (OCR, item 10) is loaded lazily from the CDN as an ES module (`src/ocr.js`),
  same no-bundler pattern as `src/firebase.js` — its ESM build has no named exports, only a
  default export bundling everything (`(await import(url)).default`).
* **Item 10's grid/line detection, OCR, and fill-state detection were built and repeatedly
  fixed against real screenshots from the project owner's actual target app, not synthetic
  mockups alone** — real images have consistently surfaced failure modes synthetic mockups
  missed across this feature's whole history (a swamped global threshold, a three-tier
  line-darkness scheme, filled-cell brightness drift, a scrollbar-like false positive,
  digit-merging OCR, a thick-border cell-boundary offset). When extending or debugging this
  area further (including the OCR-accuracy objective above), prefer testing against a real
  image file over guessing at plausible synthetic pixel values.
* **iOS scroll/touch bugs in this app have proven resistant to incremental CSS fixes** —
  the scan wizard's scroll bug took four rounds, with the first three each fixing the
  reported symptom while breaking or missing the next one on a real device. If a similar
  iOS-only symptom appears elsewhere, consider whether the underlying structural pattern
  (an overlay with its own nested scroll region) is the actual problem before continuing to
  patch CSS properties on it.