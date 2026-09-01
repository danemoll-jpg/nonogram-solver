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
* **OCR accuracy — resolved as an accepted limitation, confirmed twice now by the
  project owner.** Latest real-device test of the 25×25 puzzle showed only 3-5
  mistakes total (down from originally near-total garbling) — the project owner has
  explicitly said this is now "much more tolerable" and to defer further work on OCR
  accuracy. Known residual failure modes, if this is ever picked back up: an
  occasional lone single digit dropping out of a long clue (e.g. ground-truth
  `2,1,2,2,2` → `2,1,2,2`) and an occasional spurious extra digit (`3,1,1,3` →
  `3,1,1,7,3`, traced to `findStripLines` detecting a glyph blob that isn't a real
  digit) — both rare enough, and already caught by the existing correction-step
  review, that further engineering time isn't currently warranted.
* **Per-number clue gray-out (`anchoredClueNumbers`) — real bug found and fixed.**
  `walkAnchorsFromStart` (`lineSolver.js`) required a run to be bounded by a
  *directly observed* EMPTY on BOTH sides before calling it anchored — provably more
  conservative than necessary: once one side is genuinely excluded (edge, or a chain
  of earlier proven runs), an exact-length-match run is already fully forced
  regardless of whether the far side has been explicitly marked yet. Fixed, with a
  full proof in the code comment; re-verified the existing 300-trial brute-force
  soundness test (5 fresh runs, 812/812 each), corrected two hand-written tests that
  had encoded the old incomplete behavior as "expected," and confirmed end-to-end in
  browser preview that a single-sided bound now correctly triggers the gray-out in
  normal gameplay.
* **Save-to-library feature — client-side implementation done, and the Firestore
  rules deploy has since happened (the feature works — a puzzle successfully saves
  and does appear in the library list). The earlier "doesn't appear" report was a
  false alarm: it was showing up correctly in the library, just not in the separate
  old dropdown — which is exactly why the two are being merged (see Current
  Objective's consolidation item).** New module `src/puzzleLibrary.js`
  (savePuzzleToLibrary/fetchLibraryPuzzles/loadLibraryPuzzle/renamePuzzleInLibrary)
  backs a "Save to library" section on the scan wizard's "done" step and a "Puzzle
  library" Help-menu entry (browse/play/rename modal).
  Schema (`puzzles/{puzzleId}`): `rows`, `cols` (numbers); `rowClues`, `colClues`
  (arrays of comma-joined strings, round-tripping through `scanPuzzle.js`'s existing
  `parseClueText`); `title`; `creatorUid`; `createdAt` (serverTimestamp). No solution
  is stored — `loadLibraryPuzzle` re-solves the clues via the same `buildScannedPuzzle`
  path a fresh scan already uses. Design, all confirmed: blank-puzzle-only saves,
  decoupled from the player's own scan session; public read; required title with
  later creator-only editing (Firestore update rule scoped to just the `title`
  field); library-sourced puzzles behave as real authored puzzles (full history,
  counts toward stats).

Current Objective (Focus Area)

* **New design item, confirmed with the project owner: consolidate the two separate
  puzzle-selection UIs (the original top "Puzzle" dropdown of built-in samples, and
  the newer Help-menu "Puzzle library" modal) into one single place — the library
  modal wins, since it's the more extensible surface for future puzzle-management
  features.** Two follow-on requirements the project owner flagged, both real scope,
  not edge cases:
  1. **Puzzle names must stay hidden until completion in the merged list, same as
     the existing dropdown already does.** The dropdown currently shows a generic
     placeholder (`Puzzle N — RxC`) instead of a puzzle's real name/title, revealing
     the real name only in the completion modal — this exists specifically so
     picking a puzzle doesn't spoil what picture it draws. The library modal
     currently shows saved puzzles' real `title` field directly in the browse list,
     which defeats that. **Fix: apply the exact same hidden-name display scheme to
     every entry in the merged library list** (built-in and saved alike) — a generic
     placeholder in the list, real title revealed only in the completion modal, same
     as today's dropdown behavior. Don't invent a new scheme; reuse the existing one.
  2. **The library entry point should not live in the Help dropdown** — browsing/
     picking a puzzle isn't a help action. Reasonable default, not yet locked in:
     since this modal is replacing the old dropdown as the primary way to choose a
     puzzle, its trigger should move to roughly where the old dropdown lived (main
     toolbar), not into any menu. Confirm this placement makes sense once it's
     actually built, rather than assuming it's exactly right.
  - **Scope for consolidating the two puzzle sources**: the built-in sample puzzles
    (`SAMPLE_PUZZLES`) don't need to be migrated into Firestore — they can stay local
    static data. What needs to change is the UI: the library modal's browse list
    should merge both sources (local samples + fetched Firestore puzzles) into one
    single list/view, rather than requiring built-ins to become Firestore documents.
    Worth a light visual distinction between "built-in" and "community-saved" entries
    in the merged list (e.g. a small label or grouping), but this is a nice-to-have,
    not a blocker — the core requirement is one list, one entry point, not a data
    migration.
  - Remove the old top "Puzzle" dropdown entirely once the library modal covers
    everything it did.
  - **Additional scope, added by the project owner — these need real new data
    tracking, not just UI:**
    1. **Reveal a puzzle's real name in the list once the current user (or a
       cross-device-paired linked identity) has solved it.** This needs a genuinely
       new piece of per-user data that doesn't exist yet: today's personal stats
       (`stats.js`/`recordCompletion`) are bucketed anonymously by grid *size*, with
       no record of *which specific puzzle* was solved. Add per-user tracking of
       solved library-puzzle IDs (e.g. `users/{uid}/solvedLibraryPuzzles/{puzzleId}`,
       or an array/map field), written at the same completion point personal stats
       already are recorded from. Since cross-device pairing already re-authenticates
       a second device onto the same underlying uid (custom token, per the existing
       pairing design), this should work across paired devices automatically once
       it's keyed off uid the same way personal stats already are — no separate
       cross-device logic needed.
    2. **A visual "solved" indicator** (badge/checkmark) on library list rows,
       driven by the same solved-puzzle-ID tracking as #1.
    3. **Per-puzzle stats, scope corrected by the project owner: times-solved and
       fastest-time are PERSONAL (this user only), not a global aggregate.** Store
       both directly in the same per-user solved-puzzle-ID record from #1 (e.g.
       `users/{uid}/solvedLibraryPuzzles/{puzzleId}: { timesSolved, bestTimeMs }`) —
       this is the player's own data, protected by the standard per-uid Firestore
       rule already in place elsewhere in this app (write allowed only when
       `request.auth.uid` matches the document's own uid), so **no Cloud Function is
       needed for this personal piece** — a direct client write is fine here, unlike
       the global stat below.
       - **Separately, optional/"would be interesting," not a firm requirement this
         round**: a GLOBAL fastest-time-across-all-users stat per puzzle (not a
         global times-solved count — the project owner only asked for global
         fastest-time specifically). If built, this genuinely is a public,
         competitive, per-puzzle-document field, and the earlier gameability
         concern still applies to it specifically: a client directly writing a
         "fastest time" to a public `puzzles/{puzzleId}` document is gameable
         (nothing stops a malicious client from writing a fake instant time).
         **If/when this gets built, follow this project's established pattern**
         (the `createPairingCode`/`redeemPairingCode` callables, which use the
         Admin SDK server-side specifically to keep sensitive writes out of direct
         client hands) — a callable Cloud Function that only updates a puzzle's
         global `fastestTimeMs` if the new time genuinely improves on the stored
         one, server-side. Treat this as a nice-to-have to slot in once the rest of
         the library work (consolidation, personal solved/stats, filters) is done,
         not something to build first or that should hold up the rest of this
         round.
    4. **Filters on the library list: Solved / Unsolved / All, and by grid size.**

       Straightforward once (1) exists (solved/unsolved filtering) and given
       dimensions are already a schema field (size filtering) — no new data needed
       beyond what's already listed above.
    5. **"Stats & pairing" should also move out of the Help dropdown and be grouped
       with the library, not live as a separate Help item.** Same reasoning as the
       library itself — this is puzzle/progress-related, not a help action, and it's
       increasingly the same conceptual area as the library now that per-puzzle
       solved status and stats are part of it. Exact mechanism (a tab within the same
       modal, an adjacent button, a section of the library view) is left to Code's
       judgment — the requirement is that it's no longer under Help and is reachable
       from/alongside the library, not the specific UI shape.

* **Scroll bug: sharpened, keyboard-specific repro from the project owner — the
  whitespace only appears once the on-screen keyboard has been used, and persists
  after the keyboard closes; no issue before any keyboard interaction.** This is a
  meaningfully more specific lead than "scrolls into whitespace sometimes" — it
  points at something in the keyboard-open/close path leaving the page in a bad
  state afterward, not a general layout bug. Two concrete things to check:
  - The existing `VIEWPORT_CHANGE_THRESHOLD_PX`-gated keyboard-scale resize handling
    (`handleViewportResize`, `app.js`) is *supposed* to recompute board sizing on a
    genuine keyboard open/close (that's intentional, unlike the gated-out routine
    iOS chrome noise) — check whether that recompute, or the `visualViewport`
    listener driving it, leaves something in a wrong state once the keyboard closes
    and the visual viewport returns to its original size (e.g. `--cell-size` or
    `--explain-panel-space` not correctly reverting, or `#page-root`'s own
    `overflow-y: auto` region ending up with a `scrollHeight` that doesn't shrink
    back down).
  - **The project owner tried `?debug=scroll` again after this repro but is unsure
    whether it actually captured anything** — confirm directly whether the
    diagnostic button (now bottom-anchored, per the previous round's fix) was
    visible and tappable in this exact scenario, and if so, get the actual measured
    numbers/report from it for this specific keyboard-triggered case (not just
    baseline). If the button still wasn't visible or usable even after being
    repositioned, that's a further, separate finding worth its own attention before
    trusting the tool for real diagnosis.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid;
  the pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's
  grid detection). **Explicitly deprioritized by the project owner** — not a current
  priority, kept here for later rather than dropped. Still open whenever it is picked
  up: is grid size user-adjustable at generation time or fixed per image; slider vs.
  automatic threshold/contrast tuning; reject, flag, or allow non-unique-solution
  puzzles.
* Item 9 — Firestore schema + shared library UI, remaining scope after the
  save-to-library feature above: friends-only/private sharing (deferred from this
  round's public-only version), any richer library browsing (search, filtering by
  size/difficulty), and whether stats become visible to friends. Stats-tracking and
  cross-device pairing were already pulled out into their own item and confirmed done
  earlier.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function by
  default, with `defaultPhraser`'s old deterministic templates kept as the fallback.
* Firebase project exists (`nonogram-pro-e8a31`). Anonymous Auth + Firestore are in
  active use for stats/pairing and now the puzzle library.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Node.js 20→22 runtime bump — done and deployed.
* Firestore security rules: in active use for `users/{uid}/stats/*`, `pairingCodes/*`,
  and now `puzzles/{puzzleId}` (public read, creator-only create, creator-only
  title-only update).
* Hint phrasing has an invisible-by-design fallback — "a hint appeared" is not proof
  the LLM call actually succeeded; check console/Cloud Function logs after any Cloud
  Function change.
* Real audio files are in place in `assets/sounds/` — sound effects are done.
* Tesseract.js is loaded lazily from the CDN — its ESM build has no named exports,
  only a default export (`(await import(url)).default`).
* **Item 10's grid/line detection, OCR, and fill-state detection were built and
  repeatedly fixed against real screenshots, not synthetic mockups alone** — prefer
  testing against a real image file over guessing at plausible synthetic pixel values.
* **iOS scroll/touch bugs in this app have now failed real-device verification
  multiple times across two separate underlying bugs** (the original scan-wizard-
  specific bug took four rounds; the current app-wide regression's gating fix and
  structural permanent-lock fix have each also had real-device issues). The latest
  round narrowed the repro to specifically keyboard-triggered, persisting afterward
  — see Current Objective above. Use `?debug=scroll` for real on-device data, and
  confirm the diagnostic tool itself is actually visible/usable in the specific
  scenario being tested, not just in general.
* `countGridLines` miscounting is understood and mitigated via the known-count
  override (see Completed Tasks) rather than by retuning the underlying heuristic.
* Clue-number legibility on large puzzles — fixed, font floors at `MIN_CLUE_FONT_PX`.
* OCR residual accuracy — accepted as a known limitation per the project owner,
  confirmed twice now; not currently being pursued further.
