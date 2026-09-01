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
     `position: fixed` ancestor. **Confirmed working on a real iOS device** at the time,
     though see the follow-up scroll regression noted in Current Objective below. General
     lesson for this app: when an iOS-only scroll/touch bug survives a couple of targeted
     CSS fixes, consider removing the risky structural pattern (overlay + nested scroll)
     rather than continuing to patch it — each on-device retest round has a real cost.
  8. **Status: functionally complete, confirmed working on a real device at the time.**
     493+ tests passing (all real-data-driven).

* **Five items from real-world play, after item 10 shipped — all done.** All found by the
  project owner using the app for real, not synthetic testing.

  1. **Clue OCR accuracy / correction tedium.** Added the cross-check idea from this
     item's design sketch: `scanUI.js`'s `lineLooksWrong` reuses `isLineConsistent`
     (`lineSolver.js` — the same DP feasibility check normal play already uses for
     red/contradiction clue numbers) to compare each line's OCR'd clue against its own
     detected fill state (`cellStateDetect.js`, already computed for a different purpose),
     and visually flags a row/col whose clue is *provably* incompatible with its detected
     fills (`.scan-clue-row--flagged`, red like the board's own contradiction styling) —
     re-checked live as the player edits. Deliberately NOT a strict "does the count/pattern
     match exactly" comparison, since a mid-solve scan's still-UNKNOWN cells make that
     misfire constantly on perfectly good partial progress; `isLineConsistent` only fails
     when no possible completion could satisfy the clue at all.

     **Root-caused against a real 25x25 mid-solve screenshot** (test file provided by the
     project owner): scanning it showed most rows fine but almost every column flagged or
     nonsense ("1, 1, 1..." repeated, several empty). Traced with a debug build to a
     genuine off-by-one in the grid step's auto-suggested column count — `countGridLines`
     suggested **26** columns; manually measuring the real border/grid-line pixel positions
     confirmed the true count is **25** (confirmed two ways: pixel-perfect against every
     column's clue-number position when overlaid, and — decisively — re-running the whole
     OCR pass with the count manually corrected to 25 turned the same columns from garbage
     into plausible multi-number reads). With 26 dividing a 25-column-wide rect, every
     even-subdivided cell/column-band was slightly too narrow, and the error compounds with
     column index — negligible near the left edge, bad enough by column ~13 to misclassify
     fill state and badly mis-slice OCR strips.
     `countGridLines`'s line-counting heuristics were NOT changed — they've already been
     through several fragile real-image tuning rounds (see item 10 above), and one more
     real image isn't enough to safely retune them without risking a regression on the
     images that already work. Instead, added a cheap, high-value safety net that reuses
     the same per-line flagging: `updateRecheckWarning` in `scanUI.js` shows a banner in
     the correction step when ≥30% of either axis's lines are flagged
     (`RECHECK_WARN_FRACTION`) — a wall of flags like that is the signature of a wrong
     row/col count confirmed a step earlier, not many independent OCR misreads. **See
     Current Objective below — this whole approach is being upgraded rather than left as
     the final answer, since it still requires cancel-and-blindly-rescan with no way to
     act on the warning.**
  2. **Bug: board stays undersized after closing the scan wizard — fixed.** `closeWizard`
     (`scanUI.js`) now calls an `onClose` callback (app.js passes `fitBoardToViewport`)
     after restoring `#page-root`, the same fit logic puzzle selection already ran.
  3. **Page overscroll bounce — eliminated app-wide, scroll left intact.** `overscroll-
     behavior: none` on `html, body` (styles.css) kills the rubber-band at the outer
     scroll boundary — covers both normal play and the scan wizard's full-screen view.
     `overscroll-behavior: contain` added to regions with genuinely tall content that stay
     independently scrollable on purpose: `.explain-panel`, `.scan-clue-list`,
     `.scan-fillstate-grid` (horizontal-only). **See Current Objective below — a scroll
     regression has since been reported, specifically worse when the iOS keyboard opens.**
  4. **Bug: drag painting overwrote already-marked cells — fixed.** `paintCell` in app.js
     now skips any cell that isn't UNKNOWN when the call is a drag-sweep step
     (`dragStep: true`), regardless of the drag's mode. Single-click toggle-off-if-
     same-state (`dragStep: false`) is unchanged. Verified in-browser.
  5. **"Remove bad marks" now counts as hint usage — fixed.** `removeBadMarks`
     (mistakes.js) batches its clears into one `board.setBatch(..., { source: 'hint' })`
     call — one click now counts as one hint use, picked up automatically by both
     `computeCompletionStats` and `recordCompletion`'s cross-device stat.

  All five verified in-browser; items 1/2 specifically re-verified end-to-end against the
  real 25x25 mid-solve screenshot. 494 tests passing.

* **Recheck-warning UX upgrade — known-count override done and verified against the real
  25x25 screenshot; the truncated-glyph idea was tried, tested, and dropped for a documented
  reason.**

  1. **Known row/col count, entered up front, now overrides the auto-detected guess —
     fixes the original 25-vs-26 miscount directly.** New "If you already know the puzzle's
     size, enter it here" rows/cols fields on the grid step (`index.html`'s
     `.scan-known-count`, before the "Looks good" button — i.e. before detection commits to
     a guess, not just editable after). `gridDetect.js`'s `countGridLines` grew an optional
     `expectedLines` param: when given, it skips the blind iterative pitch-guessing entirely
     and sizes the local-run window directly off the pitch a known count implies —
     `scanUI.js`'s `suggestLineCount` uses this to size the search window from the known
     value, but the shown row/col count is the player's own number directly (a
     player-confirmed ground truth beats any pixel heuristic), with a `mismatch` check
     (`scan-known-count-mismatch` banner) surfacing a genuine disagreement between the photo
     and the entered count rather than silently trusting it. **Confirmed directly against
     the real 25x25 screenshot**: with rows/cols left blank, auto-detection reproduces the
     original bug exactly (25 rows correct, 26 columns); entering 25/25 up front fixes the
     column count to 25 immediately, with no mismatch warning (the informed local search
     agreed). This is the actual fix for the bug that started this whole investigation.
  2. **Truncated-glyph crop-edge signal — built, unit-tested, verified against the real
     image, and REMOVED rather than shipped, because real-image testing showed it doesn't
     work on this app's actual rendering.** The idea (`ocrSegment.js`'s `crossesEdge`: a
     clue-number glyph touching its own crop's exact edge signals a misplaced slice
     boundary) tested cleanly in isolation, but wiring it into the scan wizard and running it
     against the real 25x25 screenshot (with the row/col count now CORRECT, via the fix
     above) showed it firing on a large majority of otherwise-correct lines — this app
     renders row-clue text top-anchored within its row-height slice, so the ink touches the
     crop's top edge as a matter of course, regardless of whether the slice boundary is
     actually right. A signal with that false-positive rate isn't localized or actionable,
     it's just noise layered on top of the real `--flagged` (isLineConsistent) indicator, so
     it was reverted rather than shipped — consistent with this project's own established
     practice (see `countGridLines`'s own history above) of not force-fitting a heuristic
     that real-image testing shows doesn't discriminate. One genuinely useful thing did come
     out of building and testing it, and IS kept: the investigation surfaced that a clue
     number sitting exactly at its own crop's edge gets ZERO real padding from
     `recognizeStripSegmented`'s per-line `padCropCanvas` call (clamped to the strip canvas's
     own bounds), reproducing the exact "Tesseract returns nothing for a glyph cropped tight
     to its own ink" failure mode `CROP_PADDING` exists to prevent elsewhere — confirmed
     directly (a real line's OCR result went from empty to a correct read once fixed). Fixed
     at the source via `cropStripCanvas`'s new `STRIP_MARGIN_PX`: every strip crop now
     includes a few extra px of real image margin on all sides before any line/number
     detection runs, giving genuine padding to lines that would otherwise sit flush against
     the crop edge (any resulting bleed from a neighboring line stays exactly the kind of
     small sliver `filterNoiseLines` already exists to discard).
  3. **Net result on the real 25x25 screenshot, with the known-count fix applied**: OCR
     went from the original bug's "almost every column flagged or nonsense, several empty"
     to 22/25 rows exactly correct on the first pass and non-degenerate (if occasionally
     imperfect) column reads — the remaining handful of misreads are normal OCR imprecision
     that the existing correction step and `--flagged` indicator already surface and handle,
     not a systemic failure. 496 tests passing (500 during the truncated-glyph experiment,
     back to 496 after reverting it and its 4 tests).

Current Objective (Focus Area)

* **iOS scroll regression: unnecessary scrolling still happening, and it gets worse —
  specifically introducing extra whitespace — once the on-screen keyboard opens.**
  Reported after the overscroll-bounce fix (item 3 above) shipped. Two distinct
  symptoms worth investigating separately rather than assuming one root cause:
  - **Baseline: some scrolling happens even without the keyboard involved at all**,
    which per the overscroll-bounce fix's own verification note shouldn't be
    happening if the board is correctly sized — worth first confirming directly
    whether this is genuine content overflow (something is actually taller than the
    viewport) versus a `window.innerHeight` mismatch from mobile browser chrome
    show/hide (which the prior fix's notes flagged as a known, different, and likely
    harmless cause) versus something else entirely. Don't assume it's the same root
    cause as the keyboard issue below without checking.
  - **Worse with the keyboard open, specifically introducing whitespace.** This points
    at the classic mobile-web keyboard-resize problem: the on-screen keyboard opening
    shrinks the visual viewport, and depending on how layout responds to that
    (`100vh`-based sizing is a common culprit, since `100vh` on many mobile browsers
    doesn't shrink when the keyboard appears, leaving a gap where the keyboard now
    covers content) that can manifest as exactly this symptom — extra blank space
    appearing and more scroll becoming possible/necessary than before. Worth checking
    `visualViewport` API usage (or lack of it) in the layout/fit logic, and which
    specific elements use `vh`-based sizing versus dynamic viewport units
    (`dvh`) or JS-measured heights.
  - **Given this project's specific history with iOS scroll bugs (item 10.7 above —
    four rounds, three CSS-only attempts each fixing one symptom while breaking or
    missing the next), don't assume a first attempted fix here is complete.** Verify
    on a real device specifically, including with an input actually focused and the
    keyboard actually open, not just judged from a simulator or desktop responsive
    view — this class of bug has consistently not reproduced reliably outside real
    hardware in this project so far.

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
  digit-merging OCR, a thick-border cell-boundary offset, an off-by-one line-count on a
  varying-clue-chip-width image). When extending or debugging this area further, prefer
  testing against a real image file over guessing at plausible synthetic pixel values.
* **iOS scroll/touch bugs in this app have proven resistant to incremental CSS fixes** —
  the scan wizard's scroll bug took four rounds, with the first three each fixing the
  reported symptom while breaking or missing the next one on a real device. A scroll
  regression has now recurred post-fix (see Current Objective above). If a similar
  iOS-only symptom appears anywhere in this app, consider whether the underlying
  structural pattern (an overlay with its own nested scroll region, `100vh`-based sizing
  that doesn't respond to the keyboard, etc.) is the actual problem before continuing to
  patch individual CSS properties on it — and always verify on real hardware with the
  keyboard genuinely open, not just a simulator.
* **`countGridLines` (gridDetect.js) can miscount a real photo's column count by one** —
  confirmed against a real 25x25 mid-solve screenshot (25 rows correct, 26 columns
  suggested where the true count is 25). The line-counting heuristic itself was
  deliberately NOT changed (see Completed Tasks above — too fragile to retune on one
  repro without risking other real images that already work); instead a recheck-warning
  banner was added as a stopgap, which is itself being upgraded in Current Objective above
  (manual known-count input + truncated-glyph detection). If revisiting the underlying
  heuristic itself: this test image's columns have widely varying clue-chip widths
  (single-digit "1" next to double-digit "12"/"15" chips) — a leading suspect, not
  confirmed as the mechanism. Get another real image with the same property before
  changing the algorithm.