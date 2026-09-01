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
* UI consolidation pass + auto-X-on-hint fix; post-ship bug fixes (Clear All, stray
  footer, line locking, red contradiction numbers).

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

* Post-iPad-verification pass (puzzle name hidden until completion, responsive board
  sizing, sound effects, mute toggle, cross-device stats+pairing via Firebase Anonymous
  Auth, Node 20→22 bump). Deploy gotchas worth remembering: Blaze plan required for
  2nd-gen functions, the default Compute Engine service account needs an explicit
  **Cloud Datastore User** IAM role added by hand, callable functions need "Allow
  public access" explicitly set.
* Clue-number spacing bug — fixed (em-based gap, scales with font).
* **Item 10 — Scan-existing-puzzle flow: grid detection, clue OCR, and fill-state
  capture, hardened across many real-screenshot rounds. The project's primary current
  feature.** Wizard: pick an image → confirm the detected/manual grid → OCR each clue
  strip → correct misreads → review/correct detected fill state → play, as a
  `source: 'scan'` puzzle. Key modules: `src/gridDetect.js` (auto-detection,
  `adaptiveBinarize`, `inkThreshold`, `countDarkRunsLocal`, `trimClusterEndOutliers`,
  `centerRectOnBorders`), `src/ocr.js` (Tesseract.js, CDN-loaded), `src/ocrSegment.js`
  (glyph-geometry-based number segmentation), `src/scanPuzzle.js` (derives a solution
  via `fullSolve.js`), `src/cellStateDetect.js` (fill-state classification), `src/scanUI.js`
  (wizard UI). Known row/col count override (player supplies known size up front) fixed
  an original 25-vs-26 column miscount. Column-crop double-read bug (border-snapped vs.
  border-centered rect mismatch) confirmed, root-caused, fixed, and verified with a real
  before/after OCR diff — 0/25 columns show cross-column contamination after the fix.
  Repeated-digit consistency check (`findRepeatedDigitOutlier`) built, tested against 50
  real ground-truth lines, tightened after catching its own false positive, shipped as a
  distinct amber "suspect" flag separate from the red feasibility flag.
  - **Ground truth for the real 25×25 test puzzle** (confirmed line-by-line with the
    project owner; test image `scratch-images/sample-mid-solve.jpg`; no local
    decoder/network in the plain test harness, so diffing is done interactively in a
    live browser, not as an automated test):
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
* **Four items from an earlier real-device round — three confirmed fixed on real
  hardware; the fourth (per-number gray-out) turned out incomplete — see Current
  Objective below.**
  1. **OCR `11`→`1` misread — root-caused as a genuine Tesseract recognition failure
     (not a geometry/grouping bug — confirmed directly: an isolated crop containing
     only the two `1` glyphs, with nothing else in frame, still reads back as a single
     `"1"` across every PSM mode tried). Fixed via a per-glyph OCR fallback**
     (`glyphSidePadding`, `scanUI.js`; `groupGlyphsIntoNumbers` now returns each
     group's individual glyph bands), triggered only when a multi-digit number's
     whole-number OCR still returns the wrong digit count. **Verified against the real
     ground-truth image**: all 6 real `11` occurrences now read correctly, plus a
     bonus fix (column 16's `12`, a different digit pair hitting the same underlying
     merge failure). Zero regressions across the other 44 lines.
     - **A second, distinct OCR bug was found during this verification and
       deliberately left unfixed**: on lines with many numbers, a lone single-digit
       number sometimes drops out entirely (e.g. ground-truth `2,1,2,2,2` → `2,1,2,2`),
       and one case of the opposite — a spurious extra digit (`3,1,1,3` → `3,1,1,7,3`,
       traced to `findStripLines` detecting a glyph blob that isn't a real digit).
       **Confirmed still present in the latest real-device round** (see Current
       Objective — the project owner is now asking whether this is worth continuing
       to chase, given it's a small residual error rate the correction step already
       exists to catch).
  2. Clue-number legibility on large puzzles — **fixed**: font size now floors at
     `MIN_CLUE_FONT_PX` (13px) instead of continuing to shrink with `--cell-size`.
     Verified against a synthetic 25×25 puzzle with deep clue stacks; reference
     screenshot `scratch-images/reference-30x30-legible.png` used for target
     proportions.
  3. Per-number gray-out within a multi-number clue — **implemented as
     `anchoredClueNumbers` (`lineSolver.js`)**, verified via a 300-trial brute-force
     soundness differential test and hand-checked cases at the time, but **the
     real-device round confirms this does not actually show up during normal
     gameplay — see Current Objective below, this is not actually done.**
  4. App-wide scroll bug, round 2 (structural fix — permanently non-scrolling
     `<html>`/`<body>`, one region owning real scroll at a time) — **verified
     extensively in browser-preview tooling but has now ALSO failed real-device
     testing, the third consecutive round to do so** (round 1's magnitude-gating fix
     failed real-device testing once; round 2's structural fix has now failed it once
     as well) — see Current Objective below for how this round is being handled
     differently.

Current Objective (Focus Area)

* **Scroll bug — diagnostic tool investigated and hardened this round; underlying
  scroll bug itself still NOT fixed (deliberately — see below).**
  - **The tool was confirmed to already render visibly, not console-only** — it builds
    a real on-screen 📏 trigger button and a report panel with Copy/Close buttons (not
    just a console.log), verified directly in browser preview by clicking it and
    reading the rendered report. The "console-only, unusable on an iPad" concern from
    the previous round doesn't apply.
  - **Confirmed the feature is actually live on production** — fetched
    `https://nonogrampro.netlify.app/app.js` directly and confirmed it already
    contains `initScrollDiagnostics` (and `applyAnchoredClasses`, relevant to the next
    item below) — so a stale/pre-feature deploy is ruled out as the explanation for
    "nothing appeared." The response's own `Cache-Control: public, max-age=0,
    must-revalidate` header also means Netlify isn't telling browsers to cache this
    file, which further weakens (though doesn't 100% eliminate — iOS Safari can still
    have its own quirks) a stale-HTTP-cache explanation.
  - **Found and fixed a concrete, code-grounded reason the trigger button specifically
    could still be invisible on a real device**, without touching the core scroll-lock
    fix itself: `.scroll-diag-btn`/`.scroll-diag-panel` (`styles.css`) were
    **top-anchored** (`top: 0.5rem`) — but this file's own comment on the round-2
    structural fix documents that iOS Safari's address-bar chrome collapse/expand is
    driven specifically by scrolling the *document*, and the round-2 fix made
    `<html>`/`<body>` permanently non-scrollable. Put those two true facts together
    and the chrome may now be **permanently stuck in its tallest (expanded) state**,
    with no scroll gesture left to ever trigger a collapse — meaning a `top: 0.5rem`
    fixed element can end up rendered underneath that permanently-expanded chrome,
    genuinely invisible, with no way for the player to reveal it. **Fixed** by moving
    both to bottom-anchored (matching `.explain-panel`, this app's only other fixed
    element, already proven safe on real iOS hardware) — verified still renders
    correctly in browser preview after the change. This is a fix to the *diagnostic
    tool's own visibility* specifically, not a guess at the underlying document-lock
    bug itself — deliberately not touched, per below.
  - **Still open, and still needs the project owner's device, not another guess**:
    whether this was really the whole explanation for "nothing appeared," and — the
    actual point of the tool — what it reports once it's confirmed visible (measured
    scrollHeight vs. viewport, which element(s) contribute any excess). **Ask the
    project owner to reload nonogrampro.netlify.app fresh and try `?debug=scroll`
    again** — the button should now show bottom-right. If it's visible now, tap it and
    report the numbers in the panel; if it's STILL not visible, that's a stronger,
    more specific finding (rules out both the console-only theory and the top-anchor
    theory) worth its own dedicated investigation rather than a third repositioning
    guess.

* **Per-number gray-out (`anchoredClueNumbers`) — real bug found and fixed this
  round** (the project owner correctly identified it after my first pass here wrongly
  concluded there was nothing to fix). Wiring, rendering, and CSS were all already
  fine (confirmed in the previous investigation pass); the actual bug was in
  `walkAnchorsFromStart` (`lineSolver.js`) itself, and it's a real soundness/
  completeness gap, not a UI wiring issue:
  - **The old code required a run to be bounded by a *confirmed* EMPTY on BOTH
    sides** before calling it anchored. That's provably more conservative than
    necessary: once a walk has fully excluded everything before position `pos` (via
    the line's true edge, or a chain of earlier already-proven runs), a FILLED run
    starting at `pos` whose length exactly matches `clue[i]` is **already fully
    forced** — it can't belong to an earlier or later clue number (no room / would
    strand an earlier number), and it can't validly grow past its matching length
    (growing it can never again equal `clue[i]`, and any other length is infeasible
    for the same no-room reason) — so the trailing boundary is *logically* forced
    empty even when it isn't yet a *directly observed* EMPTY mark. Requiring the far
    side to already be observed-empty was therefore an unnecessary bar that made the
    effect trigger far less often than the underlying logic actually allows —
    directly explaining why it "barely showed up" in ordinary play, where players
    routinely fill a run without also immediately X-marking the cell right after it.
  - **Verified the fix is sound, not just more eager**, three ways: (1) a rigorous
    manual proof (see the new comment on `walkAnchorsFromStart`) that growing a
    left/right-excluded, exact-length-match run is always infeasible; (2) the
    existing 300-trial brute-force soundness differential test (which checks every
    positive anchoring claim against real brute-force-enumerated completions) still
    passes — re-ran it 5 times total (fresh random trials each run, since it's not
    seeded) with 812/812 passing every time; (3) two of the existing **hand-written**
    tests turned out to encode the OLD, incomplete behavior as if it were correct —
    brute-forcing them by hand found their expected `false` results were wrong (the
    anchored position genuinely doesn't vary across the only valid completion) —
    fixed both test expectations to match, with the brute-force reasoning written
    into each test's own comment.
  - **Verified end-to-end in browser preview** against a normal (non-scanned)
    SAMPLE_PUZZLES puzzle using real `pointerdown`/`pointerup` events: filling a
    single cell of a two-number clue and X-marking only the cell on ONE side of it
    (leaving the other side of the run completely UNKNOWN — the exact case that used
    to require both sides) now correctly grays that one clue number. This is a much
    lower bar to trigger than before, so it should show up meaningfully more often
    during ordinary play. **Still worth the project owner's real-device confirmation**
    once this is deployed, but this is now a genuine logic fix, not a guess.

* **Save-to-library feature — client-side implementation done this round; NOT yet
  usable in production because the updated `firestore.rules` haven't been deployed.**
  New module `src/puzzleLibrary.js` (savePuzzleToLibrary/fetchLibraryPuzzles/
  loadLibraryPuzzle/renamePuzzleInLibrary) backs a new "Save to library" section on
  the scan wizard's existing "done" step (`src/scanUI.js`, `index.html`) and a new
  "Puzzle library" Help-menu entry opening a browse/play/rename modal (`app.js`).
  Verified in browser preview: the UI renders correctly and the library modal fails
  soft with a clear message (confirmed via console: `permission-denied`, expected
  since the live project's deployed rules don't have the `puzzles` collection yet).
  **Before this is actually live: deploy the updated `firestore.rules`** —
  `firebase deploy --only firestore:rules` — which the project owner needs to run
  themselves (security-rule changes to a live project aren't something to do
  unattended). No Firestore composite index needed (a single-field `orderBy` doesn't
  require one). After deploying, worth a real end-to-end pass: save a puzzle from a
  real scan, confirm it shows up in the library, play it (check it behaves like a
  normal authored puzzle — real move history, counts toward stats), and rename it as
  its creator.
  - Schema (`puzzles/{puzzleId}`): `rows`, `cols` (numbers); `rowClues`, `colClues`
    (arrays of comma-joined strings, e.g. `"2,5"` — Firestore has no array-of-arrays
    type, and this round-trips through `scanPuzzle.js`'s existing `parseClueText`
    rather than inventing a new format); `title`; `creatorUid`; `createdAt`
    (serverTimestamp). No solution is stored — `loadLibraryPuzzle` re-solves the
    clues via the same `buildScannedPuzzle` path a fresh scan already uses, since the
    save step already proved they solve.
  - Design this pulls forward a scoped first slice of item 9 (below), ahead of item
    8, which the project owner has explicitly deprioritized (not a current priority
    — keep it in Next Steps but no longer positioned as the next thing after item
    9's remaining scope).
  - **Design (confirmed with the project owner) and this round's scope are both now
    implemented as described** — blank-puzzle-only saves decoupled from the player's
    own scan session, public read for this first version, required title with
    later creator-only editing, and library-sourced puzzles behaving as real
    authored puzzles (full history, counts toward stats). No further design
    decisions open here; what's left is purely the deploy + verification step
    called out above. Pagination/sorting/filtering intentionally stayed minimal
    (most-recent-first, no search) per the original "doesn't need to be a polished
    library experience yet" scope call — a candidate for later polish, not a gap in
    this round.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid;
  the pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's
  grid detection). **Explicitly deprioritized by the project owner** — not a current
  priority, kept here for later rather than dropped. Still open whenever it is picked
  up: is grid size user-adjustable at generation time or fixed per image; slider vs.
  automatic threshold/contrast tuning; reject, flag, or allow non-unique-solution
  puzzles.
* Item 9 — Firestore schema + shared library UI, remaining scope after this round's
  save-to-library feature above: friends-only/private sharing (deferred from this
  round's public-only version), any richer library browsing (search, filtering by
  size/difficulty), and whether stats become visible to friends. Stats-tracking and
  cross-device pairing were already pulled out into their own item and confirmed done
  earlier.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function by
  default, with `defaultPhraser`'s old deterministic templates kept as the fallback.
* Firebase project exists (`nonogram-pro-e8a31`). Anonymous Auth + Firestore are in
  active use for stats/pairing; item 9's puzzle-library Firestore usage is separate.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Node.js 20→22 runtime bump — done and deployed.
* Firestore security rules: in active use for `users/{uid}/stats/*` and
  `pairingCodes/*`. Full puzzle-library rules still belong to item 9.
* Hint phrasing has an invisible-by-design fallback — "a hint appeared" is not proof
  the LLM call actually succeeded; check console/Cloud Function logs after any Cloud
  Function change.
* Real audio files are in place in `assets/sounds/` — sound effects are done.
* Tesseract.js is loaded lazily from the CDN — its ESM build has no named exports,
  only a default export (`(await import(url)).default`).
* **Item 10's grid/line detection, OCR, and fill-state detection were built and
  repeatedly fixed against real screenshots, not synthetic mockups alone** — prefer
  testing against a real image file over guessing at plausible synthetic pixel values.
* **iOS scroll/touch bugs in this app have now failed real-device verification THREE
  times across two separate underlying bugs** (the original scan-wizard-specific bug
  took four rounds to actually fix; the current app-wide regression's gating fix and
  then its structural permanent-lock fix have each failed real-device testing once).
  Per Current Objective above, the next step is real on-device diagnostic data via
  `?debug=scroll`, not another guess — this pattern of "passes every check this
  project's tooling can perform, fails on the real device anyway" strongly suggests
  the verification tooling itself cannot reproduce the actual trigger, not that the
  underlying reasoning about the fix is wrong.
* `countGridLines` miscounting is understood and mitigated via the known-count
  override (see Completed Tasks) rather than by retuning the underlying heuristic.
* Clue-number legibility on large puzzles — fixed, font floors at `MIN_CLUE_FONT_PX`.
* Per-number clue gray-out (`anchoredClueNumbers`) — real over-conservatism bug found
  and fixed this round (`walkAnchorsFromStart` no longer requires a run's far
  boundary to be a directly-observed EMPTY mark — see Current Objective for the full
  proof and verification). Needs the project owner's on-device confirmation once
  deployed to fully close out.
* **OCR residual accuracy — resolved as an accepted limitation, not a bug to chase
  right now.** Asked the project owner directly (current accuracy vs. keep chasing);
  answer: leave it as-is, document it, revisit only if it comes up again later. The
  known residual failure modes, if this is ever picked back up: an occasional lone
  single digit dropping out of a long clue (e.g. ground-truth `2,1,2,2,2` → `2,1,2,2`)
  and an occasional spurious extra digit (`3,1,1,3` → `3,1,1,7,3`, traced to
  `findStripLines` detecting a glyph blob that isn't a real digit) — both rare enough,
  and already caught by the existing correction-step review, that the project owner
  doesn't consider them worth further engineering time for now.