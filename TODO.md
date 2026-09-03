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
  deployed and confirmed live via a real solve-and-reopen round trip. **Not built
  this round (deliberately deferred as a nice-to-have): the optional GLOBAL
  fastest-time-across-all-users per puzzle** — would need a callable Cloud Function
  to avoid a gameable client-writable public field.
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

Current Objective (Focus Area)

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

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid;
  the pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's
  grid detection). **Explicitly deprioritized by the project owner** — not a current
  priority, kept here for later rather than dropped. Still open whenever it is picked
  up: is grid size user-adjustable at generation time or fixed per image; slider vs.
  automatic threshold/contrast tuning; reject, flag, or allow non-unique-solution
  puzzles.
* Item 9 — remaining scope: richer library browsing only now (search over titles,
  sort options like newest/most-solved, pagination once the library grows) — the
  friends-only/private sharing question is resolved.

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
* **iOS scroll/touch bugs in this app have now failed real-device verification
  across FIVE rounds** (the original scan-wizard-specific bug took four rounds
  itself; this app-wide regression's rounds 1, 2, and now 3 have all failed
  real-device testing despite passing every local/preview check — round 3's
  periodic poll made literally no observable difference, which is new and
  significant: it points at the corrective action itself possibly not working on
  this device, not just a trigger-coverage gap). **Standing next diagnostic step,
  waiting on the project owner (not this round's active work — see Current
  Objective)**: a manual "force correct now" button already exists in
  `?debug=scroll` from the previous round — the project owner still needs to run
  it (reproduce the stuck-pan state, tap it, observe whether `offsetTop` actually
  changes) before Code writes any more trigger/polling logic for the main bug.
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
