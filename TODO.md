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
  from the player's own scan session; public read (see below — confirmed as the
  right model, no separate friends-only tier needed); required title with
  later creator-only editing; library-sourced puzzles behave as real authored
  puzzles (full history, counts toward stats).
* **Confirmed with the project owner: fully public visibility (already built) is the
  right model — no separate friends-only/private sharing tier is needed.** This
  resolves the "friends-only/private sharing" question that was previously listed
  as open remaining scope under item 9 — it's now closed, not deferred.
* **UI/branding polish round — done, verified end-to-end in browser preview against
  real Firestore/Netlify-hub data.** Toolbar tightened (Stats & pairing → Stats,
  Auto-check moved into the Help menu as a checkbox item that deliberately doesn't
  close the menu on toggle, Help trigger → a plain "?" icon); rebrand to "Nonogram
  Pro" (title, header, favicon — new 🏁 checkered-flag icon replacing the puzzle
  piece) with the old play-screen tagline removed and moved into a new listing in
  the game-hub repo (`C:\Users\danmo\game-hub\games.js`, live at
  https://dansgamehub.netlify.app/ — confirmed real; an earlier guessed URL,
  dansgameroom.netlify.app, was wrong and caught before shipping); bigger/bolder X
  marks (`.nono-cell.empty::after`: 0.35→0.62 opacity, 0.53×→0.68× cell-size, added
  font-weight 700); "Clear all" renamed to "Restart" with real hint-count/elapsed-
  time reset (already implicit in a fresh `startPuzzle` call, made explicit for the
  new resumed-puzzle case below); new "All games" toolbar-menu item navigating to
  the hub with the same in-page confirm-modal pattern as every other destructive
  action here.
* **Saved/incomplete puzzle progress — done, deployed, verified end-to-end
  (real Firestore save → library "Incomplete" filter → Resume → elapsed time
  correctly continuing from the saved baseline, not resetting).**
  `src/puzzleLibrary.js` (saveInProgressPuzzle/loadInProgressPuzzle/
  fetchInProgressPuzzles/deleteInProgressPuzzle) backs a new
  `users/{uid}/inProgressPuzzles/{puzzleId}` collection — grid state serialized as
  one compact string per row (Firestore can't store a nested array-of-arrays
  directly), elapsedMs, hintsUsed. Firestore rules deployed (owning-uid-only, same
  pattern as solvedLibraryPuzzles). Save cadence as scoped: an explicit "Save
  progress" action (see Current Objective below — currently a Help-menu item, but
  this needs to move to a main-toolbar button per the project owner's later
  clarification), plus auto-save on opening the library, picking a different
  library puzzle, or finishing the scan wizard — all funnel through one
  `saveProgressIfApplicable()` gate (skips scan-origin/solutionless/complete/
  untouched boards). Resuming merges the saved grid onto a freshly-solved base
  puzzle as `initialMarks` + `resumeElapsedMs`/`resumeHintsUsed`, which
  `startPuzzle`/`computeCompletionStats` fold in as a baseline — real board history
  only ever covers the current session, so this is what lets elapsed time and
  hints-used keep counting from before a resume rather than silently losing them.
  Restart clears any stale save for the puzzle regardless of resumed status. A real
  edge case was caught live in testing and fixed: the Incomplete filter needed to
  explicitly exclude already-solved puzzles too (a puzzle solved in a session
  before this feature existed could carry a stray in-progress save from later
  re-opening it), not just rely on the row-render logic's own solved-takes-priority
  check.
* **Live running count of cells painted while drag-filling — done, verified**
  (floating gold badge, follows the pointer, increments per genuine paint — not
  per cell merely swept over — hides on pointerup). Fill- and X-mode both
  supported (any drag whose paint state isn't a clear-to-blank click shows it).
* **Scroll bug, round 1 fix — implemented and deployed, but this shipped BEFORE
  two follow-up refinements the project owner asked for after further real-device
  testing; see Current Objective below for what's still outstanding on top of
  this.** Root cause (confirmed via real on-device `?debug=scroll` data before
  this fix): iOS's visual-viewport pan (used to keep a focused input clear of the
  on-screen keyboard) doesn't fully reset back to `offsetTop: 0` once the keyboard
  closes.
  ```
  2:50:57 PM — focusin — vv.height=1048 vv.offsetTop=0
  2:50:57 PM — resize (keyboard opens) Δ-408px — vv.height=640 vv.offsetTop=0
  2:50:57 PM — scroll/pan — vv.height=640 vv.offsetTop=408
  2:51:00 PM — resize (keyboard closes) Δ+329px — vv.height=969 vv.offsetTop=79
  2:51:00 PM — scroll/pan — vv.height=969 vv.offsetTop=79
  2:51:01 PM — focusout — vv.height=969 vv.offsetTop=79 active=(none)
  ```
  Live snapshot one second after focusout: `offsetTop: 79`, nothing focused,
  matching the tool's own "EXCESS scrollable" reading of exactly 79px. Confirmed
  not a sizing bug — `fitBoardToViewport`'s math was untouched. Fix implemented in
  `app.js` (`correctResidualViewportPan`): on `focusout` of a text input (100ms
  delay) and on every `visualViewport` `resize` (150ms debounce), if `offsetTop`
  is nonzero **and no text input is currently focused**, issue a corrective
  no-op-looking `window.scrollTo(window.scrollX, window.scrollY)` to force iOS to
  re-zero the pan.

Current Objective (Focus Area)

* **Three follow-ups on the scroll fix + one placement fix, all confirmed with the
  project owner but shipped AFTER the round-1 fix above — Code should treat these
  as still outstanding, not already covered by round 1.**

  1. **Broaden the scroll-fix trigger: a second real capture shows the residual
     pan can settle to a nonzero value WHILE an input is still actively focused**,
     not only after `focusout` — round 1's fix explicitly requires "no text input
     currently focused" before correcting, so this case isn't covered yet.
     ```
     4:02:53 PM — focusin #scan-known-rows-input — offsetTop=0
     4:02:53 PM — resize (keyboard opens) Δ-408px — offsetTop=0
     4:02:53 PM — scroll/pan — offsetTop=408
     4:02:57 PM — focusout #scan-known-rows-input — offsetTop=408 (unchanged)
     4:02:57 PM — focusin #scan-known-cols-input — offsetTop=408 (unchanged,
                  keyboard stays open switching fields)
     4:03:03 PM — resize (likely keyboard) Δ+329px — offsetTop=79 — **active
                  STILL #scan-known-cols-input, not focusout yet**
     4:03:03 PM — scroll/pan — offsetTop=79 — still focused
     4:03:06 PM — focusout #scan-known-cols-input — offsetTop=79 (unchanged)
     ```
     The project owner directly confirmed the visible symptom now shows up while
     the keyboard is still up, not only after it closes ("the white space is
     there and stays there"). **Correcting the pan while a field is genuinely
     still focused would break the input's visibility above the keyboard**, so
     this isn't "just remove the no-focus condition" — the real fix is detecting
     when the *current* `offsetTop` no longer matches what the *actual, current*
     keyboard state calls for (e.g. comparing against the expected pan implied by
     the current `visualViewport.height` deficit) and correcting to that expected
     value even while focused, rather than only fully re-zeroing once nothing is
     focused. Needs real thought on the right comparison, not a blind widen of
     the existing condition.
  2. **New, related symptom: the persistent bottom explain/hint panel
     (`.explain-panel`) disappears while this stuck-pan state is active** —
     confirmed by the project owner. Almost certainly the same class of issue as
     the earlier diagnostic-button-visibility fix (a `position: fixed` element
     getting pushed out of the visible area by the stuck pan), which was fixed
     for the diagnostic button/panel specifically by counter-translating them
     against `visualViewport.offsetTop` — that same defensive treatment was never
     applied to the real player-facing `.explain-panel`. **Apply it now, as a
     safety net alongside (not instead of) the main pan-correction fix** — the
     main fix should prevent the stuck pan from occurring at all, but the panel
     shouldn't be vulnerable to disappearing even if some residual pan slips
     through before the main fix catches it.
  3. **"Save progress" needs to move from the Help menu to its own main-toolbar
     button.** Confirmed by the project owner after round 1 shipped it under
     Help — the same "this isn't really a help action" reasoning already applied
     to moving Library and Stats out of Help applies here too, and the toolbar
     tightening from the UI polish round frees up the room for it.

  **Also still outstanding from round 1 itself, unresolved regardless of the
  above**: real-device verification. Per this bug class's history (failed
  real-device verification multiple times despite passing every local check), do
  not consider ANY of this — round 1's fix or the three follow-ups above — done
  until confirmed on the actual iPhone with `?debug=scroll`: focus a text input,
  dismiss the keyboard (and separately, try switching between two inputs without
  fully dismissing, per follow-up #1's repro), and confirm `offsetTop` settles to
  the value it actually should have at each point, not a stuck stale one.

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
  friends-only/private sharing question is resolved (see Completed Tasks: fully
  public is the confirmed model, nothing further needed there).

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
  multiple times.** Two real diagnostic captures have now been collected — see
  Completed Tasks (round 1) and Current Objective (the second, broader capture) —
  use `?debug=scroll` for any further verification, remembering it requires
  tapping an on-screen button (bottom-anchored) to open its report panel.
* `countGridLines` miscounting is understood and mitigated via the known-count
  override (see Completed Tasks) rather than by retuning the underlying heuristic.
* Clue-number legibility on large puzzles — fixed, font floors at `MIN_CLUE_FONT_PX`.
* OCR residual accuracy — accepted as a known limitation per the project owner,
  confirmed twice now; not currently being pursued further.
* Sibling repo `game-hub` (`C:\Users\danmo\game-hub`) is directly accessible to
  Code — the game-hub listing (Completed Tasks) is live at
  https://dansgamehub.netlify.app/.
