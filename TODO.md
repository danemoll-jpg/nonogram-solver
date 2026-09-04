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
  occasional lone single digit dropping out of a long clue and an occasional
  spurious extra digit — both rare enough, and already caught by the existing
  correction-step review, that further engineering time isn't currently warranted.
* **Per-number clue gray-out (`anchoredClueNumbers`) — real bug found and fixed.**
  `walkAnchorsFromStart` (`lineSolver.js`) required a run to be bounded by a
  *directly observed* EMPTY on BOTH sides before calling it anchored — provably more
  conservative than necessary. Fixed, with a full proof in the code comment;
  re-verified against a 300-trial brute-force soundness test (5 fresh runs, 812/812
  each), corrected two hand-written tests that had encoded the old incomplete
  behavior as "expected," and confirmed end-to-end in browser preview.
* **Library consolidation round — done and verified end-to-end in browser preview
  (real Firestore reads/writes), Firestore rules deployed.** The old top "Puzzle"
  dropdown is gone entirely; the puzzle library modal (its own toolbar button, plus
  a new "Stats & pairing" toolbar button — both moved out of the Help dropdown) is
  the single puzzle-selection UI, merging `SAMPLE_PUZZLES` (built-ins stay local
  static data) with `fetchLibraryPuzzles()`'s community-saved puzzles into one list.
  Every row hides its real title behind the existing "Puzzle N — RxC" placeholder
  scheme until the current (or cross-device-paired) player has solved that specific
  puzzle, then reveals the title, a "✓ Solved" badge, and personal
  `timesSolved`/`bestTimeMs`, driven by a new per-user collection,
  `users/{uid}/solvedLibraryPuzzles/{puzzleId}` — keyed uniformly off a puzzle's own
  id, so cross-device pairing tracks it automatically. Solved/Unsolved and
  grid-size filters, and a light "Built-in"/"Community" badge. Firestore rules
  deployed and confirmed live via a real solve-and-reopen round trip. **The
  optional GLOBAL fastest-time-across-all-users per puzzle was deliberately
  NOT built this round** (see Current Objective — it's now being picked up).
* **Save-to-library feature — done, deployed, confirmed working (saving, browsing,
  and renaming all work end-to-end).** `src/puzzleLibrary.js`
  (savePuzzleToLibrary/fetchLibraryPuzzles/loadLibraryPuzzle/renamePuzzleInLibrary)
  backs a "Save to library" section on the scan wizard's "done" step. Schema
  (`puzzles/{puzzleId}`): `rows`, `cols`, `rowClues`, `colClues` (comma-joined
  strings, round-tripping through `scanPuzzle.js`'s `parseClueText`), `title`,
  `creatorUid`, `createdAt`. No solution stored — re-solved via the same
  `buildScannedPuzzle` path a fresh scan uses. Blank-puzzle-only saves, decoupled
  from the player's own scan session; public read (confirmed as the right model, no
  separate friends-only tier needed); required title with later creator-only
  editing; library-sourced puzzles behave as real authored puzzles (full history,
  counts toward stats).
* **Confirmed with the project owner: fully public visibility (already built) is the
  right model — no separate friends-only/private sharing tier is needed.**
* **UI/branding polish round — done, verified end-to-end in browser preview against
  real Firestore/Netlify-hub data.** Toolbar tightened (Stats & pairing → Stats,
  Auto-check moved into the Help menu, Help trigger → a plain "?" icon); rebrand to
  "Nonogram Pro" (title, header, favicon — new 🏁 checkered-flag icon) with the old
  play-screen tagline moved into a new listing in the game-hub repo (live at
  https://dansgamehub.netlify.app/); bigger/bolder X marks; "Clear all" renamed to
  "Restart" with real hint-count/elapsed-time reset; new "All games" toolbar-menu
  item with the same in-page confirm-modal pattern as every other destructive
  action here.
* **Saved/incomplete puzzle progress — done, deployed, verified end-to-end.**
  `src/puzzleLibrary.js` (saveInProgressPuzzle/loadInProgressPuzzle/
  fetchInProgressPuzzles/deleteInProgressPuzzle) backs
  `users/{uid}/inProgressPuzzles/{puzzleId}` — grid state as one compact string per
  row, elapsedMs, hintsUsed. Firestore rules deployed. Save cadence: an explicit
  "Save progress" button (main toolbar), plus auto-save on opening the library,
  picking a different library puzzle, or finishing the scan wizard, all through one
  `saveProgressIfApplicable()` gate. Resuming merges the saved grid as
  `initialMarks` + `resumeElapsedMs`/`resumeHintsUsed`. Restart clears any stale
  save regardless of resumed status. Incomplete filter explicitly excludes
  already-solved puzzles (a real edge case caught live in testing).
* **Live running count of cells painted while drag-filling — done, verified**
  (floating gold badge, follows the pointer, increments per genuine paint, hides
  on pointerup). Fill- and X-mode both supported.
* **Scroll bug, round 1 fix — implemented and deployed.** Root cause (confirmed via
  real on-device `?debug=scroll` data): iOS's visual-viewport pan (used to keep a
  focused input clear of the on-screen keyboard) doesn't fully reset back to
  `offsetTop: 0` once the keyboard closes. Fix: `correctResidualViewportPan`
  (`app.js`) — on `focusout` of a text input and on `visualViewport` `resize`, if
  `offsetTop` is nonzero and no text input is focused, issue a corrective
  `window.scrollTo`.
* **Scroll bug, round 2 — three follow-ups implemented and deployed, but a
  real-device verification round showed the fix still did NOT resolve the bug.**
  1. Broadened trigger: checks the focused input's real `getBoundingClientRect()`
     against the current pan/height when a field IS focused, correcting via
     `scrollIntoView`; added a `focusin` listener alongside `focusout`.
  2. `.explain-panel` given the same defensive counter-translate-against-
     `offsetTop` treatment the diagnostic button already had — **confirmed
     working** via the round-2 real-device capture (its rect stayed within
     viewport bounds).
  3. "Save progress" moved to its own toolbar button, removed from Help.
  4. A toolbar button height mismatch was found and "fixed" — **this later turned
     out to be a misdiagnosis, see round 4 below.**
* **Scroll bug, round 2 real-device capture — confirmed the fix did NOT resolve
  the bug**, with a specific diagnosis: the fix only re-checks on `focusout`/
  `resize` events, and the stuck pan (`offsetTop: 79`) persisted through closing
  the scan wizard and navigating back to the main screen — 54+ seconds, neither
  transition firing either covered event. Recommended direction: a periodic/idle
  re-check instead of chasing more individual trigger events.
* **Scroll bug, round 3 — implemented, awaiting real-device verification.** Added
  a periodic idle re-check — `setInterval(correctResidualViewportPan, 400)`
  (`app.js`), kept alongside the existing event listeners as a fast path. Directly
  implements round 2's diagnosis: the existing unconditional-correction branch
  (nothing focused, `offsetTop` nonzero) already worked correctly, it just never
  got re-invoked during the 54+ second stuck window since no covered event fired.
  Cheap early-return when `offsetTop === 0` (the common case), so polling doesn't
  reintroduce the "chase individual triggers" problem — it self-corrects
  regardless of what caused the stuck state.
* **Toolbar alignment, rounds 2-3 — both turned out to be solving the wrong
  problem, per the project owner's direct correction.** Round 2's height-based fix
  and round 3's `-webkit-appearance: none` addition were both chasing a *size*
  difference; **the project owner correctly identified the actual issue was
  vertical misalignment, not different sizes** ("It isn't size. The buttons
  aren't lined up") — confirmed again after seeing round 4's fix description.
  Round 3 also added the `?debug=scroll` toolbar-geometry report, which remains
  useful diagnostic infrastructure regardless.
* **Toolbar alignment, round 4 — the real bug, found via direct
  `rect.top` measurement (not another guess), fixed, confirmed in preview.**
  Root cause: `.btn + .btn { margin-top: 0.5rem }` (a rule meant for vertical
  button stacks elsewhere) was leaking into `.library-entry-group`'s horizontal
  row — every other `.btn`-group consumer in the codebase already resets this to
  0; `.library-entry-group` was the one place missing that reset, so "Stats" and
  the save icon (each directly following another `.btn`) sat 8px lower than
  "Puzzle library". Fixed the same way as every other consumer:
  `.library-entry-group .btn { margin-top: 0 }`, placed after `.btn + .btn` in
  source order so the equal-specificity cascade tie-break lands correctly (a
  first attempt placed it earlier and silently lost the tie). Also gave
  `.mode-toggle` (the Fill/Mark-empty pill) an explicit `height: 2.2rem` matching
  `.btn`'s, since it had no fixed height of its own before and was left visibly
  off once the margin leak was fixed and exposed it. **Verified by direct
  remeasurement**: every first-row toolbar button now reports an identical
  `rect.top`/`rect.bottom` (130/165.2 in that preview run) — actual matching
  Y-position, not just matching height. All 812 tests still pass; other
  `.btn + .btn` vertical stacks (restart confirm modal, checked directly) are
  unaffected.
* **Toolbar alignment — CONFIRMED FIXED on the real device.** Round 4's fix holds
  up on real iOS, not just in preview — this bug is closed.
* **Row-OCR investigation — CONFIRMED FIXED, both locally and on the real
  device (the project owner redeployed and retested on iPad).** Real,
  fixable geometry bug found, root-caused, and fixed; verified end-to-end
  against the real test image, not a guess. The
  project owner saved the test image as `scratch-images/sample-row-issue.jpg`
  (gitignored like the other scratch images, so it stays local-only). Ran the
  actual scan wizard against it in a real browser (Chrome via the browser
  automation tools, not synthetic pixel data): with the known 25×25 size
  entered, the OCR read every row shifted down by roughly one row, worsening
  into outright garbling by the middle rows, and the recheck banner fired for
  both axes at once — exactly the reported symptom.
  - **Root cause, confirmed by directly instrumenting the real detection
    functions against the real image** (not inferred from OCR text alone):
    this puzzle's row 1 is entirely filled (all 25 cells, clue "25") — a case
    the existing ground-truth puzzle never has. `centerRectOnBorders`'s inward
    border-search (`gridDetect.js`) estimates "is this pixel still border ink"
    from an 85th-percentile split of a window assumed to be mostly plain
    background; against a solid-filled first row, that window is dominated by
    the fill's own mid-tone color instead, so the split silently misjudged the
    *entire filled row* as "still border ink" and walked its inward search the
    full `maxBorderWidth` (20px) deep into row 1 before stopping — confirmed by
    calling the real function against the real image's pixel data and watching
    `top` land 20px past the true row-1/border boundary (287.5 instead of the
    correct ~267). That shifted-and-shortened rect then got divided into 25
    equal row bands as usual, so every row read pulled in a bit of its
    neighbor below, compounding row by row — the same *kind* of bug as the
    earlier column-band drift fix (an inward-search heuristic tuned for plain
    background breaking against real content next to the border), just
    triggered by a filled row instead of a thick border stroke.
  - **Fix** (`src/gridDetect.js`'s `centerRectOnBorders`): the inward
    "still-border-ink" threshold is now anchored to the border's own measured
    darkness at the rough edge position (already close to genuine border ink —
    that's what `snapRectToBorder` found) and the brightest sample the walk
    could actually reach, windowed to exactly `maxBorderWidth` instead of the
    old `maxBorderWidth * 3` — so the calibration can no longer be fooled by
    content past the current row/column's own extent, and no longer assumes
    the interior is background-colored. All 812 existing tests still pass
    unchanged (including the column-band drift regression test), and a fresh
    real-browser scan of the actual test image afterward read 24 of 25 rows
    exactly right, with the recheck banner no longer firing for either axis —
    the one remaining miss (a dropped leading digit on one row) is a single
    lone-digit dropout, squarely the already-accepted residual OCR noise class,
    not a repeat of the geometry bug.
* **Focused-input-vs-scroll complaint — CONFIRMED FIXED on the real device
  (project owner retested on iPad after redeploying).** Narrowly scoped as
  requested, NOT tied to the main scroll-pan investigation, which remains
  unresolved (see below) — this fix only stops a focused field from fighting
  a deliberate scroll gesture, it doesn't address the separate stuck-pan
  mystery. `app.js`: a genuine scroll gesture (`touchmove`/`wheel`) starting
  anywhere outside the currently-focused text input now blurs that input
  immediately, so the pan-correction machinery (`correctResidualViewportPan`
  and its poll/resize/focus re-checks) has nothing focused left to defend
  with `scrollIntoView`, and can't fight the player's own scroll.
  Touch-dragging *inside* the focused field itself (cursor placement, text
  selection) is excluded via an `e.target` containment check, so normal
  in-field editing isn't affected. Verified with the full test suite (812
  passed) locally, then confirmed for real: this is the first iOS scroll/touch
  fix in this app to pass real-device verification on its first attempt,
  after five straight rounds (across two different bugs) that didn't.
* **Scan-correction keyboard mode — fixed, real-device-confirmed alongside
  the above.** The clue-correction text inputs (`src/scanUI.js`) reset to the
  default alphabetic keyboard on every new field focus (no `type="text"`
  input remembers "the last field was numeric" across different elements),
  so correcting a run of misread clues meant re-tapping "123" on every single
  field — a real, separate complaint surfaced while retesting the two fixes
  above. Set `inputMode = 'decimal'` on these inputs so the numeric keypad
  stays up across every focus change. Deliberately not the more restrictive
  `inputmode="numeric"`, whose keypad has no space or comma key — this field's
  own instructions ask for a space/comma between numbers ("4 13"), and
  `parseClueText` (`scanPuzzle.js`) already extracts digit runs via a bare
  `\d+` regex, ignoring whatever separator sits between them, so the decimal
  pad's "." key works today as a typable substitute with zero parsing changes
  needed. The correction step's on-screen instructions were updated to
  mention "." as an option.

* **Repeatable Undo button — done, verified end-to-end in browser preview (real
  clicks/drags, real Firestore save/resume round trip).** New toolbar icon button
  (`btn-undo`, `.library-entry-group`, next to Save progress) calls `Board.undoLast()`
  (`src/model.js`) — already exactly the right primitive (pops the most recent history
  entry, a full batched move), no new model.js undo logic needed. Repeatable simply by
  not disabling itself after one use; disabled only once `board.history` is genuinely
  empty. Confirmed a used hint stays counted even if its move is later undone (project
  owner's "permanent once used" rule): `hintsUsedFloor` (`app.js`) is bumped once per
  hint-sourced move actually applied, never decremented, and `computeCompletionStats`
  takes `Math.max(historyDerivedHints, hintsUsedFloor)` — verified live (undid a hint,
  then solved the rest via more hints; completion modal correctly showed all hints
  including the undone one). Real prerequisite gap confirmed and fixed:
  `board.hasHistory = puzzle.source !== 'scan'` was suppressing ALL post-import history
  for scan-origin puzzles, not just the baseline — see the scan-puzzle item below, which
  fixes this the same round by removing the scan-origin special case almost entirely.
  Also fixed a related latent bug found while building this: `autoXCells` (which empty
  cells are auto-X vs. deliberate) was updated incrementally and could go stale after an
  undo (already affected the older "back up to move #N" mistake-flow undo too, just
  rarely exercised). Fixed by tagging batch cells with `auto: true/false` through
  `Board.setBatch` (threaded into `history`) and replacing all incremental
  add/delete bookkeeping with a pure `deriveAutoXCells(history)` replay, called after
  every mutation including undo — correct by construction regardless of how history got
  to its current length. All 812 tests still pass.
* **Row/column interaction highlight — done, verified in browser preview (dispatched
  real pointerdown/pointermove/pointerup events, confirmed the correct 9 cells
  highlighted for a drag through row 1 col 2 on a 5-wide board, cleared on release).**
  Full row + column of whichever cell is currently pressed/dragged gets a translucent
  `::before` overlay (`.nono-cell--crosshair`, new `--crosshair-highlight` CSS token) —
  deliberately not the existing reasoning/result inset-box-shadow system (that one's
  deduction-driven), and a neutral off-white tint so it never reads as a hint/mistake
  signal. Local `crosshair` state inside `attachPointerHandlers` (same lifecycle as
  `dragging`), so it resets naturally on every `renderBoard`.
* **Scanned puzzles now auto-publish to the public library — done, verified end-to-end
  in browser preview against real Firestore (Save progress write + library's
  "Incomplete" filter round trip confirmed working on a played library puzzle, sharing
  the exact code path a published scan now uses).** Root cause of "Save progress does
  nothing for a scanned puzzle" confirmed exactly as suspected:
  `saveProgressIfApplicable` (and `board.hasHistory`) deliberately gated out
  `source: 'scan'` puzzles, which is what every scanned puzzle was, always. Fix,
  confirmed with the project owner as the right direction rather than a narrower
  session-only patch: `src/scanUI.js`'s "Play it" button now calls the existing
  `savePuzzleToLibrary` (unchanged, no schema change) *before* handing the puzzle to
  `app.js`, with a generic placeholder title (every library puzzle's real name stays
  hidden until solved anyway), then overwrites the puzzle's `id`/`source` to match
  exactly how `loadLibraryPuzzle` already tags a normal library puzzle (`lib-<id>`,
  `source: 'authored'`) — so a scanned puzzle becomes a completely normal
  authored/library puzzle the moment it's played: real history, the new Undo button,
  Save progress, stats, and it shows up in browse/Incomplete, with no scan-specific
  gating left anywhere in `app.js`. The old separate, optional "Save to library"
  step/UI (manual title entry) is gone — publishing is no longer decoupled from
  playing. `board.hasHistory` is now unconditionally `true` (was
  `puzzle.source !== 'scan'`) — the one remaining true scan case (publish failed,
  e.g. offline) still falls back to the original ephemeral `scan-<timestamp>` id
  behavior and gets working post-import Undo too, just no save-progress/stats (no
  stable id) — same as every prior round's behavior for that one edge case, now
  correctly scoped to only that case instead of every scan.
* **Scroll bug, round 4 diagnosis (kept for reference — the fix itself is the entry
  right below).** Two real `?debug=scroll` captures overturned every prior round's
  diagnosis. Later-in-time capture (pan already confirmed self-corrected, 5199 poll
  firings):
  ```
  visualViewport.height: 969        window.innerHeight: 1048
  visualViewport.offsetTop: 0       visualViewport.pageTop: 0
  EXCESS (scrollable beyond visible viewport): 79px
  ```
  Earlier-in-time capture (right as the bug begins, 71 poll firings in):
  ```
  visualViewport.height: 969        window.innerHeight: 969  (same!)
  visualViewport.offsetTop: 79      window.scrollY: 79
  ```
  Combined: at onset, the keyboard/scan-modal interaction shrinks BOTH heights together
  alongside a genuinely stuck pan; over time `window.innerHeight` recovers and the
  existing poll correctly zeroes the pan (confirming that mechanism works as designed)
  — but `visualViewport.height` alone never rejoins the recovery, staying permanently
  stuck at the shrunk figure. `window.scrollTo` (every prior round's fix) can only
  affect scroll position, never height — never capable of fixing this.
* **Scroll bug — round 4 fix: the diagnosis flip above now has a shipped, researched
  fix, NOT yet real-device-verified.** `healStuckViewportHeight()` (`app.js`) toggles
  `display: none` → forced synchronous reflow → `display: ''` on `#page-root`
  (preserving its scroll position across the toggle) whenever nothing is focused (same
  "don't fight a field the player is using" guard `correctResidualViewportPan` already
  uses) and `window.innerHeight − visualViewport.height` exceeds 40px — the real
  captures from round 3 directly confirmed `window.innerHeight` is the reliable "what
  the true full height actually is" reference once the bug has settled, so no separate
  max-height-tracking baseline was needed. This is a real, documented WebKit
  viewport-recompute workaround for exactly this bug class (not guessed — see sources
  below), grounding the "research needed" note from the last round. Wired into the same
  four trigger sites `correctResidualViewportPan` already uses (focusout/focusin
  timeouts, debounced `visualViewport` resize, the 400ms poll) — first fix this project
  has tried that targets the height variable directly instead of scroll position, which
  every prior round's `window.scrollTo`-based approach was structurally incapable of
  touching. `?debug=scroll` updated: an explicit `window.innerHeight −
  visualViewport.height` gap line in the snapshot report, and a "Force heal viewport
  height now" button (mirrors the existing "Force correct now" pan button's
  before/immediately-after/150ms-later logging) so a real-device round can isolate this
  fix the same way the existing tool already isolates the pan fix. **Still needs
  real-device verification** — this project's own preview tooling can't reproduce the
  real iOS bug, and five straight prior rounds on this bug class needed real hardware
  to confirm or refute.
  - Sources (real research, not guessed): the `display:none`→reflow→`''` viewport-
    recompute technique — https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d ;
    background on the underlying WebKit bug class —
    https://dev.to/deanliu/the-ios-safari-keyboard-scroll-bug-fixed-with-one-line-of-css-1353 ,
    https://blog.ni18.in/fixing-ios-safari-viewport-shift-issues/
* **Save-progress-after-auto-publish regression — root-caused and fixed (a genuine
  bug, neither of the two suspected leads).** Real cause: `loadLibraryPuzzle`
  (`src/puzzleLibrary.js`) has ALWAYS returned a played library puzzle's `id` as
  `lib-<firestoreId>` (a leftover disambiguation prefix — unnecessary, since built-in
  ids like `heart-5` can't collide with Firestore's own 20-char random ids), but the
  library browse list's `entry.id` (used by `renderLibraryList`/`fetchInProgressPuzzles`
  to look up in-progress/solved state, and by the "Play"/rename handlers to address
  `puzzles/{id}` directly) has always been the bare, unprefixed id. `saveInProgressPuzzle`/
  `recordPuzzleSolved` key their writes off `puzzle.id` — so for any *community* library
  puzzle (not just this round's auto-published scans), a save/solved write always
  actually succeeded, but under the WRONG key: `entry.id` (bare) never matched the doc
  actually written (`lib-`+bare), so the Incomplete/Solved badges could never find it.
  "Claims success, nothing shows up" describes this exactly — a genuinely successful
  write, silently unfindable, not a race and not an optimistic confirmation UI (traced
  both leads directly: the "Play it" publish call in `scanUI.js` was already correctly
  `await`ed before `onPuzzleReady`/`startPuzzle` ever run, and `btnSaveProgress`'s "Progress
  saved" message already only fires after `saveProgressIfApplicable()` resolves without
  throwing — both cleared). This bug predates this round entirely — it just never
  surfaced before because every previously-tested save/resume round trip in this
  project's history happened to use a BUILT-IN puzzle, where `entry.id` and `puzzle.id`
  are the same string with no `lib-` involved at all, so this exact mismatch was
  invisible until a community-sourced (or, after this round, auto-published-scan)
  puzzle's save was actually checked end-to-end. Fix: `loadLibraryPuzzle` now returns
  the bare Firestore id directly as `puzzle.id` (no prefix), and the auto-publish
  handler (`src/scanUI.js`) does the same; the now-redundant, never-actually-read
  `libraryId` field is removed from both. Verified end-to-end in browser preview: played
  a COMMUNITY puzzle (not built-in), marked one cell, saved, confirmed it now appears
  under the library's Incomplete filter, and confirmed "Resume" correctly restores the
  saved mark — the exact round trip that was silently broken before. All 812 tests
  still pass. **This also means solved-badge/times-solved tracking for community
  puzzles was equally affected by the same key mismatch and is fixed by the same
  change** (both `solvedLibraryPuzzles` and `inProgressPuzzles` key off the same
  `puzzle.id`) — not separately reported, but worth knowing if it comes up.
* **Real-device report: the puzzle library got stuck on "Loading…" forever on the live
  site — root-caused and fixed, a genuine pre-existing gap unrelated to push/deploy
  state.** `src/firebase.js`'s Firebase bootstrapping (CDN module imports, the
  Anonymous Auth sign-in handshake) had no timeout anywhere — a silently
  blocked/stalled network request (an ad-blocker/privacy extension or firewall
  dropping requests to `gstatic.com`/Google's Identity Toolkit is the common real-world
  cause) left the relevant promise pending forever, and since every caller's `.catch()`
  fallback only guards against a *rejection*, a promise that never settles at all just
  hangs the whole chain — matching "claims to load, never completes" exactly. Made
  worse by this round's scan-auto-publish change: "Play it" on a fresh scan now also
  depends on this same sign-in succeeding (`savePuzzleToLibrary` calls
  `ensureSignedIn()`), where before a fresh scan needed no network at all — so the same
  stuck-auth cause could now also freeze the core scan-and-play flow, not just the
  library. **Confirmed directly by the project owner**: closing and fully restarting
  the web app made it work again — consistent with the exact mechanism found: every
  Firebase promise in the old code was cached at module scope and NEVER cleared on
  failure, so one stuck attempt permanently doomed every later attempt in that same
  page session (only a full reload resets the caches to `null`), even once the
  underlying block was transient/gone. Fix: added a small `withTimeout` wrapper
  (8-second budget) around every CDN dynamic import and the sign-in handshake, and
  every cached promise (`appPromise`, `functionsPromise`, `authPromise`,
  `firestorePromise`, `signedInUserPromise`) is now reset to `null` on failure so a
  later retry (reopening the library, pressing Save progress again) gets a genuine
  fresh attempt instead of needing a full app restart. Verified: the timeout mechanism
  itself (a promise that never settles correctly rejects after the budget) confirmed
  directly in-browser; the normal (non-blocked) happy path re-verified unaffected
  (library still loads all 7 entries, no console errors). All 812 tests still pass
  (this module is inert during `npm test` either way — see its own header comment).
* **Real-device report: repeatedly tapping the new Undo button on iPad zoomed the
  screen in and out — fixed.** iOS Safari's native double-tap-to-zoom gesture firing
  on two taps landing close together in time/position, exactly what stepping Undo back
  several moves in a row does. `styles.css`'s shared `.btn`/`.mode-btn` classes had no
  `touch-action` set at all, so the browser's default zoom-gesture handling was still
  live on every toolbar/menu button. Fix: `touch-action: manipulation` on both —
  disables double-tap-zoom (and the ~300ms tap delay, as a free side effect) without
  touching the page's viewport meta tag, so pinch-zoom stays available everywhere else
  as an accessibility aid on large puzzles. Applied to the whole shared button classes,
  not just Undo, since any rapidly-tapped control is exposed to the same gesture — Undo
  is just the one control in this app actually designed to be tapped repeatedly.
  Verified: the property applies correctly to every affected button in browser preview,
  and a normal click/undo round trip still works unaffected. All 812 tests still pass.
  **CONFIRMED on the real device by the project owner.**
* **Real-device report: dragging across more than a few cells, finger never leaving the
  screen and never crossing an already-marked cell, would sometimes still leave some
  cells unpainted — root-caused and fixed. A different bug class from the double-tap-
  zoom fix above (a gesture/browser-chrome conflict), not the same thing:** this one is
  a plain sampling gap. `pointermove` (`app.js`'s `attachPointerHandlers`) only ever
  painted whichever single cell was exactly under the pointer at the moment each event
  fired — on a fast swipe, especially over small cells (a large puzzle's cells shrink
  toward `MIN_CELL_PX`), two consecutive samples can easily land in non-adjacent cells,
  silently skipping whatever was in between even though the finger visually passed
  straight over it without lifting. Fix: a standard Bresenham line-walk
  (`cellsOnLine`) between the drag's last known cell and its current one, painting
  every cell the pointer's path crossed since the last sample instead of only its
  final resting point — grid cells are just integer (row, col) coordinates, no
  different from pixels for this purpose. `dragging.touched` still dedupes as before,
  so this only ever paints strictly more of what a drag already visually covered, never
  something new. Verified in browser preview two ways: a simulated fast horizontal
  swipe (a single pointermove jumping straight from column 0 to column 4 on a 10x10
  puzzle, skipping columns 1-3 entirely) correctly painted all 4 intervening cells —
  confirmed correct via the row's own clue (a run of 4) triggering real auto-X on the
  cell right after, exactly as a genuine cell-by-cell drag would; and a simulated fast
  diagonal swipe (row+col both jumping 3) correctly painted all 4 diagonal cells in
  Mark-empty mode. All 812 tests still pass. **CONFIRMED on the real device by the
  project owner.**

* **New feature — dedicated Eraser mode, built and preview-verified.** Third option
  in the mode toggle (`#mode-erase` in `index.html`, `.mode-btn`/`.mode-toggle` CSS
  unchanged/reused), alongside Fill and Mark-empty. Click/tap on a FILLED or EMPTY
  cell clears it back to UNKNOWN; a click on an already-UNKNOWN cell is a no-op; a
  drag clears every FILLED/EMPTY cell along its path (reusing the existing Bresenham
  `cellsOnLine` walk from the fast-drag-skips-cells fix), leaving UNKNOWN cells
  untouched — the mirror image of Fill/Mark-empty's own "drag only paints
  still-blank cells" rule, which is unchanged for those two modes. Implementation
  reuses `computeUnfillChanges`/`applyUnfillWithSound` (`app.js`) exactly as planned
  rather than adding new logic — that function turned out to already be fully
  state-agnostic (it just forces the target cell to UNKNOWN and recomputes
  row/col-satisfaction diffs), so generalizing Eraser's `isUnfill` check from
  "current is FILLED" to "current is FILLED or EMPTY" was enough to cover X-mark
  erasure too, including a locked line's auto-X siblings correctly reverting when
  erasing a FILLED cell drops the line out of satisfaction. Verified in browser
  preview: single-click erase of a FILLED cell (with correct auto-X-sibling
  revert), a multi-cell drag-erase across filled cells in one stroke, single-click
  erase of an X mark, and a no-op click on an already-UNKNOWN cell. All 812 tests
  still pass. Not yet confirmed on the real device.

* **Removed the routine per-cell sound effects** (`fillClick`, `xClick`, the
  drag-sweep sound) per the project owner's direct feedback that the constant
  "dinging" on every mark/drag was annoying. `applyMoveWithSound`/
  `applyUnfillWithSound` (`app.js`) no longer play anything for an ordinary
  single fill/X mark or drag-sweep step — only `lock`/`unlock` (a line
  completing/reopening), `error` (a mistake caught), `batchCompleteChime` (a
  multi-cell hint or auto-X batch), and `completeFanfare` (solving the puzzle)
  still play. The now-dead `dragStep` sound branches, the `startDragSweep`/
  `stopDragSweep`/`onDragSweepCell` exports, and the whole 'retrigger'/'stretch'
  drag-sweep prototype in `src/sounds.js` were removed along with them rather
  than left as unreachable code; `fillClick`/`xClick`/`dragSweep` dropped from
  `SOUND_FILES` too (the placeholder `.mp3` files themselves are left in place,
  just unreferenced — see `assets/sounds/README.md`, updated to match). Both
  Fill and Mark-empty are now silent for routine marks — the project owner's
  partial confirmation was X-only ("I can't hear x's"); Fill is silenced by the
  same code path, not a separate check. All 812 tests still pass. Not yet
  confirmed on the real device.

* **Real bug found and fixed: Undo does not correctly undo X marks — root cause was not a
  FILLED-vs-EMPTY asymmetry (the originally suspected cause).** `Board.undoLast`/
  `undoToMove` (`model.js`) turned out to already be completely state-agnostic — verified
  directly, and confirmed by reproducing the project owner's exact repro (drag-place a run
  of X's on a fresh board, then Undo) in browser preview: it undid correctly, one cell per
  press, symmetric with Fill. **The real bug only shows up on a RESUMED puzzle**: `startPuzzle`
  (`app.js`) seeds a resumed/scan-imported board's marks straight into `grid` via
  `Board.fromGrid`, with `history` starting empty — but `undoToMove` rebuilt `grid` from a
  blank `createGrid` and replayed only `history` onto it, so *any* undo after resuming
  wiped every pre-existing mark (both FILLED and EMPTY) back to UNKNOWN on the very first
  press, not just the intended one move — a much bigger, more visible malfunction than "one
  cell doesn't revert," which is a plausible match for what read as "Undo does not correctly
  undo X marks." A comment in `app.js`'s Undo-button section had assumed this was already
  safe ("undo naturally can't cross it") on the mistaken premise that undo steps back
  incrementally from the current grid — `undoToMove` actually rebuilds from scratch every
  time, so that assumption was wrong regardless of which state was involved.
  - **Fix**: `Board` now tracks a `baseline` grid (blank for a fresh board; a copy of the
    seeded grid for `fromGrid`), threaded through `clone()` too, and `undoToMove` rebuilds
    from a copy of `baseline` instead of a blank grid before replaying history on top.
  - **Verified**: 4 new unit tests in `test/model.test.js` (`Board.fromGrid baseline
    survives undo`) cover `undoLast` and `undoToMove(0)` preserving both FILLED and EMPTY
    baseline marks, `clone()` carrying the baseline through, and a plain non-baseline board
    still undoing down to blank exactly as before. All 816 tests pass (812 + 4 new). Not
    yet re-verified against a real Firebase save→resume→undo round trip or on the real
    device.

* **New feature — "draw a puzzle" — built and verified end-to-end in browser preview
  against the real Firebase project (not just unit-tested).** A new Help-menu entry
  ("Draw a puzzle") opens a third full-screen wizard alongside Scan: pick a grid size (2-30
  per side) → draw on a blank grid (click/tap/drag toggles a cell filled; row/column clue
  numbers along the top/left update live via `deriveClues`/`cluesFromLine` — no solving
  logic involved at this step) → "Done drawing" derives clues and validates they have
  exactly one solution → "Play it" auto-publishes to the public library and starts the
  puzzle blank, exactly like any other library puzzle.
  - **New modules**: `src/drawPuzzle.js` (pure — builds+validates a puzzle from a drawn
    grid, no DOM) and `src/drawUI.js` (DOM wiring, modeled directly on `src/scanUI.js`'s
    structure/step pattern but much simpler — no canvas/image/OCR pipeline at all).
    `src/geometry.js` is new too: `cellsOnLine` (the Bresenham drag-fill-gap fix) was
    extracted out of `app.js`, its original single-purpose home, once the draw grid's own
    drag-painting needed the exact identical logic — both the real board and the drawing
    grid now import it from one place instead of duplicating it.
  - **Uniqueness enforcement, resolved exactly per this item's earlier design decision (see
    the old Current Objective entry this replaces)**: `buildDrawnPuzzle` derives clues from
    the drawn grid, then runs `fullSolve.js`'s `solvePuzzleFully` against ONLY those derived
    clues (no peeking at the known solution) — reusing scanned puzzles' existing validation
    call, not a new checker. Confirmed (and worth recording, since `fullSolve.js`'s own
    comment disclaims proving uniqueness) that this reuse is mathematically sound as a
    genuine uniqueness proof, not just a solvability check: every technique
    `solvePuzzleFully` applies (line deduction, contradiction search) is SOUND — it only
    ever fixes a cell when every valid completion of the clues agrees on that cell — so
    reaching a fully-marked board (`solved: true`) proves the clues have exactly one
    solution. A second, different valid solution would mean two completions disagree on
    some cell, and neither value at that cell could ever be soundly forced, so full
    completion could never be reached. `MIN_FILLED_CELLS` also rejects an all-blank
    drawing (trivially "unique" but not a real picture).
  - A drawn puzzle deliberately does **not** seed `initialMarks` the way a scan does — a
    scan's marks are already-observed real-world progress, but a drawing IS the solution,
    so the player (or anyone else) needs to solve it from a blank board for the picture to
    mean anything. Confirmed directly in preview: the published puzzle loaded with 0/25
    cells marked and the correct derived clues.
  - **`source: 'drawn'`** joins `'scan'` as the second "unpublished, no stable library id
    yet" origin (only reachable if the library publish itself fails — offline, not deployed
    — same rare fallback shape `scanUI.js`'s `'scan'` case already has; overridden to
    `'authored'` on a successful publish, same as scan). Generalized the four places that
    used to check `puzzle.source === 'scan'` specifically (`app.js`'s
    saveProgressIfApplicable/menuRestart/maybeShowCompletion/btnSaveProgress, plus
    `stats.js`'s recordCompletion and `puzzleLibrary.js`'s recordPuzzleSolved) into one
    shared `model.js` export, `hasUnstableId(puzzle)`, rather than duplicating a second
    `|| puzzle.source === 'drawn'` at each site.
  - **Verified end-to-end in browser preview against the real Firestore project**: drew a
    5x5 plus-sign, confirmed live clue labels updated correctly during drawing, confirmed
    "Done drawing" passed (plus-sign clues are genuinely unique), confirmed "Play it"
    published a real `puzzles/{id}` doc (checked directly via `fetchLibraryPuzzles()` and
    the library modal — showed up as "Puzzle 5 — 5x5" with a Rename affordance, confirming
    it's this session's own creation, title correctly hidden until solved), confirmed the
    puzzle loaded BLANK (0 filled/0 empty of 25 cells) with the correct derived clues,
    solved it for real by filling the plus-sign pattern on the actual play board, and
    confirmed the completion modal fired correctly (revealed the real name "Drawn puzzle",
    0 mistakes, 0 hints) — the full draw→validate→publish→play-blank→solve round trip,
    not just the build step in isolation. Separately confirmed the ambiguity-rejection
    message renders correctly (a 2x2 diagonal — the classic two-solution nonogram case) and
    that Cancel returns cleanly to the play screen. Checked mobile viewport (375px): the
    drawing grid correctly scrolls horizontally within its own `.draw-grid-wrap` container
    (`overflow: auto`) without the page itself ever gaining horizontal overflow. This
    testing round's own "Drawn puzzle" (5x5) is now a real, permanent entry in the live
    public library, alongside a pre-existing "Scanned puzzle" test entry from a past
    round — same acceptable testing footprint prior rounds' real-Firestore verification
    has always had.
  - **Tests**: `test/drawPuzzle.test.js` (new) — rejects an all-blank grid, accepts every
    built-in `SAMPLE_PUZZLES` solution as a drawing (each turned out to already be uniquely
    solvable — a useful confirmation, since none of them had ever been run through this
    check before), rejects a genuinely ambiguous 2x2 diagonal, and accepts the minimum
    single-filled-cell case. Plus two new `hasUnstableId` tests in `test/model.test.js`.
    All 822 tests pass (818 + 4 new draw tests + 2 new `hasUnstableId` tests less
    duplication — see the file for the exact count). Not yet real-device-confirmed (same
    "preview-verified, awaiting the project owner's on-device pass" status every other
    recent addition has).

* **Toolbar cleanup — done, preview-verified.** Full reorder to the exact spec: Library →
  mode toggle (Fill / X / Eraser) → Undo → a visual gap → Stats → Mute → Save → Help. The old
  `.library-entry-group` wrapper (Library+Stats+Save+Undo clustered together) is gone —
  those four are now spread across the row in the order above instead of grouped by "moved
  out of the Help menu" history.
  - **X and Eraser go icon-only**: `mode-x` drops to a bare "✕" (was "✕ Mark empty"— "Mark
    empty" as *words* is gone, the accessible name/tooltip still says "Mark empty"). The
    Eraser button's old 🧹 broom-emoji placeholder is replaced with a real inline SVG
    pencil-eraser icon (`index.html`, `.icon-eraser`) — a rotated rounded rectangle with a
    dividing line evoking the classic two-tone eraser block, since no single emoji reads as
    "eraser" consistently across platforms. Deliberately `stroke="currentColor"` rather than a
    fixed color, so it inherits `.mode-btn[aria-pressed="true"]`'s existing gold/dark color
    swap for free — no separate active-state CSS needed, same as the plain-text Fill/X
    buttons already got automatically.
  - **Stats goes icon-only** too (`btn-open-stats`, was "📊 Stats" → bare 📊).
  - **New shared tooltip mechanism**: `src/tooltip.js` (new module, `attachTooltip`/
    `initTooltips`) — a single shared floating bubble element, not the native `title`
    attribute. Chosen deliberately per the spec's own instinct: this project has repeatedly
    hit iOS-Safari-specific chrome quirks (the whole scroll-bug saga below), and native
    `title` tooltips are a known-unreliable case on iOS Safari touch specifically — the
    platform this app is mainly played on. Shows on `mouseenter`/`focus` (desktop/keyboard,
    300ms delay to avoid flashing on incidental mouse passes) and on `touchstart` (touch has
    no hover state at all, so the tap itself is the only "looking at this button" signal —
    shown immediately, auto-hidden after 1.6s). Wired via `data-tooltip` attributes on
    `mode-x`, `mode-erase`, `btn-open-stats`, `btn-undo`, `btn-save-progress` — the last two
    already had a native `title` from an earlier round (Undo/Save were already icon-only);
    those were switched to the same custom mechanism too rather than mixing both tooltip
    systems in one toolbar.
  - **Margin-leak reset rescoped, not reintroduced**: round 4's `.library-entry-group .btn {
    margin-top: 0 }` fix (for the `.btn + .btn` vertical-stack rule leaking into a horizontal
    toolbar row) had its wrapper class removed by this reorder, so it was rescoped to
    `.toolbar > .btn { margin-top: 0 }` — every direct `.btn` child of the toolbar, not just a
    subset — kept in the same "after `.btn + .btn` in source order" position round 4 already
    established for the cascade tie-break to land correctly.
  - **Verified in browser preview**: `read_page` confirmed the exact button order and
    accessible names (Library → Fill → "Mark empty" → Eraser → "Undo last move" → Stats →
    "Mute sound" → "Save progress" → Help); hovering Eraser and Stats each correctly showed
    their custom tooltip bubble; clicking X confirmed `aria-pressed` still toggles correctly
    across all three mode buttons (no wiring broke — every button is still looked up by id in
    `app.js`, never by its old text). All 822 tests still pass (this is a markup/CSS/tooltip
    change only, nothing solver- or model-related). Not yet real-device-confirmed — in
    particular the touch-press tooltip path (`touchstart`) can't be exercised from this
    environment's preview tooling, only its hover/focus path.

* **Scroll bug round 5 tooling extension — done, per the project owner's explicit request
  this round (an exception to the "reference only" framing below — this specific piece was
  actively commissioned, not just standing state).** Three separate real-device attempts in a
  row all happened to sample the pan-stuck (height gap already 0) state, never the
  height-diverged one `healStuckViewportHeight` actually exists to correct — manual timing
  kept missing the window despite genuine, careful effort each time. `app.js`'s
  `initScrollDiagnostics` now auto-logs the height-diverged state itself into the existing
  `?debug=scroll` history log: a `checkStuckHeightGapObservation` function computes the exact
  same number `healStuckViewportHeight`'s own threshold gate watches
  (`window.innerHeight − visualViewport.height`) and logs a `HEIGHT GAP CROSSED THRESHOLD`
  history entry the moment it first crosses `STUCK_HEIGHT_THRESHOLD_PX` (40px) — no manual tap
  required. Edge-triggered (an `armed`/`disarmed` flag): logs once per crossing, re-arms once
  the gap drops back under threshold, so a second, later occurrence in the same page load still
  gets its own entry instead of the capped 60-line history filling up with repeats of the same
  still-stuck state. Checked on its own independent `setInterval(…, 400)` (same cadence as the
  existing correction poll, but a separate interval — it has to keep observing regardless of
  whether the correction poll or `healStuckViewportHeight` itself is running, gated, or
  mid-correction at any given tick) plus directly on every `visualViewport` `resize` event, for
  the tightest-possible catch right at the moment most likely to produce a fresh crossing.
  **Deliberately purely observational**: it only ever calls `logHistory`, never
  `healStuckViewportHeight` or any other corrective call — it exists solely to answer
  "did/when did the height-diverged state occur," independent of whatever fix attempt is or
  isn't active, so it can't mask or be masked by one. Does **not** touch
  `correctResidualViewportPan` or its `window.scrollTo` mechanism at all — per the standing
  instruction below, that mechanism is conclusively proven broken and wasn't refined further.
  Syntax-checked (`node --check app.js`) and all 822 tests still pass (this module is inert
  during `npm test` — gated behind `?debug=scroll` in the URL, same as the rest of
  `initScrollDiagnostics`). **Not real-device-testable from this environment**, same as every
  other piece of this diagnostic tool — the project owner can now reproduce the bug normally,
  at whatever pace, and check the history log afterward for whether/when a crossing entry
  appears, rather than needing to catch it live with perfect manual timing.

* **Toolbar follow-up round — done, preview-verified.** Direct project-owner feedback on the
  toolbar cleanup above, addressed the same round:
  - **Help button no longer pinned to the far right edge.** `.help-menu`'s `margin-left: auto`
    (from the original UI-consolidation round) pushed Help to the far right edge of
    `.board-panel` — which stretches to the page's full available width regardless of the
    actual puzzle/toolbar's own size, since neither `.layout` nor `.board-panel` has a width
    rule of its own. For any puzzle narrower than the page, that left a large dead gap between
    Save and Help, worse once the toolbar wraps (the auto margin only pushes to the end of
    whichever line Help itself lands on). Removed the auto margin entirely — Help now just
    flows in sequence after Save with the same `.toolbar` `gap` as every other button pair.
  - **Toolbar tightened for one-line fit**, explicitly requested so the toolbar doesn't cost
    the puzzle grid a second row of vertical height by wrapping: `.toolbar`'s own `gap`
    (0.9rem → 0.45rem), `.toolbar__gap`'s cluster-separator width (0.9rem → 0.6rem), and the
    horizontal padding on `.btn` (0.9rem → 0.7rem), `.btn--icon` (0.7rem → 0.55rem), `.mode-btn`
    (0.8rem → 0.6rem), `.mode-btn--icon` (0.6rem → 0.45rem), `.mute-toggle` (0.7rem → 0.55rem),
    and `.help-menu__trigger` (0.75rem → 0.6rem) all trimmed. Measured directly in preview: the
    toolbar's 8 controls now need ~508px of content width (was ~630px+ before), fitting on one
    line at iPad-portrait width (768px, this project's real device) with real room to spare;
    a very narrow phone portrait width can still wrap, which `flex-wrap` already handles
    gracefully as a fallback, not a bug.
  - **Vertical whitespace above the toolbar trimmed too** (same "space for puzzles" ask): `.page`
    top padding (2.5rem → 1.25rem, mirrored on `.scan-screen` per its own "styled to match
    .page" comment) and `.header`'s bottom margin (2rem → 0.85rem) — reclaims vertical room for
    the puzzle grid without touching the title's own font size/visual weight.
  - **Eraser icon redesigned — first SVG attempt (a bare rotated outline rectangle) confirmed
    by the project owner as unrecognizable** ("That doesn't look like a pencil eraser at all
    ... I would have no idea what that icon is"). Root problem: an outline-only rotated
    rectangle has no cues distinguishing it from a pill, battery, or any other slanted capsule
    shape — a rectangle alone isn't enough. Redesigned with the two elements that actually make
    an eraser icon read as one (the same combination real icon sets use, e.g. Material Symbols'
    "ink eraser"): a **filled** (not just outlined) two-tone block — `fill-opacity` tint plus a
    divider line for the classic two-tone rubber/wrapper look — **and** a short wavy
    pencil-mark scribble trailing out from underneath it, as if being wiped away mid-stroke.
    Verified directly in browser preview at both actual toolbar size (18px, cloned into an
    isolated high-contrast box) and a further zoomed-in view — reads clearly as an eraser
    actively erasing a mark at both sizes, not an ambiguous shape. Still `currentColor`
    throughout, so it still tracks `.mode-btn[aria-pressed="true"]`'s color swap for free.
  - All 822 tests still pass (markup/CSS only). Not yet real-device-confirmed.
  - **DECIDED, final: keeping this second-attempt icon as-is — no third attempt.**
    A third round with a specific concrete target was raised (a literal
    yellow-pencil/pink-eraser icon, per direct feedback), but the project owner
    weighed the flagged design tradeoff (that icon would need fixed colors and
    lose the free `currentColor` active-state swap this one gets automatically)
    and decided it wasn't worth pursuing. This icon is final.

* **"Scan a puzzle" and "Draw a puzzle" moved from the Help menu into the puzzle library
  modal — done, preview-verified.** Per direct request: these are ways to get a puzzle to
  play, the same conceptual category as browsing the library itself (the same reasoning that
  already moved Library/Stats/Save out of Help in earlier rounds), not help actions. The two
  `<li>` entries are gone from `#help-menu-list`; `#library-modal` now opens with a
  "📷 Scan a puzzle" / "✏️ Draw a puzzle" button row (`.library-actions`, new) above the
  existing filter/browse list, separated by a thin bottom border rather than a full divider
  block. Clicking either hides the library modal first, then opens the respective wizard
  (`els.libraryBtnScan`/`libraryBtnDraw` in `app.js`, replacing the old `els.menuScan`/
  `menuDraw` Help-menu handlers) — same "only one full-screen view/modal up at a time" rule
  every other modal-to-wizard handoff in this app already follows. Verified directly in
  browser preview: clicking "Scan a puzzle" closes the library and opens the scan wizard;
  clicking "Draw a puzzle" does the same for the draw wizard; the Help dropdown's item list no
  longer contains either entry. All 822 tests still pass. Not yet real-device-confirmed.

* **Two small direct follow-ups — done, preview-verified.**
  1. "Puzzle library" shortened to just **"Library"**, both on the toolbar button and the
     modal's own `<h2>` title, so the two stay consistent with each other.
  2. **"Scan a puzzle" / "Draw a puzzle" misaligned — the exact same bug class as round 4's
     original toolbar-alignment bug, in a new location.** `.library-actions .btn` (the new row
     added this project) was the one horizontal `.btn` group that didn't reset the shared
     `.btn + .btn { margin-top: 0.5rem }` rule (meant for vertical stacks elsewhere) back to
     0, so "Draw a puzzle" — directly following another `.btn` — sat 8px lower than "Scan a
     puzzle", same mechanism as `.toolbar > .btn`/the old `.library-entry-group .btn` fix.
     Fixed the same way: `.library-actions .btn { margin-top: 0 }`. Verified by direct
     `getBoundingClientRect` comparison in preview: both buttons now report identical
     `rect.top`/`rect.bottom` (192.2/227.4 in that run), not just a visual eyeball check. All
     822 tests still pass. Not yet real-device-confirmed.

* **Scan-a-puzzle size-first restructure — done, preview-verified end-to-end against the
  real 25x25 ground-truth test image.** Per direct instruction ("Let's just do this and
  stop chasing our tails on this stupid bug") — sidesteps the scroll bug for this specific
  interaction rather than continuing to chase the underlying WebKit issue. Two changes,
  both applying the draw-a-puzzle wizard's already-working pattern to the scan wizard:
  1. **Dimension entry moved to its own screen, shown FIRST — before the photo/grid step —
     matching draw-a-puzzle's own step-size screen exactly** (`src/scanUI.js`'s new
     `scanBtnSizeContinue` handler, `#scan-step-size` in `index.html`, shown by default
     instead of `#scan-step-upload`). Validates 1-60 per side (wider than draw's 2-30 — a
     real printed puzzle being scanned can be smaller than anything worth hand-drawing, and
     this project's own 25x25 ground-truth test puzzle is already most of the way to a
     30-cap) before advancing; `state.rows`/`state.cols` are set here, before any photo is
     even chosen.
  2. **The second, redundant dimension-confirmation step (re-displaying/re-editing a
     suggested count after grid detection) is gone entirely.** `#scan-grid-confirm`'s
     duplicate Rows/Columns inputs and the "Scan clue numbers" button are removed from
     `index.html`; the grid step's "Looks good" button (`scanBtnConfirmGrid`) now snaps the
     rectangle AND goes straight into fill-state detection + OCR in one click, using
     `state.rows`/`state.cols` from step 1 directly — no re-suggestion, no re-display. This
     also deleted the row/col-count-guessing machinery that only existed to feed that
     redundant step: `suggestLineCount`/`parseKnownCount`/`updateKnownCountMismatchHint` and
     the `rowProfile`/`colProfile`/`countGridLines` imports they used are gone from
     `scanUI.js` — dead code once dimensions are always given up front, not left unreachable.
  - **This closes the loop specifically for the scan wizard's known trigger interaction, not
    necessarily the whole underlying scroll bug** — the earlier round-4/round-5
    investigation showed the same stuck-viewport symptom can also occur on the plain main
    play screen, unrelated to the scan wizard, which this redesign doesn't touch and doesn't
    claim to fix. Per the "stop chasing our tails" instruction, further investigation into
    the underlying `visualViewport` mechanism (rounds 1-5, still unresolved) remains
    deprioritized — unaffected by this round.
  - **Verified end-to-end in browser preview against the real ground-truth image**
    (`scratch-images/sample-mid-solve.jpg`, injected into the file input via a scripted
    `DataTransfer` since the preview tooling has no native file picker): confirmed the size
    step appears first (Rows/Columns/Continue, no upload/grid content visible yet); entered
    the puzzle's real 25x25 size and confirmed it advanced straight to the upload step with
    no dimension fields anywhere on the grid step; confirmed clicking "Looks good" went
    directly into fill-state detection and a live "Reading clue numbers… (N of 50)" OCR
    progress count (25 rows + 25 cols, matching the given size) with no intermediate
    re-confirmation screen; confirmed the resulting correction step's clues matched the
    known ground truth exactly for every line spot-checked (Row 1: 2,5; Row 2: 1,4; Row 3:
    1,1,4,4; Col 1: 11); confirmed "Build puzzle" and "Cancel" both still wire through
    correctly (this run hit the already-accepted residual OCR noise on some other line,
    correctly surfacing the existing "couldn't find a valid solution" message — not a
    regression, see the standing OCR-accuracy acceptance above); confirmed the draw-a-puzzle
    wizard's own step-size screen is visually unaffected (shared `.scan-known-count` CSS).
    No console errors. All 822 tests pass (this module has no dedicated unit tests, same as
    the rest of scanUI.js's DOM wiring — consistent with the rest of the codebase).
  - **CONFIRMED on the real device by the project owner: the scroll bug no longer occurs on
    this interaction.** After six straight failed rounds trying to fix the underlying
    WebKit `visualViewport` mechanism directly, sidestepping the trigger entirely worked.
    This closes the scroll-bug investigation as far as its practical, most commonly-hit
    manifestation is concerned — the scan wizard's own dimension entry, the interaction
    every real-device capture this whole saga was built from. **Worth stating precisely
    what is and isn't actually resolved**: the underlying WebKit issue itself was never
    understood or fixed — it was successfully routed around by removing the specific
    trigger (a text-input keyboard opening inside that screen), not addressed at its root.
    The same class of symptom was separately observed once on the plain main play screen,
    unrelated to any wizard, and that path remains completely untouched by this fix — if
    it resurfaces there or anywhere else, that would be new, separate work, not something
    this closes out by extension. For everything this project actually needed solved in
    practice, though, this is done.

* **Three related library/draw-puzzle cleanup items — done, preview-verified end-to-end
  against the real Firebase project.** All from real use of the puzzle library screen:
  1. **"Draw a puzzle" now prompts for a name at save time.** A new "Name your puzzle"
     text field on `#draw-step-done` (`index.html`, `.draw-name-field` in `styles.css`);
     `els.drawBtnPlay`'s handler (`src/drawUI.js`) requires a non-empty trimmed value
     (shows an inline "Give your puzzle a name before playing it." error otherwise, same
     `.scan-build-error` pattern used elsewhere in these wizards) before calling
     `savePuzzleToLibrary` with that title instead of the old hardcoded `'Drawn puzzle'`
     string. Also patches `p.name = title` after a successful publish — without this,
     THIS SAME play-through's own completion modal would have revealed the stale
     placeholder name instead of what was just typed (a later re-open via
     `loadLibraryPuzzle` always gets it right off Firestore's own `title` field
     regardless; only the first, same-session play needed the local object corrected to
     match). The scan wizard's own auto-publish-under-a-placeholder behavior is
     deliberately untouched — a scan recreates someone else's existing puzzle, so naming
     it doesn't carry the same meaning a player's own original drawing does.
  2. **The Built-in/Community badge is removed entirely**, not shrunk — there's no way to
     grow "Built-in" past whatever small handful `SAMPLE_PUZZLES` hardcodes, so the
     distinction could only ever read as permanent, meaningless clutter as the library
     grows. `renderLibraryList` (`app.js`) no longer creates the badge span at all;
     `.library-row__badge`/`--builtin`/`--community` are deleted from `styles.css` as
     fully dead code, not left unreachable. `entry.builtin` itself is untouched — still
     used functionally to pick the right puzzle source and to gate the rename
     affordance to non-built-in rows, just no longer rendered as a visible label.
  3. **The "Rename" control is now a compact icon-only button**, not a long-press
     gesture — chosen over long-press because this project already has an established,
     working pattern for exactly this (icon-only toolbar buttons + `src/tooltip.js`'s
     shared hover/focus/touch-press tooltip, used for Undo/Stats/Eraser), while a
     long-press gesture would be new, unproven interaction surface with its own timing/
     feedback questions and no precedent anywhere else in the app. `renameBtn` (`app.js`)
     drops its `btn btn--ghost` "Rename" text for `btn btn--icon`, a bare "✏️", an
     `aria-label`/`data-tooltip` of "Rename", and an explicit `attachTooltip(renameBtn)`
     call (needed because this button is created fresh on every list render, long after
     the one-time boot-time `initTooltips()` sweep). `styles.css` adds a
     `.library-row .btn--icon` override, placed after the equal-specificity
     `.library-row .btn` rule for the cascade tie-break to land here instead — the same
     source-order pattern round 4's toolbar-alignment fix established — so the icon gets
     compact square padding instead of the wider text-button padding `.library-row .btn`
     sets for Play/Resume/Save.
  - **Verified end-to-end in browser preview**: confirmed both badges gone from every row
    (built-in and community); confirmed the existing "Drawn puzzle" test entry's rename
    icon opens the same inline Save/Cancel edit state as before (only the trigger control
    changed, not the edit flow itself) and Cancel correctly reverts it; drew a fresh 3x3
    solid-block puzzle (a trivially unique picture), confirmed "Play it" with an empty
    name field shows the validation error and does NOT publish, then confirmed entering
    "Verification Square" and clicking "Play it" published it, started it blank, and
    solving it showed the completion modal with the real typed name "Verification
    Square" (not a placeholder) — proving the `p.name` patch works. No console errors.
    All 822 tests pass. Not yet real-device-confirmed.
* **The rename-popup scroll-bug fix and the new hide-a-puzzle feature — DONE,
  deployed, and now CONFIRMED on the real device by the project owner, shipped
  together this round per the standing deploy-batching note.** Rename now
  opens a top-pinned `#rename-modal` popup (`showRenameModal` in `app.js`,
  mirroring the existing `showConfirm` pattern) instead of editing the library
  row in place — the same avoid-the-trigger strategy as the scan-wizard
  restructure, targeting the second confirmed real-device scroll-bug trigger
  (a keyboard opening on a text input positioned near the bottom of the
  screen). Hide adds a small icon-only 🙈/👁️ toggle to every library row
  (built-in or community, unlike Rename — hiding is a personal preference,
  not an edit) plus a required "Show hidden puzzles" checkbox to reveal/unhide
  again, backed by a new `users/{uid}/hiddenLibraryPuzzles/{puzzleId}`
  collection synced across paired devices, same pattern as solved/in-progress
  tracking; its `firestore.rules` entry is deployed and live. Verified the
  full hide→show hidden→unhide round trip against the live Firebase project
  with no console errors. **This is the second confirmed instance of the
  same fix strategy working** — avoid the trigger (a text input near the
  bottom of the screen) rather than fix the underlying WebKit mechanism.

* **All four of last round's Current Objective items are DONE, preview-verified. Cloud
  Function + Firestore rules deploy for item 2 is the one piece still pending, deliberately
  — see this entry's own note below.**
  1. **Board-drag scroll bug, fixed via `touch-action: none` on `.nono-grid`** (not
     `.board-root`, its `overflow: auto` ancestor — see the CSS comment for why: that's the
     fallback scroll path for a puzzle `fitBoardToViewport`'s sizing math didn't manage to
     fully fit on screen, and needs to keep working if that math is ever imperfect).
     Root cause, confirmed by re-reading the actual CSS rather than assumed: `.nono-cell`
     already had `touch-action: none`, but the 1px inter-cell gap, the grid's own
     border/corner, and every `.nono-clue` label had no `touch-action` set at all — a touch
     landing on any of those seams (easy on a fast/imprecise real swipe) was free to start a
     native pan gesture immediately, matching the reported "occasionally," not "always."
     Explicitly unrelated to the separate visualViewport/keyboard scroll saga elsewhere in
     this doc — a genuinely different bug, not touched by this fix and not touching it.
  2. **Global fastest-time-across-all-users stat — built as a NEW `puzzleStats/{puzzleId}`
     collection, not a field on `puzzles/{puzzleId}` as originally sketched.** Real design
     snag found while implementing, not just a stylistic choice: `puzzles/{puzzleId}` is
     the public PUZZLE-DEFINITION collection (rows/cols/clues/title/creatorUid, with a
     `firestore.rules` `create` rule that requires that exact shape) and a built-in puzzle
     (e.g. `heart-5`) never has a doc there at all — writing a `fastestTimeMs`-only doc
     under a built-in's id would both need Firestore to invent a doc for a puzzle it's
     never heard of AND start appearing as a broken, title-less, dimension-less row in
     `fetchLibraryPuzzles`' plain "every doc in `puzzles` is a full community puzzle" scan
     (`src/puzzleLibrary.js`) — silently corrupting the community browse list for a
     built-in that was never supposed to be in it. The new collection is keyed the same
     uniform way as `solvedLibraryPuzzles`/etc. (works for a built-in or community id
     alike) but public-read instead of owning-uid-only, since the value itself is global.
     Still exactly the original constraint: the only writer is the new `recordFastestTime`
     callable (`functions/index.js`), which runs a Firestore transaction and only keeps a
     reported time if it genuinely beats the stored one; `firestore.rules` locks
     `puzzleStats` to public read, no client write in either direction. Doesn't attempt to
     verify the reported time is authentic — this app's timer has always been
     client-reported, same as the personal-best stat `recordPuzzleSolved` already writes —
     what the callable actually guarantees is that the stored value can only ever move via
     this validated read-then-write, never an arbitrary direct write. No backfill for
     puzzles solved before this ships, per the accepted-gap default. Client side:
     `src/puzzleLibrary.js`'s `fetchGlobalFastestTimes`/`submitGlobalFastestTime`, wired
     into `app.js`'s `maybeShowCompletion` (report) and `refreshLibraryList`/
     `renderLibraryList` (a `· 🌍 0:32`-style display alongside the player's own personal
     best, shown only once the puzzle is solved/revealed — matching where the personal
     stat already shows).
     **Deployed and live**, with the project owner's explicit go-ahead: `firebase deploy
     --only firestore:rules` and `firebase deploy --only functions:recordFastestTime`
     both succeeded (`recordFastestTime(us-central1)` created; `puzzleStats` rule
     released to `cloud.firestore`). **CONFIRMED: the project owner solved a puzzle
     for real and saw their own completion correctly write and display a global
     time in their own library.** The one remaining gap — whether a DIFFERENT
     player's library also shows that same global time — was never separately
     tested (would need a second account/device), but the project owner has
     decided to treat this as complete rather than block on arranging that: the
     read path is the same `fetchLibraryPuzzles`/display logic every other
     stat already uses correctly for any viewer, so there's good reason to
     expect it behaves the same way here. **If this turns out to be broken for
     other players later, revisit then — not treated as an open item right now.**
  3. **Drag-on-already-filled-cell bug, fixed in `app.js`.** Confirmed root cause exactly
     as suspected: `pointerdown` used `targetStateFor`'s click-toggle result (clear an
     already-marked cell) to set the WHOLE drag's `paintState`, so starting a Fill-mode
     drag on an already-FILLED cell silently redefined the entire stroke's target to
     UNKNOWN — and since a `dragStep` cell only ever paints when it's already UNKNOWN (the
     existing drag-only-touches-blank-cells rule), every later cell in the drag became a
     same-state no-op. Fixed with a new `modeTargetState()` (the mode's own normal target,
     ignoring what the pressed cell happens to already be) used for `dragging.paintState`,
     while the pressed cell itself still goes through `targetStateFor`'s click semantics
     unchanged — so a plain single click/tap still toggles an already-marked cell back to
     UNKNOWN exactly as before (the TODO's own open question — left as-is, not changed,
     since the fix didn't need to touch it). **Verified directly in browser preview, both
     directions**: pre-filling a cell then dragging Fill-mode from it across blank cells
     now fills every one of them (previously did nothing beyond clearing the start cell);
     the same drag in Mark-empty (X) mode correctly X's the swept cells too. Eraser mode
     re-confirmed unaffected (it already always targets UNKNOWN, same before and after).
  4. **Anchored-clue-number sound — plumbing only, per the project owner's explicit scope.**
     New `anchor` slot in `src/sounds.js`'s `SOUND_FILES` (no audio file added at
     `assets/sounds/anchor.mp3` — deliberately, since the project owner is sourcing that
     file themselves; `assets/sounds/README.md` documents why it's the one sound file
     intentionally left missing). Trigger logic in `app.js`: a new `allAnchoredSnapshot`/
     `anyNewlyAnchored` before/after-the-mutation diff (same shape as the existing
     `allLockedSnapshot`/`anyNewlyTrue` pair `lock` already uses), wired into
     `applyMoveWithSound` only — an unfill can only ever undo an overlap-based deduction,
     never introduce a fresh one, so `applyUnfillWithSound` doesn't need the same check,
     mirroring `lock`/`unlock`'s own asymmetry. Two design calls the TODO flagged as open,
     both resolved and documented inline at their point of decision rather than left to
     accident: (a) a move that anchors several numbers at once plays exactly one shared
     `anchor` sound, not one per number — simpler, and consistent with `lock`/
     `batchCompleteChime` already being exactly-one-sound-per-move; (b) `anchor` is skipped
     on a move that also played `lock` — every remaining number in a freshly-locked line
     trivially finishes "anchored" too, so a second ping on top of the more significant
     lock sound would be redundant noise. **Verified in browser preview against the real
     `anchor.mp3` 404**: a fill move during testing genuinely triggered `playSound('anchor')`
     (visible as a `GET .../anchor.mp3 → 404` network entry, not a thrown exception) —
     confirming the trigger logic itself fires correctly and degrades exactly as designed
     with no file present yet.
  - `node --check` clean on every edited file; all 822 tests pass (unchanged — none of
    these four are covered by the existing pure-module test harness; app.js's pointer/sound
    logic isn't unit-tested today, consistent with this project's "preview-verify app.js,
    unit-test src/ pure modules" pattern elsewhere). **CONFIRMED on the real device by the
    project owner** — items 2 and 4 (global fastest-time, anchored-number sound)
    specifically confirmed; items 1 and 3 (board-drag scroll, drag-on-filled-cell)
    confirmed via no issues experienced during real play.
* **Oversized-clue-number check — done, preview-verified.** Direct report from a real
  30×30 scan: a line's clue showed a value like "1011" — a single run can never be
  longer than the line itself (max 30 here), so any parsed number exceeding the
  line's dimension is a near-certain sign OCR merged two separate clue numbers
  together without catching the comma/space between them (almost certainly "10, 11"
  read as "1011"). New pure function `findOversizedClue(clue, lineLength)`
  (`src/ocrSegment.js`) flags the first clue number exceeding the line's length;
  wired into the scan correction step's existing amber "suspect" flag (`scanUI.js`'s
  `refreshFlag`) alongside the repeated-digit check, checked first since it's a
  certainty rather than a plausibility guess — reuses the established flagging
  pattern rather than a new one, per the standing direction. **Deliberately flags,
  does not auto-split**: guessing where to break a merged number back apart is
  genuinely ambiguous in general ("123" could be "1,23" or "12,3"), and a wrong
  automatic guess would trade an obvious error for a harder-to-notice one — the
  player, already reviewing every line in this step, fixes it by hand. Note: this
  case is technically ALSO already caught by the existing red `--flagged`
  contradiction check (`isLineConsistent` can never place a run longer than the
  line, regardless of fill state) — the new amber check exists to name the specific
  impossible number rather than just generically highlighting the row red, per
  explicit direction to reuse the amber mechanism rather than rely on the red one's
  generic signal. 6 new unit tests added (`test/ocrSegment.test.js`), including the
  exact "1011"/30 real-world case and a clean pass over the real 25×25 ground-truth
  puzzle's clues at length 25 (all well under, none flagged). **Verified end-to-end
  in browser preview against the real 30×30 ground-truth image**
  (`scratch-images/scratch-images-reference-30x30-legible.png`): ran the actual scan
  wizard through OCR to the correction step, typed "1011" into a row field, confirmed
  both the red and amber borders applied with the exact expected tooltip text, then
  corrected it to "10, 11" and confirmed both flags cleared immediately. All 828
  tests pass. Not yet real-device-confirmed. The sum-of-clues-plus-min-gaps
  extension noted below remains a reasonable next step, not required for this to be
  useful on its own:
  - beyond a single number exceeding the line length, the SUM of all of a line's
    clue numbers plus the minimum required gaps between them can also exceed the
    line length even when no single number does — that combination is equally
    impossible and could be flagged the same way. Deferred, not blocking.

* **Four items — done, three preview-verified end-to-end against the real 25x25
  ground-truth image and the live Firestore project; the fourth's data layer is
  unit-tested, its UI branch verified by code/structure only.**
  1. **Fill/X inversion detection — built and preview-verified.** New
     `updateLineHealthWarnings` (`src/scanUI.js`, replacing `updateRecheckWarning`)
     adds a second, much higher threshold (`INVERSION_SUSPECT_FRACTION = 0.9`,
     checked across BOTH axes combined, vs. the existing 0.3-per-axis miscount
     warning) reusing the exact same `--flagged` classes `isLineConsistent`
     already maintains live — no new detection system. When tripped, a new
     `#scan-invert-suspect` banner (styled more assertively than the plain
     miscount warning, since this is a near-certain single-cause diagnosis, not a
     fuzzy pattern read) offers a one-click "Flip fill/X and recheck" fix that
     inverts every FILLED/EMPTY cell in `state.fillMarks` in place (UNKNOWN
     untouched) and re-runs every row/col's check. **Required a real fix along
     the way**: `buildClueRow`'s column check used to capture a one-time snapshot
     of its fill line (`state.fillMarks.map(row => row[i])`, a fresh array, not a
     live reference) — the flip button would have silently had no effect on any
     column's flag state. Fixed by switching every row/col to a `getFillLine()`
     closure re-read on every check, with `input.refreshFlag` exposed so the flip
     handler can force a recheck externally. **Verified directly in browser
     preview**: forcing ~100% of lines flagged (via deliberately-impossible clue
     text) showed the banner and suppressed the lower-priority miscount warning;
     flipping and un-flipping a specific column's clue-vs-fill check 25 times
     (one per column) confirmed 3 columns' flagged state genuinely toggled on
     the flip — proof the getter-based fix works, since a stale snapshot could
     never change no matter how many times the underlying marks are flipped. The
     real ground-truth image's own genuine OCR noise (5 of 50 lines, 10%) stayed
     well under both thresholds, correctly not triggering either warning.
  2. **Scan wizard naming popup — built and verified end-to-end against the live
     Firestore project.** `#scan-step-done` now has the same required-title field
     `draw-step-done` already had (`scan-name-input`/`scan-name-error`);
     `scanBtnPlay` validates it exactly like `drawBtnPlay` before publishing,
     passing the real title to `savePuzzleToLibrary` instead of the old hardcoded
     "Scanned puzzle," and patches `p.name` for this session's own completion
     modal the same way draw's handler already does. Verified live: an empty
     name was rejected with an inline error and did not publish; a real typed
     name ("Verification Dragon") published successfully, started the puzzle
     with a real Firestore-backed id, and showed up as an in-progress row in the
     library the moment the library was reopened (the existing
     open-library auto-save trigger, unaffected by this round).
  3. **Library widen + medal icon — built and preview-verified.** New
     `.modal-card--library` (46rem) widens only the library modal, applied
     alongside `.modal-card--wide` in `index.html` rather than changing that
     shared class itself (also used by How-to-play/Stats, neither of which has
     this row-crowding problem). The old "· best 0:45" text in
     `.library-row__personal-stats` is gone; a new `.library-row__medal` span
     (🥇/🥉, chosen by `solved.bestTimeMs <= globalTimeMs`, defaulting gold when
     no global record exists yet) carries the real time via
     `src/tooltip.js`'s existing `data-tooltip` mechanism instead of row text.
     Verified directly in preview against three real solved puzzles in the live
     account: all three show 🥇 (no global record recorded yet for any of them,
     the documented default), and dispatching a real `mouseenter` on one
     confirmed the tooltip bubble shows "Your best: 0:13" correctly.
  4. **Tiered build-failure line marking — built; tier 1 preview-verified against
     a REAL build failure on the ground-truth image, tier 2's solver-side data
     unit-tested, its UI branch verified by inspection only.** New
     `showBuildFailure` (`src/scanUI.js`) replaces the old generic "couldn't find
     a solution" message. Tier 1 reads the already-live `--flagged` classes
     (no recomputation needed) and names every flagged row/column directly,
     e.g. "Row 15, Row 20, Row 23... don't match their own detected fill pattern
     ... fix those first." Tier 2 needed a real solver change: `contradictionLine`
     (already computed by `solveToFixpoint`, previously discarded) is now
     forwarded through `solvePuzzleFully` (`src/fullSolve.js`) and
     `buildScannedPuzzle` (`src/scanPuzzle.js`) so a genuine cross-line dead-end
     names a specific best-effort line, marked with a new amber
     `.scan-clue-row--build-suspect` class (kept separate from the existing
     `--suspect` class so `refreshFlag`'s live re-check on an unrelated edit
     can't silently clear it). New `scanPuzzle.test.js` case confirms
     `reason:'contradiction'` always comes with a `contradictionLine`. **Tier 1
     hit a REAL case unprompted**: rebuilding with the ground-truth image's own
     genuine (uncorrected) OCR text — not a synthetic test — failed to solve and
     correctly named the 5 actually-wrong lines (Row 15/20/23/24/25), scrolling
     to the first one. **A real bug was found and fixed during this
     verification**: the scroll-to-the-flagged-line call used
     `behavior: 'smooth'`, which measurably failed to complete in this preview
     browser (`scrollTop` stuck at 137px of a needed ~1200px) while
     `behavior: 'instant'` landed correctly — switched both tier's scroll calls
     to instant (no CSS on this page opts into `scroll-behavior: smooth`
     anyway, confirmed by grep), prioritizing reliably landing on the actual
     problem line over an animation. Tier 2's own branch (naming a
     `contradictionLine`-derived line when zero lines are individually flagged)
     could not be triggered through the real UI in the time available — every
     attempt to force it via corrupted clue text also tripped tier 1's own
     (correct, higher-priority) flagged-line check first, since a clue bad
     enough to be globally unsolvable is normally also locally inconsistent with
     its own detected fill line. Left as a real, structurally-simple, but
     not end-to-end-confirmed branch — same "not yet real-device/scenario-
     verified" honesty this file already uses elsewhere.
  - All 829 tests pass (828 pre-existing + 1 new `scanPuzzle.test.js` case for
    `contradictionLine`). `node --check` clean on every touched file. Not
    real-device-confirmed (all four are preview/unit-verified only) — same
    standing caveat as most of this file's other recent rounds.

Current Objective (Focus Area)

* **None queued right now.** See the four-item writeup directly above (fill/X
  inversion detection, scan naming popup, library widen/medal icon, tiered
  build-failure line marking) for what this round covered — all preview/unit-
  verified, none yet real-device-confirmed. Tier 2 of the build-failure item
  (naming a solver-derived line when no single line is individually flagged) is
  real and unit-tested at the data layer but its UI branch has not been
  triggered through a real end-to-end scenario yet — worth a real-device or a
  more deliberately-constructed repro if it's ever picked back up, though it's
  low-risk, structurally identical to the already-verified tier 1 branch. The
  items from the round before that (board-drag scroll bug,
  global fastest-time stat, drag-on-already-filled-cell bug, anchored-number sound) are all fully
  done and CONFIRMED on the real device, including the global fastest-time stat's Cloud
  Function + Firestore rule (`recordFastestTime(us-central1)` created; `puzzleStats` rule
  released). **Timeline clarified by the project owner**: the anchored-number sound's real
  audio file was already dropped in at `assets/sounds/anchor.mp3` (see
  `assets/sounds/README.md`) BEFORE this round's deployment, not as a separate step
  afterward — that's specifically why the real-device confirmation validated it working
  immediately rather than needing a follow-up check. No code changes were needed either
  way, since `src/sounds.js` already pointed there.
  - The rename-popup fix and the hide-a-puzzle feature (bundled together per the
    deploy-batching note) remain done, deployed, and confirmed on the real device — see
    Completed Tasks above. The scan wizard's own size-first restructure remains genuinely
    fixed and confirmed on the real device too, unaffected by anything since.

Everything below this point is the scroll bug's own historical/mechanism
reference material — not active work, kept for context on why direct fixes to
the underlying WebKit issue itself were abandoned in favor of trigger-avoidance
(the same strategy now confirmed working twice — scan wizard, and now rename):

* **Round 4's scroll fix (`healStuckViewportHeight`) has now been tested on the real
  device, including the manual "Force heal viewport height now" button — and the
  real data shows the technique doesn't touch the actual broken variable. This is
  round SIX to fail on this bug class.** Two real captures, before and after
  pressing the manual force-heal button, ~84 seconds apart:
  ```
  BEFORE force-heal (6:16:50 PM):
    visualViewport.height: 969    window.innerHeight: 969   (MATCHED — gap: 0px)
    offsetTop: 79, pageTop: 79, scrollY: 79                 (pan stuck)
    EXCESS: 79px

  AFTER force-heal (6:18:14 PM):
    visualViewport.height: 969    window.innerHeight: 1048  (NOW DIVERGED — gap: 79px)
    offsetTop: 0, pageTop: 0, scrollY: 0                    (pan now corrected)
    EXCESS: 79px                                            (COMPLETELY UNCHANGED)
  ```
  **What this proves**: pressing the force-heal button corrected the pan and pushed
  `window.innerHeight` up to its true full value (1048) — but `visualViewport.height`
  itself never moved, staying frozen at 969, which actually CREATED a fresh 79px gap
  that didn't exist before (heights matched pre-heal). **The visible symptom (EXCESS)
  never changed at all, before or after — exactly 79px in both readings.** This means
  `healStuckViewportHeight`'s `display:none`→reflow→`''` technique recomputes the
  LAYOUT viewport (`window.innerHeight`), not the VISUAL viewport
  (`visualViewport.height`) — the one variable that's actually the root cause. It was
  never touching the real broken value in the first place; whatever correction
  happened to `offsetTop`/`innerHeight` may just be the periodic poll's unrelated
  `correctResidualViewportPan` doing its own (already-confirmed-working) job during
  that ~84-second window, coincidental to the heal button rather than caused by it.
  - **Independent confirmation this is a genuine, non-pan-related overflow now**: the
    scan-modal's own per-element numbers in the "after" reading show
    `offsetHeight=1048` (its real rendered height) against a visible area of only 969
    — `overflowPastViewportBottom=79px`, a real, directly-measured overflow of the
    element's own box past what's actually visible, not an artifact of scroll
    position or pan.
  - **Do not attempt another tweak to `healStuckViewportHeight`'s existing technique**
    (threshold, timing, trigger condition) — the display-toggle/reflow approach itself
    has now been shown not to affect `visualViewport.height` at all on this real
    device, so refining around it won't help. **Research is needed on a genuinely
    different technique that specifically targets `visualViewport.height` itself**,
    not `window.innerHeight` or scroll position — neither of which has ever been the
    actual broken variable once isolated by real data. This is now the SIXTH straight
    round to fail real-device verification on this general bug class (four rounds on
    the original scan-wizard-specific bug, plus rounds 1-3 and now round 4 on this
    app-wide regression) — treat continued guessing with real skepticism; a genuinely
    new research pass on the specific technique is warranted before shipping another
    attempt.
  - **A follow-up single capture (6:24:09 PM, a fresh page load, poll only 81 firings
    in) adds two useful data points**: first, this is the FIRST confirmed capture of
    the classic pan-stuck pattern (`round 4's stuck-height gap: 0px` — heights
    matched, only the pan was off) happening on the MAIN PLAY SCREEN rather than
    inside the scan wizard — every earlier pan-stuck capture happened specifically
    while the scan wizard was open, so this broadens the bug's confirmed scope: it's
    a general keyboard-interaction issue, not specific to the scan wizard's own
    layout. Second, `offsetTop` (74) and `scrollY` (79) didn't quite match this time
    — a small discrepancy not seen in any earlier capture, possibly just a snapshot
    caught mid-correction (the periodic poll running between the two reads) rather
    than a new distinct symptom, but worth Code keeping in mind if it recurs. EXCESS
    was still exactly 79px in this capture too — the visible symptom, unresolved
    regardless of screen/context.

* **Round 5 — genuinely different technique implemented, NOT YET real-device-verified.**
  Per the instruction above, this replaces (not tweaks) round 4's `display:none`→reflow
  technique inside `healStuckViewportHeight` (`app.js`) rather than adjusting its
  threshold/timing again. Reasoning: `visualViewport`'s dimensions are derived from the
  page's `<meta name="viewport">` constraints, recomputed by WebKit when it re-parses
  that tag — not from anything in the DOM layout tree, which is exactly why a layout
  reflow (round 4) could move `window.innerHeight` but structurally could never touch
  `visualViewport.height`. The new technique instead mutates the viewport meta tag's
  `content` attribute (appends `, minimum-scale=1`, forces a layout read, then restores
  the original string) to force a real re-parse. This is a separately, widely documented
  workaround for this WebKit bug class, distinct in mechanism from round 4's trick — not
  a variation of it.
  - **Explicitly unverified**: I (Code) cannot test real iOS Safari from this
    environment — this needs the same real-device check that caught round 4 failing,
    via the existing "Force heal viewport height now" debug button (`?debug=scroll`),
    which already logs `visualViewport.height` before/immediately-after/150ms-later —
    no new debug tooling was needed to check this round the same way round 4 was
    caught. Only smoke-tested on desktop Chromium (runs without throwing, viewport meta
    content is correctly restored, page layout unaffected) — desktop can't reproduce
    the actual bug, so this proves nothing about whether it works on-device.
  - Given six straight failed rounds on this bug class, treat this as a candidate to
    verify, not a confirmed fix, until the project owner reports back real before/after
    numbers the same way round 4's failure was caught.
  - **CORRECTION, and a major finding: the project owner confirmed this capture
    (10:47:05 PM, poll fired 363 times) was taken AFTER pressing the pan-specific
    "Force correct now" button — a deliberate, manual invocation of
    `correctResidualViewportPan`, not just another automatic poll cycle.** This
    is the mechanism-isolation test that's been called for across several
    earlier rounds and never definitively completed. The result: `offsetTop: 79`,
    `pageTop: 79`, `scrollY: 79` — **completely unchanged after manually forcing
    the correction.** This settles the standing "trigger problem vs. mechanism
    problem" question conclusively: **it's a mechanism problem.**
    `window.scrollTo(window.scrollX, window.scrollY)` (the corrective action
    every round since round 1 has relied on for the pan specifically) simply
    does NOT reset a stuck `visualViewport.offsetTop` on this real device —
    not automatically via the poll, not via focus/resize events, and now
    confirmed not even when deliberately, manually invoked. Every round's
    trigger-coverage refinement (rounds 1 through 3) was chasing WHEN to call a
    corrective action that was never actually capable of correcting anything on
    this device in the first place.
  - **This is a SEPARATE finding from round 4/5's height-specific fix** —
    `healStuckViewportHeight` targets a different variable
    (`visualViewport.height`) via a different mechanism (viewport-meta re-parse
    in round 5) and is unaffected by this conclusion; this capture had
    `round 4's stuck-height gap: 0px` (no height divergence present), so it
    doesn't test round 5 at all — see the still-open note below for how to
    actually test that separately.
  - **Do not attempt any further refinement of the `window.scrollTo`-based pan
    correction** — that specific mechanism is now conclusively shown not to
    work on this device, regardless of trigger timing. **The pan needs a
    genuinely different corrective technique**, the same category of fix round
    5 represents for the height variable — worth trying the SAME viewport-meta
    re-parse technique round 5 uses for the pan too, since both symptoms belong
    to the same broader class of WebKit `visualViewport` bug, or researching a
    separate documented technique specifically for resetting a stuck pan if the
    meta-reparse trick turns out to be height-specific.
  - **To actually test round 5's height fix specifically, a capture still needs
    to catch a moment where the stuck-height gap line is NONZERO** (heights
    diverged, not just the pan) — that's the specific state
    `healStuckViewportHeight` is meant to correct, and it remains untested by
    every capture so far.
  - **A fresh onset capture (10:55:26 PM, a new session, only 54 poll firings
    in — "after the cell but before the force correct") caught the bug earlier
    in its timeline than most prior captures**: `visualViewport.height` and
    `window.innerHeight` both read 640 (genuine keyboard-open dimensions,
    matching a real ~408px keyboard height reduction) with `offsetTop: 408`
    consistent — but `activeElement: (none)`, nothing currently focused. This
    is the moment right as/after the keyboard closes but before the layout has
    caught up — a well-timed onset snapshot, distinct from the later
    already-settled "stuck at 79" readings seen elsewhere. Waiting on the
    project owner for the matching "after force correct" reading from this
    same fresh session, to freshly re-confirm (or complicate) the pan-mechanism
    finding directly above with a cleanly-paired before/after from a single
    repro rather than readings pieced together across sessions.
  - **Follow-up pair from the same evening (10:58:12 PM → 10:59:17 PM, "after
    dismissing the keyboard", 34→62 poll firings) — does NOT test round 5,
    only reconfirms the pan-stuck pattern's persistence.** Before pressing
    "Force heal viewport height now": `offsetTop: 79`, `round 4's stuck-height
    gap: 0px` (heights already matched — no divergence present). After
    pressing it, ~65 seconds later: completely unchanged (`offsetTop: 79`,
    gap still `0px`). **This is expected either way, not new evidence against
    round 5** — `healStuckViewportHeight`'s own threshold gate means it
    wouldn't attempt any correction when the gap is already 0, so nothing was
    actually exercised by this test. What's still needed: a capture where the
    height gap itself is nonzero BEFORE pressing force-heal, to actually test
    whether it closes that gap. Every capture collected so far, across every
    session, has caught the pan-stuck (gap: 0) pattern specifically, never the
    height-diverged one round 5 targets — worth trying a longer wait after
    dismissing the keyboard (the one time a height gap was ever observed, it
    appeared roughly 84 seconds after keyboard-close, not immediately), or
    pressing "Force correct now" (the pan-specific button) first and checking
    again afterward, since the one real height-gap sighting came right after
    the pan had already been corrected by something else.
  - **A THIRD attempt (12:15:53 AM → 12:16:40 AM, 342→458 poll firings,
    confirmed "Force heal viewport height now" pressed) landed in the exact
    same non-informative state again** — `offsetTop: 79`, gap `0px` both
    before and after, unchanged. This is now three separate real-device
    attempts in a row that all happened to catch the pan-stuck (gap-already-0)
    state rather than the height-diverged one, despite the project owner
    making a genuine, careful effort each time (including deliberately waiting
    and trying different repro variations). **Given how consistently manual
    timing is missing the window, the more efficient fix at this point is
    tooling, not more manual attempts**: extend the existing auto-captured
    history log (already recording `focusin`/`focusout`/`resize`/`scroll`
    events automatically, no manual tap required) to ALSO auto-log an entry
    the moment `window.innerHeight − visualViewport.height` first crosses the
    round-4/5 threshold (40px) — a purely observational log line, no
    correction attached, just a timestamped record that the height-diverged
    state genuinely occurred during this page load. That would let the
    project owner reproduce the bug normally, wait however long, then check
    the history log after the fact for whether/when a height-divergence entry
    appears, rather than needing to catch it with a live, precisely-timed
    manual snapshot every single time. This doesn't test round 5's fix by
    itself, but it would finally make it possible to reliably CONFIRM the
    height-diverged state is actually occurring and capture its exact timing,
    which is the prerequisite every attempt so far has been missing.

Next Steps (Do Not Start Yet)

* **Item 8 — Photo → puzzle generation. DECIDED: WON'T BE BUILT, not just
  deferred.** Originally added because it seemed conceptually cool, but the
  project owner has since concluded — correctly, on reflection — that it
  would be genuinely difficult to build well (turning an arbitrary photo into
  a recognizable ~15-30-cell binary grid is a hard, open-ended image problem
  with no reliable general solution, only techniques that help *some* photos
  and not others; uniqueness would also be a much harder problem here than it
  was for hand-drawn puzzles, since a thresholded photo has no intentional
  design behind it the way a drawing does), and that even a well-executed
  version would only be occasional novelty use, not something actually used
  regularly. Kept here as a record of the idea and why it was closed, not as
  a live backlog item — do not pick this up without the project owner
  explicitly reopening it.
* Item 9 — remaining scope: richer library browsing only now (search over titles,
  sort options like newest/most-solved, pagination once the library grows) — the
  friends-only/private sharing question is resolved.
* **Possible icon change, low priority — flagged casually by the project owner,
  not urgent ("might have to... at one point").** The current 🏁 checkered-flag
  icon (chosen during the "Nonogram Pro" rebrand round) reads as a racing-game
  icon, not a nonogram/picture-logic one — presumably meant to nod at a
  checkered grid pattern, but doesn't land that way in practice. Worth
  revisiting whenever branding comes up again; no rush, no specific replacement
  requested yet.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function by
  default, with `defaultPhraser`'s old deterministic templates kept as the fallback.
* Firebase project exists (`nonogram-pro-e8a31`). Anonymous Auth + Firestore are in
  active use for stats/pairing and the puzzle library.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Node.js 20→22 runtime bump — done and deployed.
* Firestore security rules: in active use for `users/{uid}/stats/*`, `pairingCodes/*`,
  `puzzles/{puzzleId}`, `users/{uid}/solvedLibraryPuzzles/{puzzleId}`, and
  `users/{uid}/inProgressPuzzles/{puzzleId}`.
* Hint phrasing has an invisible-by-design fallback — "a hint appeared" is not proof
  the LLM call actually succeeded; check console/Cloud Function logs after any Cloud
  Function change.
* Real audio files are in place in `assets/sounds/` — sound effects are done.
* Tesseract.js is loaded lazily from the CDN — its ESM build has no named exports,
  only a default export (`(await import(url)).default`).
* **Item 10's grid/line detection, OCR, and fill-state detection were built and
  repeatedly fixed against real screenshots, not synthetic mockups alone** — prefer
  testing against a real image file over guessing at plausible synthetic pixel values.
* **iOS scroll/touch bugs in this app went through six failed direct-fix rounds
  before the winning strategy turned out to be avoiding the trigger entirely,
  not fixing the underlying WebKit `visualViewport` mechanism.** Confirmed
  working twice now on the real device: the scan wizard's size-first
  restructure, and the library rename popup — both avoid a text input opening
  a keyboard near the bottom of the screen, which is the real common trigger.
  The underlying mechanism itself was never fixed and remains a theoretical
  risk anywhere else a text input could render near the bottom of the screen
  — see the historical section in Current Objective for the full failed-round
  history if this needs revisiting.
* **The toolbar-alignment bug took two misdiagnosed rounds (2-3, chasing size)
  before the project owner's direct correction led to the real cause
  (misalignment via a leaked `margin-top`) in round 4** — a reminder that a
  project owner's plain-language description of a visual bug ("not lined up," not
  "different sizes") is worth taking literally rather than assuming a more
  complex/technical cause.
* `countGridLines` miscounting is understood and mitigated via the known-count
  override (see Completed Tasks) rather than by retuning the underlying heuristic.
* Clue-number legibility on large puzzles — fixed, font floors at `MIN_CLUE_FONT_PX`.
* OCR residual accuracy — accepted as a known limitation per the project owner,
  confirmed twice now; not currently being pursued further.
* Sibling repo `game-hub` (`C:\Users\danmo\game-hub`) is directly accessible to
  Code — the game-hub listing is live at https://dansgamehub.netlify.app/.
