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

* **Four items from the "latest real-device round" (2026-09-01 session) — all four
  addressed; see each writeup below for exact scope/verification limits.**

  1. **OCR content-accuracy pattern: `11` misread as `1` — root-caused, fixed, and
     verified against the real ground-truth image.** Root cause, confirmed directly (not
     assumed): NOT a geometry/grouping bug — `groupGlyphsIntoNumbers` (`ocrSegment.js`)
     already measured the two `1` glyphs' real gap correctly (9-11px, well inside the
     intra-number threshold) and correctly reported `glyphCount: 2`. It's a genuine
     Tesseract recognition failure: even a crop containing ONLY the two `1` glyphs, with
     nothing else in frame, still reads back as a single `"1"` character — confirmed
     directly by isolating that exact crop and testing it, and confirmed this isn't a
     page-segmentation-mode issue either (tried PSM 3/6/7/8/10/11/13 against the same
     crop — every mode still returned `"1"`, several returned nothing at all). What
     *did* fix it, confirmed directly: splitting the merged crop into one crop PER
     GLYPH and OCRing each in isolation — but naively reusing the existing fixed
     `CROP_PADDING` (12px) on each side reproduced the exact same bug (the padding
     region on one glyph's crop was wide enough to pull the neighboring glyph back into
     frame, so it read `"11"` again). Fixed by clamping each glyph's padding, on the
     side facing a same-number neighbor, to at most half the real gap to that neighbor
     (`glyphSidePadding`, `scanUI.js`) — full `CROP_PADDING` is still used facing away
     from a same-number neighbor (a different, safely-distant number, or the line's own
     edge). `groupGlyphsIntoNumbers` now also returns each group's individual glyph
     bands (`glyphs: [...]`, not just the merged `{start,end,glyphCount}`) so this
     per-glyph fallback has real boundaries to crop. Wired in as a THIRD fallback level
     in `recognizeStripSegmented` (whole-line → whole-number → per-glyph), triggered
     only when a multi-digit number's own whole-number OCR still doesn't produce the
     right digit count — so it's paid only on the specific failure case, not on every
     multi-digit number. **Verified against the real ground-truth image**
     (`scratch-images/sample-mid-solve.jpg`, known size 25×25): all 6 real `11`
     occurrences (columns 1, 2, 17, 18, 19, 20) now read correctly, plus a bonus fix —
     column 16's `12` (a different digit pair, same underlying merge failure) also now
     reads correctly, up from misreading as `1`. Column 21 (`1,1,1,1,10`, the no-`11`
     contrast case) remained correct throughout, confirming this is targeted, not a
     blanket behavior change. Zero regressions across the other 44 lines. Unit tests:
     `groupGlyphsIntoNumbers`'s existing hand-checked cases updated for the new
     `glyphs` field (`test/ocrSegment.test.js`).
     - **A second, DIFFERENT OCR bug was found while re-verifying against the real
       image, out of scope for this round and deliberately not fixed here**: on lines
       with many numbers, a lone single-digit number sometimes drops out entirely
       (columns 6, 11, 14, 15: e.g. ground-truth `2,1,2,2,2` reads as `2,1,2,2`), and
       row 4 shows the opposite — a spurious extra digit appears (`3,1,1,3` reads as
       `3,1,1,7,3`, traced directly to `findStripLines` detecting 5 glyph blobs where
       only 4 real digits exist — a geometry false-positive, not a misread). Neither
       involves a multi-digit merge, so neither is fixed by the change above. Flagged
       as its own follow-up task (not yet started) rather than folded into this fix.

  2. **App-wide scroll bug, round 2 — re-diagnosed and given a structural fix per the
     project owner's "just lock it down" request, but NOT YET CONFIRMED on real
     hardware — this needs real-device verification before being treated as done.**
     Re-diagnosis: round 1's fix (magnitude-gating the resize listeners) only gated
     *reactions* to the underlying mechanism, it didn't remove the mechanism itself —
     `<html>`/`<body>` could still genuinely scroll (the normal, intended way this app
     always worked), which is exactly the precondition for iOS's chrome (address bar/
     toolbar) auto-hide-on-scroll behavior to trigger from ordinary content reflow.
     Structural fix: `<html>`/`<body>` are now UNCONDITIONALLY non-scrolling (fixed
     `height: 100dvh` + `overflow: hidden`, permanently, not just while a modal is
     open), and exactly one region owns real scroll at a time — `#page-root` during
     normal play, `.scan-screen` while the scan wizard is open — each via their own
     `overflow-y: auto`, the same pattern `.modal-card__body` already used
     successfully (confirmed real-iOS-safe previously — see that CSS rule's own
     comment for why the more forceful `position: fixed` alternative was tried and
     reverted). This is a generalization of a technique already proven in this exact
     codebase (the old JS `lockBodyScroll`/`syncBodyScrollLock`, which did the same
     `overflow: hidden` toggle but only conditionally while a modal was open), not a
     new unproven idea — the JS toggle is gone now since the lock is permanent and
     needs no toggling. A permanently non-scrolling document can never trigger iOS's
     chrome auto-hide from routine reflow, which removes round 1's whole feedback-loop
     mechanism rather than just gating reactions to it. **Verification performed**:
     full regression pass in the Claude Code browser-preview tool (mobile and desktop
     viewport emulation) — normal play, Help dropdown, every modal (how-to-play,
     stats, confirm), and the scan wizard all confirmed to keep the document's
     `scrollHeight` pinned exactly to the viewport height with no document-level
     scroll possible, while content genuinely taller than the viewport (tested with a
     synthetic 25×25 puzzle with deep 7-9-number clue stacks, and a forced 2000px-tall
     scan-wizard body) still scrolls correctly within its own contained region. **This
     is NOT a substitute for real-device verification** — this project's own history
     is explicit that a fix confirmed only in browser preview has already failed real
     iOS hardware twice for this exact bug, and the browser-preview tool cannot
     reproduce the actual iOS chrome-collapse mechanism at all. Test on the real
     device across all screens before considering this resolved.

  3. **Larger, more legible clue numbers on large puzzles — done.** Clue font-size is
     now decoupled from `--cell-size` once cell size would shrink it below
     `MIN_CLUE_FONT_PX` (13px) — it still scales proportionally with cell size exactly
     as before ABOVE that floor (unchanged behavior for every puzzle size that was
     already fine), so this only changes behavior on large puzzles where cells shrink
     a lot. `fitBoardToViewport` (`app.js`) now solves cell size in two passes: an
     estimate (the old formula, treating clue-margin space as scaling with cell size)
     decides whether the floor is active; the real clue-margin pixel size is then
     computed off the (possibly floored) clue font size directly — not cell size — via
     `CLUE_DIGIT_PER_FONT`/`CLUE_BASE_PER_FONT` (re-derived against the original fixed
     0.78rem clue font, not the original fixed 1.9rem cell, since the margin only ever
     needed to fit the rendered TEXT), and cell size is solved against whatever space
     remains. `--clue-font-size` is a new CSS variable driving `.nono-clue`'s
     font-size directly, alongside the existing `--cell-size`. Verified with a
     synthetic 25×25 puzzle (deep 7-9-number clue stacks, deliberately harder than the
     30×30/max-5 reference screenshot) rendered in-browser at both mobile and desktop
     viewport sizes: cell size correctly floors at `MIN_CELL_PX` (18px) while clue
     font correctly holds at 13px instead of continuing to shrink to ~7px — legible
     and non-overlapping in both cases. Reference used for the target proportions
     (not a pixel-exact match): `scratch-images/reference-30x30-legible.png`.

  4. **Per-number gray-out within a multi-number clue — done, shipped as
     `anchoredClueNumbers` (`lineSolver.js`).** Implements exactly the confirmed rule:
     a number anchors once its run touches the line's true edge, or (walking inward
     from an already-anchored neighbor toward the edge) every cell between it and that
     neighbor is confirmed EMPTY — never merely "a run of the right length exists
     somewhere," and deliberately requires an actual EMPTY mark, not just "not
     FILLED" (an UNKNOWN gap cell doesn't confirm anything, since a later move could
     still change where that run ends up). Walked from both ends independently and
     combined, since a number can anchor from either direction. This generalizes
     `edgeCompletionDeductions`' own reasoning (a boundary-touching run that already
     matches its clue number) to walk the WHOLE clue inward one number at a time,
     rather than stopping after the first — per the TODO's own suggestion, reusing
     that established reasoning rather than a separate algorithm. Wired into
     `app.js`'s `syncAllCellVisuals` via a new `applyAnchoredClasses` helper, toggling
     a `.nono-clue__num--anchored` class per `<span>` (not the whole `.nono-clue`
     parent) — skipped entirely when the line is in genuine contradiction, so a red
     contradiction line never shows a confusing partial-gray underneath it. Verified
     two ways: (1) a brute-force **soundness** differential test (300 random trials,
     `test/lineSolver.test.js`) — for every random (line, clue) pair, enumerates every
     valid completion consistent with the current marks and the clue, and asserts that
     whenever `anchoredClueNumbers` claims a number is anchored, that number's
     position is proven invariant across every remaining possibility; (2) hand-checked
     cases straight from the spec, including the TODO's own worked `5, 3, 2` example
     (a complete, correctly-bounded run of 3 stays un-grayed while neither neighbor is
     anchored) and the more subtle case that a run touching the line's true edge is
     NOT sufficient alone if its FAR boundary is still unconfirmed. Also verified live
     in the browser (real pointer-event interaction on an actual puzzle): a `[1, 1]`
     row grays its first number the moment it's individually confirmed while the
     second stays ungrayed, then both gray together once the whole line is satisfied
     (auto-X included) — and a forced contradiction correctly suppresses all
     per-number graying on that line.

Current Objective (Focus Area)

* **Real-device verification of item 2 above (the app-wide scroll fix) is the one
  open item from this round** — everything else is done and verified as far as this
  project's own tooling allows. Test on the actual iOS device that showed the bug,
  across all screens (main play, Help dropdown, each scan-wizard step, stats/pairing
  modal, how-to-play modal), using `?debug=scroll` if anything still looks off. If it
  still doesn't hold, the `?debug=scroll` tool's report is the next real lead, not
  another guess.
* A follow-up OCR bug (dropped single-digit clue numbers on long, many-number lines —
  see item 1's own writeup above) was found but deliberately not fixed this round;
  it's a distinct failure mode from the `11`-merge bug just shipped.

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
  four rounds; the current app-wide one, two failed real-device rounds before round 2's
  structural fix — see Completed Tasks item 2).** Round 2 (2026-09-01) took the
  structural approach explicitly (permanently non-scrolling `<html>`/`<body>`, generalizing
  the same technique already proven safe for modals in this exact codebase) rather than
  another incremental patch — **but is still NOT confirmed on real hardware** (see Current
  Objective). If it doesn't hold either, don't reach for another guess — use `?debug=scroll`
  for real on-device numbers first, same as this round did.
* **`countGridLines` (gridDetect.js) miscounting is understood and mitigated via the
  known-count override** (see Completed Tasks) rather than by retuning the underlying
  heuristic.
* Clue-number legibility on large puzzles — fixed (see Completed Tasks item 3): font size
  now floors at `MIN_CLUE_FONT_PX` instead of continuing to shrink with `--cell-size`.
* A second OCR bug distinct from the fixed `11`-merge one — single-digit clue numbers
  occasionally dropping out entirely on long, many-number lines — was found but not yet
  fixed; see Completed Tasks item 1's own writeup for the confirmed repro cases.