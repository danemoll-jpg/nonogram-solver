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
* Item 7 — puzzle UI refinement pass (mode toggle, 5×5 chunking, solver-based auto-X,
  auto-check mistake pop-up, puzzle-complete modal, real LLM-backed hint phrasing via
  Firebase Cloud Function). Long-settled.
* UI consolidation pass + auto-X-on-hint fix — single "Help" dropdown, persistent
  bottom-anchored explanation panel, auto-X now runs on the hint path too.
* Post-ship bug fixes: Clear All confirm dialog, stray "TODO" footer removed, line
  locking on top of auto-X (`isLineLocked`), red clue numbers for genuine contradictions
  (`isLineConsistent`, DP-based, not brute force).

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

* Post-iPad-verification pass: puzzle name hidden until completion, grid scales to fill
  available screen space (`fitBoardToViewport`), real audio files in `assets/sounds/`,
  persistent mute toggle, cross-device stats + pairing via Firebase Anonymous Auth
  (confirmed working live), and a bundled Node.js 20→22 runtime bump. Deploy gotchas
  worth remembering for any future Firebase redeploy: Blaze plan required for 2nd-gen
  functions, the default Compute Engine service account needs an explicit **Cloud
  Datastore User** IAM role added by hand, and a callable function defaults to "Require
  authentication" and needs "Allow public access" explicitly set.
* Clue-number spacing bug — fixed (em-based gap instead of rem, scales with font).
* **Item 10 — Scan-existing-puzzle flow: grid detection, clue OCR, and fill-state
  capture, hardened across many real-screenshot rounds. The project's primary current
  feature** (per the project owner: get unstuck on a real puzzle when stuck). Wizard:
  pick an image → confirm the detected (or manually-drawn) grid → OCR each clue strip →
  correct any misreads → review/correct detected fill state → play, as a `source: 'scan'`
  puzzle (no move history; never counts toward stats).
  - `src/gridDetect.js`: even-subdivision cell/clue-margin boundaries off one detected
    outer rectangle; full-image auto-detection (`findGridCandidates`/`detectBestGrid`);
    `adaptiveBinarize` (tile-local thresholding); `inkThreshold`
    (background-percentile-relative cut); `countDarkRunsLocal` (multi-pass local
    background estimate for filled/X-cell brightness drift); `trimClusterEndOutliers`
    (end-only trimming for false-positive line clusters); `centerRectOnBorders` (walks
    inward from a rough edge to the border's true inner edge).
  - `src/ocr.js`: Tesseract.js loaded lazily from CDN (default-export-only build —
    `(await import(url)).default`).
  - `src/ocrSegment.js`: fixes OCR merging adjacent clue numbers with no separator, via
    real-measured intra- vs. inter-number pixel gaps; OCRs each whole line for
    context-accuracy, re-splits using real pixel-geometry glyph counts.
  - `src/scanPuzzle.js`: derives a solution from confirmed clues via `fullSolve.js`.
  - `src/cellStateDetect.js`: `estimateBackgroundColor` (color mode over pooled cell
    pixels) + `classifyCellPixels` (FILLED/EMPTY/UNKNOWN, two-part diagonal-AND-span
    test for X-marks). Feeds `puzzle.initialMarks` into `Board.fromGrid`.
  - `src/scanUI.js`: auto-detect-on-load with a highlighted/adjustable overlay and one
    always-enabled "Looks good" confirm button; `lineLooksWrong` cross-checks each
    line's OCR'd clue against detected fill state and flags provably-incompatible lines
    red; `updateRecheckWarning` banner when ≥30% of an axis is flagged.
  - **Known row/col count override**: lets the player supply a known size *before*
    detection commits to a guess. Confirmed fixing an original 25-vs-26 column miscount
    directly against the real 25×25 test screenshot.
  - **Truncated-glyph crop-edge signal — tried, tested against the real image, and
    reverted** (fired on too many otherwise-correct lines).
  - **Column-crop double-read bug — confirmed, root-caused, fixed, and verified against
    the real 25×25 test image (`scratch-images/sample-mid-solve.jpg`).** Root cause:
    clue-band slicing used a plain border-*snapped* rect instead of the border-*centered*
    rect cell-slicing already used — the outer border is thicker than internal lines, so
    the snapped rect was oversized, and dividing it evenly across N columns compounded a
    small per-column pitch error into ~21px of rightward drift by the last few columns,
    matching the doubled/garbled digit-stack crops the project owner spotted directly.
    Fixed via one shared `computeCellsRect()` used by both cell-slicing and clue-band
    slicing. **Real before/after OCR diff confirmed the fix**: 0/25 columns show
    cross-column contamination after the fix (down from severe garbling in ~5+ columns
    before); rows had the same bug more mildly and are now clean too. Regression test in
    `test/gridDetect.test.js` pins the compounding-drift math. 497 tests passing.
  - **Repeated-digit consistency check — prototyped, tested against real ground truth,
    tightened, and shipped** (`findRepeatedDigitOutlier`, `src/ocrSegment.js`). Flags a
    single-digit clue number that looks like a misread outlier sitting among an
    otherwise-uniform run of the same digit in the same line. Real-data testing against
    all 50 ground-truth lines caught and fixed a false positive (this puzzle's own
    genuine `2,1,2,2,2` column was initially mis-flagged at too-loose a threshold) —
    tightened to `minRunLength = 5` and re-verified clean against all 50 lines. Shipped
    as a distinct amber "suspect" flag (`scan-clue-row--suspect`), separate from the red
    feasibility-based flag, since it's a plausibility guess rather than a proof of
    contradiction. 505 tests passing.
  - **App-wide scroll bug, round 1 — root cause diagnosed as reactive re-layout during
    routine iOS chrome collapse/expand; fixed via a magnitude-gated listener; verified
    only in browser preview, NOT confirmed on real hardware, and per the project
    owner's latest real-device test, still not actually resolved — see Current
    Objective below for the re-diagnosis needed before another attempt.**
    `fitBoardToViewport` was recomputing board sizing on every `resize`/
    `visualViewport resize` event, including the ones iOS fires constantly as its
    chrome bar collapses/expands during ordinary scrolling — each recompute nudged page
    height by a few px, which iOS could compensate for by shifting scroll position.
    Fixed by gating those listeners behind `VIEWPORT_CHANGE_THRESHOLD_PX = 120` so
    routine chrome noise no longer triggers a re-layout while a real keyboard/rotation
    still does. Verified only via manually dispatched synthetic resize events in the
    browser preview (confirmed the gating *logic* works, not that the real device bug is
    gone). An on-device `?debug=scroll` measurement tool (`initScrollDiagnostics` in
    `app.js`) exists as a fallback/diagnostic aid.
  - **Ground truth for the real 25×25 test puzzle** (transcribed and confirmed
    line-by-line with the project owner; test image at
    `scratch-images/sample-mid-solve.jpg`, no local decoder/network in the plain test
    harness so diffing has to be done interactively in a live browser, not as an
    automated test):
    ```
    Rows (1-25):
    1: 2,5        2: 1,4         3: 1,1,4,4     4: 3,1,1,3     5: 2,7,2
    6: 1,1,8      7: 2,1,1,2     8: 2,1,7       9: 1,1,1,1     10: 2,1,6
    11: 3,1,1,1   12: 5,2,4      13: 2,2        14: 2,2        15: 3,5
    16: 3,6       17: 4,1,8      18: 6,15       19: 4,7,8      20: 4,1,8
    21: 5,6,9     22: 5,10       23: 6,12       24: 4,2,4,10   25: 3,1,2,10

    Columns (1-25):
    1: 11                2: 11                3: 12               4: 2,8              5: 2,1,3
    6: 1,1,1,2           7: 2,1,1,1,2         8: 1,2,2,2,1        9: 2,2,2,1          10: 1,5,2,2,1,1
    11: 1,4,3,1,2        12: 2,2,1,3          13: 12,2,2          14: 2,1,2,2,2       15: 1,2,2,9
    16: 1,1,12           17: 1,1,11           18: 1,4,11          19: 1,2,2,11        20: 1,1,1,1,11
    21: 1,1,1,1,10       22: 4,1,3,8          23: 1,4,1,1,5       24: 1,5,1,2         25: 1,1,3
    ```

Current Objective (Focus Area)

* **Four items from the latest real-device round.**

  1. **OCR content-accuracy pattern, distinct from the (now-fixed) geometry bug: `11`
     is being consistently misread as `1`, while `12` reads correctly.** Reported after
     the column-band geometry fix — cropping is now clean, but this specific digit
     pattern still misreads. Likely cause: two identical, tightly-kerned `1` glyphs can
     visually collapse into something Tesseract reads as a single `1` stroke, in a way
     that a `1` next to a differently-shaped `2` doesn't. **Directly testable against the
     confirmed ground truth above** — columns 17 (`1,1,11`), 18 (`1,4,11`), 19
     (`1,2,2,11`), 20 (`1,1,1,1,11`), and 21 (`1,1,1,1,10`, for contrast — no `11`) all
     contain a real `11` to check against. Investigate whether this is a Tesseract
     recognition issue (worth trying a different PSM mode or explicit digit-pair
     handling) or a glyph-geometry grouping issue (`groupGlyphsIntoNumbers` in
     `ocrSegment.js` — check whether two adjacent `1` glyphs' actual measured gap is
     landing too close to the intra- vs. inter-number gap threshold). Verify against the
     real image and the ground truth above, per this feature's established practice.

  2. **Scroll bug: the project owner's real-device test after the magnitude-gating fix
     (round 1, in Completed Tasks above) shows it is still NOT resolved — re-diagnose
     before attempting another fix, since the reported symptom this round ("scrolling
     into whitespace") doesn't clearly match round 1's diagnosis ("the screen shifts
     with nothing on screen to justify it").** These may be the same bug described two
     different ways, or two different bugs that have been conflated across rounds — do
     not assume either without re-confirming directly on the real device that showed it.
     The project owner has asked, in their own words, to "just lock it down" — worth
     treating that as license to consider a more forceful structural fix (e.g.
     genuinely preventing `html`/`body`-level scroll entirely except in the specific
     regions that need it, rather than continuing to gate individual event listeners)
     if the root cause continues to prove elusive, rather than another incremental
     patch. **Given this bug class's history in this project (the original scan-wizard
     fix took four rounds; this app-wide attempt is now on its second failed real-device
     round), use the existing `?debug=scroll` diagnostic tool (`initScrollDiagnostics`
     in `app.js`) to get real, on-device measurements this time before proposing a fix**
     — don't reason from a plausible mechanism alone again. Test across all screens
     (main play, Help dropdown, each scan-wizard step, stats/pairing modal,
     how-to-play modal).

  3. **New request: larger, more legible clue numbers on large puzzles (e.g. 25×25),
     comparable to a competing app the project owner uses that fits a 30×30 puzzle
     legibly on one screen with no scrolling.** Current clue-number font size is tied
     directly to the dynamic `--cell-size` (`fitBoardToViewport`), so on a large puzzle
     where cell size shrinks to fit the viewport, clue text shrinks proportionally and
     becomes hard to read. This needs real design investigation, not just "make the
     font bigger" — options worth weighing: decoupling clue-font-size scaling from
     cell-size so text has its own, higher minimum legible size even as cells shrink
     further; reserving proportionally more layout space for the clue margins on large
     puzzles; or a different overall layout approach for the clue area at large grid
     sizes. **Reference screenshot now provided** —
     `scratch-images/reference-30x30-legible.png` (a competing app, "Nonogram 999",
     showing a real 30×30 puzzle fitting on one screen with legible clue numbers).
     Worth noting from it: the clue-number font looks roughly fixed-size regardless of
     how many numbers stack in a column, rather than scaling down with cell size — the
     column-clue margin area is allowed real vertical space (tall for columns with 4-5
     stacked numbers) instead of everything being squeezed to one shared scale. That's
     concrete support for the "decouple clue-font-size from cell-size" option above,
     not just a general "make it bigger" ask — worth using this image as the actual
     layout-proportion target, not only a vague inspiration reference.

  4. **New feature, now precisely specified with the project owner: per-number
     gray-out within a multi-number clue, not just whole-clue graying.** A single
     number within a clue like `5, 3, 2` should gray out on its own, independent of the
     other numbers in that clue, once its own run is *provably* the one it claims to
     be — not merely "a run of the right length exists somewhere in the line."
     Confirmed rule: a number's run counts as confirmed only if it's properly
     *anchored* — either it touches the true edge of the line, or every cell between it
     and an already-confirmed neighbor (or the edge) is X'd/empty. A technically
     correct-length run floating in still-ambiguous space does not gray out. Concretely,
     for `5, 3, 2`: if the `3` (middle number) has a complete run of 3 filled cells but
     neither the `5` nor the `2` has yet been confirmed/anchored, the `3` stays
     un-grayed, since its position in the sequence isn't yet provably fixed — at least
     one neighboring number must be independently anchored first (to the edge, or via
     X's reaching to a further-anchored number) before an adjacent number can be
     confirmed relative to it. **This is the same kind of reasoning the solver's
     edge-completion technique already performs for hints** (`lineSolver.js`) — worth
     checking whether that logic can be reused or adapted for this display-only
     purpose (scanning inward from both ends of a line, confirming one number at a
     time as each becomes anchored) rather than building an entirely separate
     algorithm from scratch. This is a real feature addition, not a quick tweak —
     scope it accordingly.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid; the
  pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's grid
  detection). Still open: is grid size user-adjustable at generation time or fixed per
  image; slider vs. automatic threshold/contrast tuning; reject, flag, or allow
  non-unique-solution puzzles (solver can validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a
  friends/share-by-code model. Schema and permissions are undesigned. The stats-tracking
  and cross-device pairing piece was pulled out into its own item, already confirmed
  done — what's left here is the library/sharing side: puzzle storage, browsing, and
  whether stats become visible to friends.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function by
  default, with `defaultPhraser`'s old deterministic templates kept as the fallback for
  when that call fails.
* Firebase project exists (`nonogram-pro-e8a31`). Anonymous Auth + Firestore are in
  active use for stats/pairing; item 9's puzzle-library Firestore usage is still
  separate/later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Node.js 20→22 runtime bump — done and deployed. No longer outstanding.
* Firestore security rules: in active use — `firestore.rules` covers `users/{uid}/stats/*`
  (owning-uid only) and locks `pairingCodes/*` to the Admin SDK entirely. Full
  puzzle-library rules still belong to item 9 when it's scoped.
* Hint phrasing has an invisible-by-design fallback (real LLM call → deterministic
  template on any failure), which means "a hint appeared" is not proof the LLM call
  actually succeeded — check console/Cloud Function logs after any Cloud Function change.
* A diagnostic `console.error` is deliberately left in `functions/index.js` on the "LLM
  response had no text content" error path, as a tripwire — harmless, only logs on that
  path.
* Real audio files are in place in `assets/sounds/` — sound effects are fully done as far
  as this project's build order is concerned.
* Tesseract.js (OCR, item 10) is loaded lazily from the CDN — its ESM build has no named
  exports, only a default export (`(await import(url)).default`).
* **Item 10's grid/line detection, OCR, and fill-state detection were built and
  repeatedly fixed against real screenshots, not synthetic mockups alone** — real images
  have consistently surfaced failure modes synthetic mockups missed throughout this
  feature's whole history. Prefer testing against a real image file over guessing at
  plausible synthetic pixel values.
* **iOS scroll/touch bugs in this app have proven resistant to incremental CSS/JS fixes,
  repeatedly, across two separate scroll bugs now (the original scan-wizard-specific one,
  four rounds; the current app-wide one, at least two failed real-device rounds so far).**
  Consider measuring the actual real-device behavior directly (the `?debug=scroll` tool)
  before proposing another fix, and consider a more forceful structural approach (fully
  preventing page-level scroll except where genuinely needed) if incremental fixes keep
  not holding — see Current Objective above.
* **`countGridLines` (gridDetect.js) miscounting is understood and mitigated via the
  known-count override** (see Completed Tasks) rather than by retuning the underlying
  heuristic.
* **Clue-number legibility on large puzzles is a known, unaddressed gap** (see Current
  Objective above) — the current font scales directly with `--cell-size`, which
  shrinks proportionally on large grids.