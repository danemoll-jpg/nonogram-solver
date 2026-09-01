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
  capture, hardened across multiple real-screenshot rounds. The project's primary
  current feature** (per the project owner: get unstuck on a real puzzle when stuck).
  Wizard: pick an image → confirm the detected (or manually-drawn) grid → OCR each clue
  strip → correct any misreads → review/correct detected fill state → play, as a
  `source: 'scan'` puzzle (no move history; never counts toward stats).
  - `src/gridDetect.js`: even-subdivision cell/clue-margin boundaries off one detected
    outer rectangle; full-image auto-detection (`findGridCandidates`/`detectBestGrid`,
    ≥4 lines/axis to reject ordinary UI chrome); `adaptiveBinarize` (tile-local
    thresholding, fixes a global-threshold-swamped-by-dark-background bug);
    `inkThreshold` (background-percentile-relative cut, fixes Otsu failing on
    three-tier line darkness); `countDarkRunsLocal` (multi-pass local background
    estimate, fixes filled/X-cells shifting a line's average brightness);
    `trimClusterEndOutliers` (end-only trimming, fixes a scrollbar-like false positive
    without fragmenting real clusters); `centerRectOnBorders` (walks inward from a
    rough edge to the border's true inner edge, fixes a thick-border cell-boundary
    offset that corrupted fill-state classification).
  - `src/ocr.js`: Tesseract.js loaded lazily from CDN (default-export-only build —
    `(await import(url)).default`).
  - `src/ocrSegment.js`: fixes OCR silently merging adjacent clue numbers with no
    separator (e.g. "2 5" → "25") — real-measured ~10-12px intra-number vs. ~18-27px
    inter-number pixel gaps; OCRs each whole line for context-accuracy, then re-splits
    using real pixel-geometry glyph counts, falling back to isolated per-number OCR
    only when digit counts disagree. Also fixed `CROP_PADDING` (4px→12px) and a
    `STRIP_MARGIN_PX` addition after finding Tesseract returns nothing for a glyph
    cropped tight to its own ink.
  - `src/scanPuzzle.js`: derives a solution from confirmed clues via `fullSolve.js`; a
    solve failure sends the user back to correction rather than starting an unplayable
    board.
  - `src/cellStateDetect.js`: `estimateBackgroundColor` (a color mode over pooled cell
    pixels, not a hardcoded palette) + `classifyCellPixels` (FILLED/EMPTY/UNKNOWN via a
    two-part diagonal-AND-span test for X-marks). Feeds a new `puzzle.initialMarks`
    field into `Board.fromGrid`.
  - `src/scanUI.js`: the wizard's DOM/canvas layer — auto-detect-on-load with a
    highlighted/adjustable overlay and one always-enabled "Looks good" confirm button
    (replaced an earlier manual-drag-then-hidden-button flow that had no working way to
    proceed); `lineLooksWrong` cross-checks each line's OCR'd clue against its own
    detected fill state (reusing `isLineConsistent`) and flags provably-incompatible
    lines red; `updateRecheckWarning` shows a banner when ≥30% of an axis's lines are
    flagged, pointing at a likely wrong row/col count rather than many independent
    misreads.
  - **Known row/col count override**: new "if you already know the puzzle's size, enter
    it here" fields on the grid step, used *before* detection commits to a guess rather
    than only correcting after. `countGridLines` grew an optional `expectedLines` param
    to size its search window off a known count instead of blind iterative
    pitch-guessing. **Confirmed fixing the original 25-vs-26 column miscount directly**
    against the real 25×25 screenshot that surfaced it.
  - **Truncated-glyph crop-edge signal — tried, tested against the real image, and
    reverted.** Fired on a large majority of otherwise-correct lines (this app renders
    row-clue text top-anchored within its slice, so ink touches the crop's top edge as
    a matter of course) — not discriminating enough to ship, consistent with this
    project's practice of not force-fitting a heuristic real-image testing shows
    doesn't work.
  - **Real-device end-to-end result on the original 25×25 test image**: OCR went from
    "almost every column flagged or nonsense" to 22/25 rows exactly correct on the
    first pass, with column reads non-degenerate. 496 tests passing at that point.
  - **iOS scroll bug (original, scan-wizard-specific) — four CSS/architecture rounds,
    confirmed fixed on real hardware at the time**: nested-scroll conflict → missing
    background-scroll lock → that lock's own `position: fixed` breaking the modal's own
    scroll → **working fix**: the scan wizard became a full-screen view instead of a
    modal overlay (`.scan-screen`, `openWizard`/`closeWizard`), scrolled by native page
    scroll instead of a nested `overflow` region. **A broader scroll regression has
    since resurfaced app-wide — see Current Objective below; this original fix's
    "confirmed on real hardware" status was for the wizard specifically, at that time,
    not the newer whole-app symptom.**
* **Column-crop double-read bug (was Current Objective item 1, as of the
  known-count-override testing round) — confirmed, root-caused, fixed, and verified
  against the real 25×25 test image (`scratch-images/sample-mid-solve.jpg`), not a
  synthetic reproduction.**
  - **Root cause**: `computeClueBands` (in the scan-clues click handler, `src/scanUI.js`)
    was fed the plain border-SNAPPED grid rect (`snapRectToBorder`'s output), not the
    border-CENTERED rect (`centerRectOnBorders`'s output) that cell-slicing
    (`detectFillState`) already used. The outer border stroke is thicker than the grid's
    internal lines, so `snapRectToBorder`'s darkest-single-pixel search lands on the
    border's OUTER edge rather than the true inner cell-grid boundary — exactly the
    failure `centerRectOnBorders` exists to fix (see its own comment in `gridDetect.js`),
    previously applied only to cell-slicing. Dividing that oversized rect evenly across N
    columns bakes in a small per-column pitch error that COMPOUNDS linearly — real
    measured numbers from this image: raw snapped rect (analysis-space)
    `{left:123,top:141,right:755,bottom:768}` vs. border-centered rect
    `{left:131.5,top:149.5,right:741.5,bottom:758.5}`, an asymmetric +8.5px/−13.5px error
    that inflated per-column pitch by ~3.5% (25.28px vs. the true 24.40px), compounding to
    ~21px of rightward drift (most of a cell width) by the last few columns — exactly
    matching the doubled/garbled digit-stack crops the project owner spotted directly,
    starting around column 16 and worst by column 20-23.
  - **Verification method**: loaded the real image in a live browser session, dynamically
    imported the actual `src/gridDetect.js`/`src/scanUI.js`-equivalent pipeline (not a
    mockup), ran the real known-count-override flow (25×25), and rendered actual
    full-resolution OCR crops for all 25 columns — confirmed the double-stack bleed
    visually in the raw/buggy crops (dramatic by column ~19-23) and confirmed it
    disappeared completely once column bands were sliced from the border-centered rect
    instead.
  - **Real OCR diff, before vs. after, run through the actual production pipeline**
    (`recognizeStripSegmented` + `parseClueText`, real Tesseract calls, not synthetic):
    - Before (raw/buggy geometry) — concrete garbled reads: col 19 OCR'd as `1 2 2 11 1`
      (a stray digit bled in from col 20); col 20 as `1 7 1 7 1 7 11 1` (fully interleaved
      with a neighboring stack, spurious `7`s that don't belong at all); col 21 as `1 1 1`
      (real clue `1,1,1,1,10` — numbers dropped outright); col 22 as `1 4 1 1 3 1 3`
      (badly garbled, real clue `4,1,3,8`).
    - After (fixed geometry): **all 25/25 columns are free of cross-column
      contamination.** 14/25 read exactly correct; the other 11/25 have a small, clearly
      DIFFERENT and already-documented class of error — Tesseract collapsing a repeated
      `11` into a single `1` glyph, or dropping one instance of a repeated digit within a
      longer run (e.g. col 15's true `1,2,2,9` read as `1,2,9`) — not cross-column bleed.
      This residual is exactly the gap the repeated-digit consistency check idea (below)
      targets, not a geometry bug.
    - All 6 rows checked (20-25) came back exactly correct post-fix. Rows turned out to
      have the SAME underlying geometry bug, just milder — a partial next-row sliver
      bleeding into the bottom margin of each row crop (row text runs horizontally rather
      than stacking, so the bleed doesn't interleave two number sequences the way columns
      did) — consistent with the "rows more reliable" report all along, and the fix
      cleans this up too.
  - **Fix**: `src/scanUI.js` now computes ONE border-centered rect
    (`computeCellsRect()`) shared by both cell-slicing (`detectFillState`) and clue-band
    slicing (`computeClueBands`), instead of each call site computing/using its own rect.
  - **Regression test**: `test/gridDetect.test.js`'s new "computeClueBands +
    centerRectOnBorders (column-band drift regression)" test pins the compounding-drift
    math property using a synthetic image shaped like the real one (thick outer border,
    same proportions) — synthetic because the plain Node test harness has no image
    decoder for the real JPEG and no network access for real Tesseract OCR, so this guards
    the root-cause geometry math itself rather than re-running the real image end-to-end.
    497 tests passing.
* **Repeated-digit consistency check — prototyped, tested against real ground truth,
  tightened, and shipped** (`findRepeatedDigitOutlier`, `src/ocrSegment.js`). Same
  treatment as the reverted truncated-glyph signal: build it, test it against real data,
  keep only what survives — this one survived, unlike that one.
  - **What it does**: flags a single-digit clue NUMBER that looks like a misread glyph
    sitting among an otherwise-uniform run of the same digit elsewhere in the same line
    (e.g. `1,1,7,1,1,1` — the motivating real-world case was "four or five repeated 1s
    with one misread as a 7"). A genuinely more specific signal than the existing
    `isLineConsistent` feasibility check, which only catches a misread that makes the
    clue geometrically IMPOSSIBLE against the detected fill state — a single wrong digit
    in an otherwise-plausible clue usually still passes that check (see the red-flag
    reliability observation, Current Objective below).
  - **Real-data verification found a real false positive, and fixed it**: tested the
    function against all 50 real, CONFIRMED-correct row/column clues from this feature's
    25×25 ground-truth test puzzle (see the reference block below). At the threshold
    matching the original report ("four or five repeated" → `minRunLength = 4`), it
    incorrectly flagged this exact puzzle's own genuine column 14 clue (`2,1,2,2,2` —
    four real 2s and one real, correctly-read 1, not a misread) — exactly the kind of
    doesn't-discriminate-well-enough finding that sank the truncated-glyph signal.
    Raising the threshold to `minRunLength = 5` clears that false positive with room to
    spare while every other one of the 50 real ground-truth lines still passes clean —
    unlike the truncated-glyph idea, this one survives real-data verification once
    tightened, rather than needing to be dropped outright.
  - **Shipped as a distinct, separately-styled signal**: `src/scanUI.js`'s
    `repeatedDigitSuspect` wires it into the correction step's per-line flagging
    alongside the existing `lineLooksWrong` check, but as its own
    `scan-clue-row--suspect` CSS class (amber/`--warn`, with a `title` explaining which
    digit looks off and what it's expected to match) rather than reusing the red
    `--flagged` class — this is a plausibility guess, not a proof of contradiction the
    way the feasibility check is, and conflating the two would misrepresent this
    signal's confidence to the player. A line flagged by both shows red (the stronger
    signal wins).
  - **Tests**: `test/ocrSegment.test.js`'s new `findRepeatedDigitOutlier` block,
    including a test that runs the function against all 50 real ground-truth lines and
    asserts none of them are flagged. 505 tests passing.

Current Objective (Focus Area)

* **One active item from real-device testing of the known-count override — the
  app-wide scroll problem is still NOT fixed on real hardware.** (The column-crop
  double-read bug that was the other active item here has since been confirmed,
  root-caused, fixed, and verified against the real image, and the repeated-digit
  consistency check idea has since been built, verified against the real ground truth,
  and shipped — see Completed Tasks above.)

  1. **App-wide scroll bug — root cause corrected and a targeted fix implemented this
     round; still needs real-device confirmation before calling it done, given this
     class of bug has failed that confirmation twice already.**
     - **Diagnosis corrected by the project owner directly**: this is NOT extra
       scrollable space (the earlier "genuinely blank whitespace beyond real content"
       framing, and the `?debug=scroll` measurement tool built to chase it, were aimed
       at the wrong hypothesis) — **the real, more specific symptom is the screen
       moving up and down on its own with nothing on screen to justify it**, while real
       scrollbars (a tall modal, the explain panel) were fine whenever content actually
       needed them. That's a page-stability bug (something reactively shifting layout),
       not a height-miscalculation bug.
     - **Root cause found from that corrected description**: `fitBoardToViewport`
       (`app.js`) recomputes `--cell-size` from the current `visualViewport.height`/
       `window.innerHeight` AND the board's current on-screen position
       (`getBoundingClientRect().top`, itself dependent on scroll position) — and it
       was wired to run on EVERY `resize` and `visualViewport` `resize` event. iOS
       Safari's chrome (address bar + bottom toolbar) collapses/expands in response to
       perfectly ordinary scrolling, firing exactly those events with a ~40-100px
       height change and nothing else going on. Each one recomputed the board's cell
       size, nudging the page's total rendered height by a few px — which iOS can react
       to by adjusting scroll position to compensate. That's the loop: scroll a little
       -> chrome collapses -> app recomputes layout -> page height changes -> scroll
       position gets nudged -> reads as the screen moving for no reason, exactly as
       described.
     - **Fix**: `handleViewportResize` (`app.js`) now gates both listeners behind a
       magnitude threshold (`VIEWPORT_CHANGE_THRESHOLD_PX = 120`) — a real iPhone
       on-screen keyboard changes the visual viewport by 250-350px, comfortably above
       the threshold, so a genuine keyboard open/close still re-fits the board; routine
       iOS chrome noise (well under 120px) no longer does. `orientationchange` is left
       unfiltered (an unambiguous, always-intentional signal). `setExplain`'s direct
       `fitBoardToViewport()` call (panel content genuinely changed height) is also left
       unfiltered, since that's a real reason to re-fit, not chrome noise.
     - **Verified in the browser preview** (this project's own tooling can't reproduce
       the real iOS chrome-collapse trigger itself, so this only confirms the gating
       LOGIC is correct, not that the bug is gone on a real device): manually dispatched
       `resize` events at a 60px viewport-height delta (below threshold) left
       `--cell-size` unchanged; the same at a 320px delta (above threshold, keyboard-
       scale) recomputed it correctly. (Also confirmed the preview tool's own
       `resize_window` doesn't dispatch a real `resize` event on its own — a tooling
       quirk, not relevant to the real device.)
     - **Still needs real hardware confirmation** — per this bug class's history (the
       original scan-wizard fix took four rounds; the previous app-wide attempt's own
       multi-part fix didn't hold), don't treat browser-preview verification as done
       here. Test across **all screens** (main play, Help dropdown open, the scan
       wizard at each of its steps, the stats/pairing modal, the how-to-play modal) on
       the real iPhone that showed the bug, specifically checking whether the screen
       still shifts on its own during ordinary scrolling with nothing else happening.
     - The `?debug=scroll` measurement tool (`app.js`'s `initScrollDiagnostics`) is
       still in place as a fallback — if the screen still moves after this fix, it can
       help rule extra-scrollable-space back in as a contributing factor, but it's no
       longer the primary lead.

  2. **Red-flag (`lineLooksWrong`/`isLineConsistent`) reliability observation: it isn't
     catching the errors that actually occur, and it's flagging some lines that turn out
     fine.** This is expected given what the check actually tests, not a bug to silently
     fix — `isLineConsistent` is a pure feasibility check (does *any* valid fill
     arrangement satisfy this clue, given the cells already detected as filled/blank), not
     a correctness check. A misread digit in a column that's still mostly UNKNOWN will
     often still pass, since plenty of fill arrangements remain geometrically possible
     even with a wrong number — the check has no way to know the number itself is wrong,
     only whether it's impossible. This should be stated plainly to the project owner as
     a real limitation of this signal, not something worth chasing further on its own.

  **Reference: ground truth for this exact test puzzle**, transcribed and confirmed
  line-by-line with the project owner. Already used once (see the column-crop bug entry
  in Completed Tasks above, which diffed real OCR output against this line-by-line and
  confirmed the fix). Kept here for the next round of real-image verification — e.g.
  testing item 3's repeated-digit consistency check once it's built.
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
     **Test image file**: `scratch-images/sample-mid-solve.jpg` (local path on the
     project owner's machine: `C:\Users\danmo\nonogram\scratch-images\sample-mid-solve.jpg`).
     No image decoder or network-dependent Tesseract is available inside the plain
     `npm test` Node harness, so diffing real OCR output against this ground truth has to
     be done interactively (load the real image in a live browser, dynamically import the
     actual `src/` modules, run the real pipeline) rather than as an automated test — see
     the column-crop bug entry above for exactly how that was done, reusable as a template
     for future rounds.

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
* **iOS scroll/touch bugs in this app have proven resistant to incremental CSS fixes,
  repeatedly** — the original scan-wizard scroll bug took four rounds; a broader
  app-wide scroll regression's own fix (three baseline causes + a keyboard-specific fix)
  has now also failed real-device verification (see Current Objective above). Consider
  measuring the actual real-device gap directly (scrollHeight vs. viewport height per
  screen) rather than proposing another plausible-sounding CSS fix on the next attempt.
* **`countGridLines` (gridDetect.js) miscounting is now understood and mitigated via the
  known-count override** (see Completed Tasks) rather than by retuning the underlying
  heuristic — the heuristic itself was deliberately left alone given how fragile it's
  proven across real-image tuning rounds.