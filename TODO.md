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
* **Library consolidation round — done and verified end-to-end in browser preview
  (real Firestore reads/writes, not just built-in data), Firestore rules deployed.**
  The old top "Puzzle" dropdown is gone entirely; the puzzle library modal (now
  triggered from a toolbar button roughly where the dropdown lived, alongside a new
  "Stats & pairing" toolbar button — both moved out of the Help dropdown, which no
  longer has either entry) is the single puzzle-selection UI, merging `SAMPLE_PUZZLES`
  (built-ins stay local static data, not migrated into Firestore) with
  `fetchLibraryPuzzles()`'s community-saved puzzles into one list (`app.js`'s
  `refreshLibraryList`/`renderLibraryList`/`applyLibraryFilters`). Every row hides its
  real title behind the existing "Puzzle N — RxC" placeholder scheme until the current
  (or cross-device-paired) player has solved that specific puzzle, then reveals the
  title, a "✓ Solved" badge, and personal `timesSolved`/`bestTimeMs` — all driven by a
  new per-user collection, `users/{uid}/solvedLibraryPuzzles/{puzzleId}`
  (`src/puzzleLibrary.js`'s `recordPuzzleSolved`/`fetchSolvedPuzzles`, written
  alongside the existing per-size stats at the same completion point, both skipping
  scan-origin puzzles), keyed uniformly off a puzzle's own id whether it's a
  SAMPLE_PUZZLES id or a Firestore doc id — so cross-device pairing (already
  re-authenticating onto the same uid) tracks it automatically, no extra logic needed.
  `recordPuzzleSolved` uses a Firestore transaction so `bestTimeMs` can't be clobbered
  by two racing solves. Solved/Unsolved and grid-size filters on the list, and a light
  "Built-in"/"Community" badge distinguishing the two sources. Firestore rules deployed
  (`users/{uid}/solvedLibraryPuzzles/{puzzleId}`, same owning-uid-only pattern as the
  existing per-size `stats` rule) — confirmed live via a real solve-and-reopen round
  trip (write failed with `permission-denied` before deploy, succeeded and showed the
  revealed name + solved badge + `1× · best 0:13` after). **Not built this round (left
  as the nice-to-have TODO.md already scoped it as): the optional GLOBAL
  fastest-time-across-all-users per puzzle** — would need a callable Cloud Function
  (like `createPairingCode`/`redeemPairingCode`) to avoid a gameable client-writable
  public field; nothing currently depends on it.
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

* **Library consolidation round — done, see Completed Tasks for the full writeup.**
  The one deliberately-deferred piece: the optional GLOBAL fastest-time-across-all-
  users stat per puzzle (needs a callable Cloud Function to avoid a gameable
  client-writable public field — see Completed Tasks entry for why). Not started;
  pick up only if/when the project owner actually wants it, per its original
  nice-to-have framing.

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
  - **Round 3 (this pass): the diagnostic tool itself was upgraded, not the
    underlying bug — still needs real on-device verification, which this
    environment can't provide.** The on-demand "tap for a snapshot" design had a
    real gap: it could only prove "the bug produced no evidence" vs. "nobody tapped
    during the moment that mattered" are indistinguishable, and per the sharpened
    repro that moment is narrow (right as/after the keyboard closes). Changes,
    verified working in browser preview (not on real iOS — see below):
    - `initScrollDiagnostics` (`app.js`) now keeps an always-on rolling history (last
      60 entries), auto-logging a compact line on every real `visualViewport`
      resize, every `visualViewport` pan/scroll, and every text input focus/blur
      (the last one catches keyboard use even inside a modal). Opening the panel
      any time after the bug happens now shows the actual timeline through it
      instead of depending on a well-timed tap.
    - The snapshot report now also captures `visualViewport.offsetTop`/`pageTop` —
      the iOS visual-viewport PAN amount — which the original report never
      recorded. **This is the concrete thing to check on the next real-device
      repro**: a positive `offsetTop` that's still nonzero after the keyboard
      closes would point straight at a specific, well-documented root cause (iOS
      panning the visual viewport to keep a focused input clear of the keyboard,
      then not fully un-panning it) instead of requiring more guessing — and would
      also explain the button-visibility open question above as the *same* bug,
      not two, since a stuck pan can hide a naive bottom-anchored fixed element
      too.
    - Defensively (not a fix for the underlying bug, just insurance against a
      known, unrelated iOS quirk): the diagnostic button/panel now counter-
      translate themselves against `visualViewport.offsetTop` so a stuck pan can't
      strand them off-screen the same way it might strand real page content.
    - **Not done, and shouldn't be guessed at further without device data**: any
      change to `handleViewportResize`, `fitBoardToViewport`, or the CSS variables
      they drive. This project's own history (four rounds on the original scan-
      wizard scroll bug, two more on this app-wide one) is the reason to wait for
      an actual `offsetTop` reading from the real repro before touching that code
      again.

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
