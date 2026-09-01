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

Current Objective (Focus Area)

* **Scroll bug — fix implemented (`app.js`, `correctResidualViewportPan`), NOT YET
  VERIFIED ON A REAL DEVICE.** Per this bug class's history (failed real-device
  verification multiple times despite passing every local check), do not consider
  this done until confirmed on the actual iPhone with `?debug=scroll`: focus
  `#scan-known-rows-input` (or any text input), dismiss the keyboard, and confirm
  `visualViewport.offsetTop` returns to 0 shortly after (the history log's
  "focusout" and following "visualViewport resize" lines should show it settle at
  0, not stay stuck like the pre-fix 79px repro below). The fix: on `focusout` of a
  text input (100ms delay) and on every `visualViewport` `resize` (150ms debounce),
  if `offsetTop` is nonzero and no text input is currently focused, issue a
  corrective no-op-looking `window.scrollTo(window.scrollX, window.scrollY)` —
  deliberately doesn't touch `fitBoardToViewport`'s sizing math, per the root-cause
  finding below that it was never the problem.

  Root cause (confirmed via real on-device diagnostic data before this fix). Real
  `?debug=scroll` history from the
  project owner's device, timestamped through an actual keyboard open/close cycle
  on `#scan-known-rows-input`:
  ```
  2:50:57 PM — focusin — vv.height=1048 vv.offsetTop=0
  2:50:57 PM — resize (keyboard opens) Δ-408px — vv.height=640 vv.offsetTop=0
  2:50:57 PM — scroll/pan — vv.height=640 vv.offsetTop=408
  2:51:00 PM — resize (keyboard closes) Δ+329px — vv.height=969 vv.offsetTop=79
  2:51:00 PM — scroll/pan — vv.height=969 vv.offsetTop=79
  2:51:01 PM — focusout — vv.height=969 vv.offsetTop=79 active=(none)
  ```
  Live snapshot one second after focusout: `visualViewport.offsetTop: 79`,
  `document.activeElement: (none)` (keyboard genuinely closed, nothing focused),
  and the tool's own "EXCESS (scrollable beyond visible viewport)" reads exactly
  **79px** — matching `offsetTop` precisely. **Confirmed: this is not extra
  content, not a sizing bug, and not something `handleViewportResize`'s
  recompute logic is getting wrong** — the board/page content itself is the
  correct size throughout. It's purely that **iOS's visual-viewport pan (used to
  keep a focused input clear of the on-screen keyboard) doesn't fully reset back
  to `offsetTop: 0` once the keyboard closes** — it opened with a 408px pan and
  closed with only 329px of that reversed, leaving a stuck 79px residual pan that
  the app currently has no logic to detect or correct. This is a known (if
  under-documented) iOS Safari quirk, not specific to this app's own CSS/JS sizing.
  See the fix summary at the top of this item for what's now implemented and
  what's still needed (real-device verification) before this can be called done.

* **New: UI/branding polish round.**
  1. **Tighten the toolbar** — rename "Stats & pairing" to just "Stats"; move
     Auto-check into the Help menu (off the main toolbar); change the Help
     button/dropdown trigger to a plain "?" icon instead of a text "Help ▾" button.
  2. **Rebrand**: app name becomes "Nonogram Pro" (matching the live domain,
     nonogrampro.netlify.app); remove the current tagline/description text
     ("Pick a puzzle, fill it in...") from the main page entirely — see item 4
     below for where that description text should actually go instead. Replace the
     current puzzle-piece icon with something that actually reads as a nonogram
     (e.g. a small filled-grid/checkerboard-pattern icon) — specific icon choice is
     Code's call unless the project owner has a preference.
  3. **Bigger/more visible X marks** on the board — current rendering isn't
     obvious enough to read at a glance.
  4. **List this game in the game-hub repo** (`C:\Users\danmo\game-hub`, a sibling
     project Code can access directly — confirmed, not a cross-repo handoff
     blocker). Match that repo's existing listing style/pattern. **This is where
     the tagline/description text removed from the main nonogram page in item 2
     should end up** — the game-hub listing is the more appropriate place for a
     "what is this game" blurb than cluttering the actual play screen.
  5. **"Clear" becomes "Restart"** — not just a rename: restarting should reset
     this attempt's hint-used count and elapsed time, not only clear the board's
     marks. Today's Clear-all only resets marks/history; a genuine restart should
     put the puzzle back to the exact state it was in when first loaded, stats
     included, as if starting the attempt over from scratch. Keep the existing
     confirm-before-acting behavior (per the earlier `window.confirm`-reliability
     fix — reuse the in-page confirm dialog, not a native one).
  6. **New "All games" button, returning to the game-hub, with a confirmation
     dialog before navigating away** (same in-page confirm pattern as the rest of
     this app, not a native `confirm()`).

* **New: saved/incomplete puzzle progress — a real feature, not a quick add, fully
  scoped now including save cadence.** The project owner asked directly how
  complicated this is: moderate, not trivial, but it reuses existing groundwork
  rather than starting from scratch (the same board-seeding mechanism already built
  for scanned puzzles' `initialMarks` → `Board.fromGrid` can seed a resumed board
  from saved progress the same way). Scope:
  - New per-user record of in-progress puzzle state (e.g.
    `users/{uid}/inProgressPuzzles/{puzzleId}`): the current fill/X grid state,
    elapsed time so far, hints used so far, last-updated timestamp.
  - New "Incomplete" category in the library's filters, alongside the existing
    Solved/Unsolved/size filters — showing puzzles with saved in-progress state.
  - Selecting an "Incomplete" library entry resumes play from the saved state
    (board pre-seeded, stats continuing from where they left off) rather than
    starting blank.
  - **Save cadence, confirmed with the project owner: explicit, in-app-triggered
    saves only — not every move, and not a browser-level "leaving" signal.**
    Progress saves on: (1) an explicit "Save" action/button the player can trigger
    anytime; (2) automatically when the player switches to a different puzzle;
    (3) automatically when the player exits the current puzzle back to the
    library. All three are deliberate in-app navigation/UI events Code can hook
    directly and reliably — no need for browser tab-close/backgrounding
    detection, which is notoriously unreliable on mobile Safari and was the main
    risk with a pure "save on leave" approach. This keeps Firestore writes low
    (no per-move writes) while still saving at every point progress could
    otherwise be lost within the app's own flow.

* **New: live running count of cells painted while drag-filling.** While the
  player is click-and-dragging to fill a run of cells (the existing drag-paint
  behavior, which already only paints blank cells per the earlier drag-overwrite
  fix), show a live, continuously-updating count of how many cells have been
  painted in the current drag stroke — helps the player match a clue's run length
  by watching the count as they drag, rather than counting cells by eye
  afterward. Scope notes:
  - Primarily useful for Fill-mode drags specifically (since a run length maps to
    a clue number); worth also showing the same live count for Mark-empty (X)
    drags for consistency, but that's the lower-priority half if effort needs to
    be split.
  - Display location is a UI design choice, not specified — likely most useful
    right at/near the drag point (a small floating badge following the
    cursor/touch position) rather than a fixed location elsewhere on screen,
    since the whole point is glanceable feedback without looking away from where
    you're dragging. Code's call on the exact placement/styling.
  - Should disappear/reset once the drag ends (pointerup) — this is transient
    in-drag feedback, not a persistent UI element.

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
  `puzzles/{puzzleId}`, and `users/{uid}/solvedLibraryPuzzles/{puzzleId}`.
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
  multiple times.** The latest round narrowed the repro to specifically
  keyboard-triggered, persisting afterward, and upgraded the diagnostic tool to
  capture the iOS visual-viewport pan amount specifically. Use `?debug=scroll` for
  real on-device data — remember it requires tapping an on-screen button (bottom-
  anchored) to open its report panel, which the project owner initially missed.
* `countGridLines` miscounting is understood and mitigated via the known-count
  override (see Completed Tasks) rather than by retuning the underlying heuristic.
* Clue-number legibility on large puzzles — fixed, font floors at `MIN_CLUE_FONT_PX`.
* OCR residual accuracy — accepted as a known limitation per the project owner,
  confirmed twice now; not currently being pursued further.
* Sibling repo `game-hub` (`C:\Users\danmo\game-hub`) is directly accessible to
  Code — confirmed by the project owner, not a cross-repo handoff blocker for the
  new game-hub listing item above.
