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

Current Objective (Focus Area)

* **Two active items from real-device testing of the known-count override — a likely
  column-crop double-read bug, and confirmation that the app-wide scroll problem is
  still NOT fixed on real hardware.**

  1. **Bug hypothesis, from the project owner's own direct observation of the crop
     images: column clue-strip crops appear to sometimes contain two overlapping
     columns of digits side-by-side, not one clean vertical stack — likely explaining
     both symptoms at once (dropped numbers, garbled/merged reads).** Reviewing the
     screenshots from this test session, several column crops visibly show what looks
     like a second, offset stack of digits ghosting alongside the correct column's own
     numbers. If the column-band crop is wider than one column's true pitch, it would
     pull in a sliver of the *neighboring* column's clue digits along with the correct
     column — and OCR, faced with two interleaved digit stacks it has no way to tell
     apart, would predictably both drop numbers (giving up on the confusing combined
     shape) and merge/garble others (reading pieces of both stacks as one number).
     **This is a much sharper, more checkable lead than general "OCR accuracy is still
     imperfect"** — it points at a specific column-band width/positioning bug in
     `computeClueBands`/`sliceVertical` (`gridDetect.js`) rather than an OCR-quality
     problem to keep throwing heuristics at.
     - **Verify first, against the real image**: crop and inspect several of the
       columns that showed doubled/garbled reads directly (not the downscaled analysis
       canvas the wizard itself uses for detection — the full-resolution OCR crop) and
       confirm whether adjacent-column bleed is actually visible in the raw crop
       pixels, before changing any band-width math on a guess.
     - **If confirmed**: the fix is almost certainly tightening the column-band crop
       width to match the *confirmed* per-column pitch exactly (this is now known
       precisely once the known-count override sets the real column count and
       therefore the true pitch), rather than whatever margin/width the crop currently
       uses. Re-verify specifically that rows aren't affected the same way (the project
       owner's report says rows have been comparatively much more reliable this whole
       investigation) — if row bands are narrower/tighter by construction already,
       that itself would support this exact theory (columns bleeding, rows not).
     - Per this feature's established practice, verify directly against the real 25×25
       image, not a synthetic reproduction.

  2. **App-wide scroll bug: NOT fixed — confirmed still present on real iOS hardware,
     on every screen, not just where the keyboard is involved.** The previous round's
     fix (three separate baseline causes addressed — explain-panel `padding-bottom`
     drift, `.page` bottom padding, `#board-root`'s own padding — plus a
     `visualViewport`/`dvh` keyboard-specific fix) was explicitly shipped as "verified
     only in the browser preview, still needs real iOS hardware confirmation" — that
     confirmation has now come back negative. **New, more specific detail from this
     round**: every screen can be scrolled into genuine blank whitespace beyond where
     real content ends — not just "too much scroll," but scrollable area that
     shouldn't exist at all. This is a stronger clue than before: it means something is
     still contributing extra height to the page's total scrollable area beyond its
     real visible content, on every screen (not isolated to the scan wizard or to
     keyboard interactions specifically).
     - **Given this bug class's now-extensive history in this project** (the original
       scan-wizard-specific fix took four rounds; the app-wide attempt's own fixes were
       multi-part and still didn't hold on real hardware), don't assume another
       incremental patch is likely to be the last one needed. Worth deliberately
       measuring the actual gap directly on a real device this time before proposing
       a fix — e.g. compare real measured `document.scrollHeight` against
       `window.visualViewport.height` (or `innerHeight`) per-screen, to find exactly
       which element(s) are still contributing the extra height, rather than
       re-guessing at another plausible CSS cause.
     - Test across **all screens** explicitly (main play, Help dropdown open, the scan
       wizard at each of its steps, the stats/pairing modal, the how-to-play modal) —
       the report that this is universal, not scan-wizard-specific, means a
       single-screen fix verification isn't sufficient evidence of a real fix this
       time.

  3. **Red-flag (`lineLooksWrong`/`isLineConsistent`) reliability observation: it isn't
     catching the errors that actually occur, and it's flagging some lines that turn out
     fine.** This is expected given what the check actually tests, not a bug to silently
     fix — `isLineConsistent` is a pure feasibility check (does *any* valid fill
     arrangement satisfy this clue, given the cells already detected as filled/blank), not
     a correctness check. A misread digit in a column that's still mostly UNKNOWN will
     often still pass, since plenty of fill arrangements remain geometrically possible
     even with a wrong number — the check has no way to know the number itself is wrong,
     only whether it's impossible. This should be stated plainly to the project owner as
     a real limitation of this signal, not something worth chasing further on its own.

  4. **New idea, same family as the reverted truncated-glyph signal — a genuinely
     specific gap: nothing currently cross-checks a digit against its neighbors within
     the same line for plausibility.** Concrete example hit this round: a column clue
     that should have been four or five repeated `1`s had one single digit misread as a
     `7`, with nothing in the pipeline flagging it. OCR reads each glyph purely from its
     own pixel shape — Tesseract has no notion of "the rest of this column's numbers were
     all the same digit, so this one probably should be too." A `1`↔`7` confusion is
     visually plausible at small crop sizes (anti-aliasing near a `1`'s stroke can read
     as a `7`'s top bar). **Worth prototyping a repeated-digit consistency check**: flag a
     single outlier digit sitting among an otherwise-uniform run of the same digit within
     one line (e.g. four `1`s and one `7`) as a distinct, more specific signal than the
     existing feasibility check. **Treat this exactly like the truncated-glyph idea**:
     build it, test it against the real image, and only keep it if it doesn't misfire on
     lines that are legitimately varied (a column genuinely meant to read `1, 7` must not
     get flagged just because the digits differ) — per this feature's history, a
     heuristic that sounds reasonable in the abstract has repeatedly needed real-image
     verification before it's trustworthy enough to ship.

  5. **Ground truth for this exact puzzle, transcribed and confirmed line-by-line with
     the project owner — use this to write a real regression test, not just to eyeball
     whether output "looks more plausible."**
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
     Rows are already known to read close to correctly on this image (per prior rounds).
     Columns 15-25 especially are exactly the region under investigation for the
     column-band double-read bug (item 1 above) — a real diff against this ground truth
     should make it obvious which specific columns are actually wrong and by how much,
     rather than relying on visual impression. Use this to write an actual regression
     test (per this project's established real-data-driven testing practice) once the
     underlying image file is available to test against directly, and to precisely
     confirm whether the column-band fix (if the item 1 hypothesis holds) actually
     closes the gap, line by line.

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