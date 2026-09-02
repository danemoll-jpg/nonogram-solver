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

Current Objective (Focus Area)

* **New feature: an on-screen Undo button, distinct from the existing mistake-
  driven "undo-to-point" flow.** Should undo the single most recent move —
  where "move" already matches this app's existing history-batching unit
  (`Board.setBatch`): if the last action was a single click, undo just that
  cell; if the last action was a drag-paint or a hint/auto-X batch, undo the
  whole batch as one unit, consistent with how undo-to-point already treats
  these. **Repeatable, not one-shot**: pressing it again should step back one
  more move, and again, walking backward through history indefinitely (an undo
  stack, not a single-level undo) — the stated use case is deliberately testing
  a move, seeing it's wrong, and backing out to exactly where things were
  before, without needing to ask for a hint or use "Check my work" to get
  there.
  - **Confirmed with the project owner: undoing a hint-sourced move reverts the
    cells normally (same as any other undo), but the hints-used count for that
    attempt does NOT decrease — it's permanent once a hint has been used, even
    if the resulting move is later undone.** No longer an open question.
  - **Corrected by the project owner — the earlier assumption here was wrong,
    and needs real investigation, not just a UI toggle.** For a scanned
    (import-origin) puzzle, the detected/imported cells form a fixed BASELINE
    that can never be undone past — but any moves the PLAYER makes on top of
    that baseline, after the import, are real moves and should be undoable
    normally, exactly like any other puzzle. It is NOT correct to disable
    Undo entirely for scan-origin puzzles; only undoing back past the
    original imported baseline should be blocked. **This is the same
    baseline-plus-new-moves shape the resumed-saved-progress feature already
    uses** (`initialMarks` seeds a starting state; `resumeElapsedMs`/
    `resumeHintsUsed` track what happened before vs. after resuming) — worth
    modeling scan-origin the same way rather than as a special "no history"
    case.
  - **Real prerequisite to check before Undo can work correctly here**: the
    existing `Board.hasHistory = puzzle.source !== 'scan'` flag (set up for
    the older mistake-checking undo-to-point flow) may currently suppress
    history tracking for scan-origin puzzles ENTIRELY, not just for the
    imported baseline — if so, moves made by the player *after* importing a
    scan aren't actually being recorded in `board.history` at all right now,
    which would need fixing before the new Undo button can work for these
    puzzles at all. Verify directly rather than assuming either way. If
    genuinely nothing is being tracked post-import today, that's a real gap
    to close, not just a matter of un-hiding a button.
  - Where this button lives on-screen is Code's call — no specific placement
    requested, just that it needs to be an always-visible on-screen control,
    not buried in a menu (consistent with this project's general pattern of
    moving frequently-used actions out of the Help dropdown).

* **New feature: highlight the current cell's full row and column while
  interacting with it**, so the player can visually confirm they're on the
  intended row/column before committing a mark — especially useful on large
  puzzles where a misaligned tap/drag is easy to make and hard to notice
  immediately. Should highlight the entire row and column (not just the single
  cell) for whichever cell is currently being pressed/dragged across. Exact
  trigger timing (only while actively pressing/dragging vs. also including a
  brief highlight on tap) and visual styling are left to Code's judgment — no
  specific behavior requested beyond "highlight both the row and column of the
  cell I'm currently on."

* **Escalated: "Save progress" may not actually be saving anything at all —
  the project owner checked and could not find a saved puzzle afterward. A
  much sharper lead has now emerged: the puzzle the project owner was trying
  to save was a SCAN-ORIGIN (imported) puzzle — and the existing
  `saveProgressIfApplicable` gate was deliberately built to skip scan-origin
  puzzles entirely, per this project's own earlier documentation ("skips
  scan-origin/solutionless/complete/untouched boards").** If that gate is
  still in place as originally built, this fully explains the missing save —
  not a wiring bug from the recent button relocation, but the save silently
  no-op'ing by design for exactly this puzzle type. **This is a real, high-
  priority gap, not an edge case**: mid-solve scanning is the core use case
  this whole app was built around (per the project owner's original
  motivation for item 10), so being unable to save progress on a scanned
  puzzle specifically undercuts the app's central purpose.
  - **Fix, now that scan-origin history tracking is being revisited anyway
    (see the Undo-button item above)**: allow saving progress for scan-origin
    puzzles too, using the same grid-cell-state save mechanism already built
    — **confirmed correct and needing no change**: the existing
    `inProgressPuzzles` schema already saves the actual current grid state
    (filled/X cells as a compact string per row) plus elapsed time and hints
    used, NOT a move-by-move history. This already matches the project
    owner's own stated preference — "I would rather have the filled cells
    saved than the button history," consistent with how loading a save file
    normally works in most apps (you get the state, you don't get to undo
    past the point you loaded it from). No schema or save-format change
    needed; the puzzle-type gate is the actual thing to fix.
  - If there turns out to be a genuine technical reason scan-origin puzzles
    specifically can't be saved this way (e.g. no stable Firestore
    `puzzleId` to key the save against, since scanned puzzles aren't library
    documents), that constraint needs to be worked around — a scanned
    puzzle's own detected clues/grid could plausibly serve as a stable-enough
    key, or a locally-generated session ID could be used — rather than simply
    leaving this use case unsupported, given how central it is.
  - **Still verify the click-handler/wiring possibility too, not either/or**:
    even once the scan-origin gate is addressed, separately confirm the
    button's click handler itself still works correctly after its recent
    relocation to the icon-only toolbar control — both issues could
    plausibly be present at once.
  1. **Verify end-to-end, starting from the click itself**: does clicking the
     💾 button actually fire its handler (check via console logging or the
     debugger, not just assumption)? Does `saveInProgressPuzzle` get called
     with the correct arguments? Does the Firestore write actually succeed
     (check the browser console/network tab for errors — a
     `permission-denied` or any other Firestore error would explain a save
     that silently does nothing)?
  2. **Then verify the read/display side**: once a write is confirmed actually
     succeeding, does the library's Incomplete filter correctly find and
     display it? (This part was already suspected as a possible staleness
     issue before this escalation — still worth checking, but only after the
     write side itself is confirmed working, since a write that never
     happened would also explain nothing showing up regardless of the read
     side.)
  3. **Once the underlying save is confirmed genuinely working**, then add the
     confirmation UX originally requested: a small toast/message immediately
     on save, and confidence that the library reliably reflects a just-saved
     state without any staleness. Don't add confirmation UI before the
     underlying save is actually confirmed functional — that would risk
     confirming a save that isn't real.

* **Main scroll bug — BREAKTHROUGH: the project owner has now run a real
  `?debug=scroll` capture that overturns the diagnosis every prior round was
  built on. This is now active, high-priority work — not "still not this
  round's focus" as previously stated.** Full capture:
  ```
  visualViewport.height: 969        window.innerHeight: 1048
  visualViewport.offsetTop: 0       visualViewport.pageTop: 0
  window.scrollY: 0                 document.activeElement: (none)
  Periodic poll: fired 5199 times since page load, last fired just now
  EXCESS (scrollable beyond visible viewport): 79px
  ```
  **What this proves, definitively**: `offsetTop`/`pageTop`/`scrollY` are all
  correctly at 0 — the pan is NOT stuck, and the periodic poll IS confirmed
  actually running (5,199 firings). Every prior round's fix (`window.scrollTo`,
  the event listeners, the periodic poll) was specifically designed to correct
  a nonzero `offsetTop`, and by every measure available, **that correction is
  working exactly as designed.** And yet `EXCESS` is still 79px — because
  `visualViewport.height` (969) and `window.innerHeight` (1048) are two
  genuinely different numbers, an exact 79px gap between the viewport's own
  reported HEIGHT and the window's. **Every previous real-device capture
  happened to show these two values as numerically identical**, so this
  distinction was invisible until now — nobody could tell "pan stuck" apart
  from "height stuck shrunk" because both looked the same in every earlier
  reading.
  - **Corrected diagnosis**: the real, persistent bug is that
    `visualViewport.height` stays reduced — as if a keyboard-sized region is
    still being reserved — even after the keyboard is fully gone, nothing is
    focused, and the pan has already self-corrected to 0. `window.scrollTo`
    (the corrective action every round so far has relied on) can only affect
    scroll *position*, not viewport *height* — it was never capable of fixing
    this, which is exactly why five straight rounds of trigger/polling
    refinement made no visible difference despite each one being verifiably
    executed correctly.
  - **This is a known, if under-documented, class of WebKit/Safari bug**:
    `visualViewport.height` failing to recover to the full available height
    after a keyboard dismiss, independent of pan/scroll state. Worth
    researching documented workarounds for this specific symptom (distinct
    from the pan-reset workarounds already tried) — common approaches for
    this class of issue include briefly focusing and immediately blurring a
    dummy off-screen input to force Safari to recompute its viewport
    metrics, or triggering a layout recalculation via a CSS/DOM nudge:
    Code should research and choose the right approach rather than this
    being prescribed here.
  - **Also worth confirming before building a fix**: is this a permanent
    stuck state for the rest of the session once it happens (matching "it's
    doing the exact same thing" persisting across cancel and navigation from
    earlier rounds), or does `visualViewport.height` ever self-recover on its
    own eventually? A few more `?debug=scroll` readings spaced out over time
    in the same stuck session (no code changes needed, just more data) would
    help confirm this is a permanent-until-fixed state, not something that
    would resolve itself given enough time.
  - **Do not attempt another `window.scrollTo`/pan-based fix for this** — that
    entire approach has now been conclusively shown to be treating the wrong
    variable. Any fix needs to specifically target `visualViewport.height`
    recovery, not scroll position.
  - **A second real capture, taken right at the moment the bug first begins
    (71 poll firings in, scan wizard still open), fills in the missing part
    of the timeline**:
    ```
    visualViewport.height: 969        window.innerHeight: 969  (same!)
    visualViewport.offsetTop: 79      window.scrollY: 79
    Periodic poll: fired 71 times so far
    ```
    **Combined with the earlier (later-in-time) capture, this reveals the full
    sequence**: at onset, the keyboard/scan-modal interaction shrinks BOTH
    `window.innerHeight` and `visualViewport.height` together to the same
    reduced value, alongside a genuine stuck pan (`offsetTop: 79`). Over
    time/navigation, `window.innerHeight` recovers back to its true full value
    (`1048`, seen in the later capture) — likely tied to leaving the scan
    wizard — and the periodic poll successfully corrects the pan back to
    `offsetTop: 0` (**confirming that part of the mechanism genuinely works as
    designed**). But `visualViewport.height` alone never rejoins the recovery
    — it's the one value that stays permanently stuck at the shrunk figure
    even after everything else (height, pan) has returned to normal. This is
    a sharper, complete before/after picture, not just a single stuck reading
    — useful for reproducing the bug deliberately during a fix attempt (open
    the scan wizard, focus a text field to trigger the keyboard, then close
    the wizard and watch `visualViewport.height` specifically to see whether
    it ever rejoins `window.innerHeight` on its own).

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
