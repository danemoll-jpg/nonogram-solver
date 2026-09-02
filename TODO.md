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

Current Objective (Focus Area)

* **Scroll bug — round 3's periodic poll has NOW ALSO been tested on the real device
  and confirmed to make no difference at all: "nothing has changed, it is doing the
  exact same thing."** This is a significant new finding, not just another failed
  round the same way as before. Round 3 specifically eliminated the trigger-coverage
  gap (round 2's diagnosis) by polling unconditionally every 400ms regardless of what
  event, if any, just fired — and it still doesn't fix the real device. **That
  strongly suggests the problem is no longer about WHEN the correction runs, but
  whether the correction itself (`window.scrollTo`) actually does anything on this
  real device/iOS version at all.** Nothing in this project's history has directly
  confirmed that the `window.scrollTo` corrective action ever successfully resets
  `visualViewport.offsetTop` back to 0 when it fires on real hardware — every round
  so far has only confirmed the trigger logic runs (or doesn't), never isolated
  whether the correction itself is effective once invoked.
  - **Required next step before writing any more trigger/polling logic**: isolate
    mechanism from trigger. Add a manual "force correct now" button to the
    `?debug=scroll` panel that calls the exact same correction code
    (`correctResidualViewportPan`, or just `window.scrollTo(window.scrollX,
    window.scrollY)` directly) on demand, so the project owner can reproduce the
    stuck-pan state, tap the button, and directly observe whether `offsetTop`
    actually changes at all. If it does NOT change even when manually and
    deliberately invoked, that confirms the corrective action itself doesn't work on
    this device — a different problem than trigger coverage, and round 3's polling
    (or any future polling/event tuning) would never have fixed it regardless of how
    often or reliably it ran. If manually forcing it DOES work, that's a different,
    more surprising finding (something is preventing the automatic poll/listeners
    from actually firing/executing at all, e.g. the interval not starting, being
    cleared, or running in a context where it silently no-ops) and points back at
    the trigger/wiring side instead.
  - Also worth directly confirming the poll is even running at all (e.g. a visible
    counter or last-poll-timestamp in the debug panel) as a cheap complementary
    check alongside the manual-force test above.

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
  this device, not just a trigger-coverage gap). Use `?debug=scroll` for any
  further verification, and see Current Objective for the required
  mechanism-vs-trigger isolation step before any further trigger/polling changes.
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
