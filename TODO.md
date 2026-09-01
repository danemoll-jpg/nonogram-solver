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
  "Save progress" button (now on the main toolbar, see round-2 below), plus
  auto-save on opening the library, picking a different library puzzle, or
  finishing the scan wizard, all through one `saveProgressIfApplicable()` gate.
  Resuming merges the saved grid as `initialMarks` + `resumeElapsedMs`/
  `resumeHintsUsed`. Restart clears any stale save regardless of resumed status.
  Incomplete filter explicitly excludes already-solved puzzles (a real edge case
  caught live in testing).
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
* **Scroll bug, round 2 — three follow-ups implemented and deployed, PLUS a
  real-device verification round that shows the fix still does NOT resolve the
  bug. See Current Objective below for the new diagnosis.**
  1. Broadened trigger: `correctResidualViewportPan` now checks the focused
     input's real `getBoundingClientRect()` against the current pan/height when a
     field IS focused, correcting via `scrollIntoView` rather than bailing out
     unconditionally; added a `focusin` listener alongside `focusout` to catch a
     direct field-to-field switch.
  2. `.explain-panel` given the same defensive counter-translate-against-
     `offsetTop` treatment the diagnostic button already had
     (`pinExplainPanelToVisualViewport`), applied unconditionally.
  3. "Save progress" moved to its own toolbar button (`#btn-save-progress`,
     icon-only 💾), removed from the Help dropdown.
  4. Unrelated bonus fix found while placing the new button: a real toolbar
     button height mismatch, root-caused to a Chromium quirk where a color-emoji
     glyph's own font metrics can inflate a text button's rendered height past
     its `line-height` — fixed via an explicit `.btn { height: 2.2rem }` with flex
     centering. **The project owner's real-device screenshot shows the visual
     misalignment is still present** — see round 4 below (turned out to be a
     misdiagnosis: not a size issue at all).
* **Scroll bug, round 3 — implemented, awaiting real-device verification.** See
  Current Objective above for full detail: a periodic
  `setInterval(correctResidualViewportPan, 400)` idle re-check, replacing reliance
  on the event-only approach alone (events are kept too, as a fast path).
* **Toolbar alignment, round 3 — superseded by round 4 (below); its own fix
  (`-webkit-appearance: none` on `.btn`) turned out not to be the actual cause,
  though it's harmless and left in place.** Also added the `?debug=scroll`
  toolbar-geometry report, which remains useful diagnostic infrastructure.
* **Toolbar alignment, round 4 — the REAL bug, found and fixed via direct
  measurement, confirmed in preview (see Current Objective above for full
  detail).** The project owner correctly identified that rounds 2-3 were solving
  the wrong problem ("It isn't size... the buttons aren't lined up"). Root cause:
  `.btn + .btn { margin-top: 0.5rem }` — a rule meant for vertical button stacks
  elsewhere — was leaking into `.library-entry-group`'s horizontal row, the one
  consumer that never got the same `{ margin-top: 0 }` reset every other
  `.btn`-group in the codebase already had. Fixed, plus gave `.mode-toggle` an
  explicit height matching `.btn`'s so the Fill/Mark-empty pill lines up too.
  Verified by remeasuring `rect.top`/`rect.bottom` directly (not just height) —
  every first-row toolbar button now reports identical coordinates. Still wants a
  real-device screenshot to fully close out, per this bug family's track record.

Current Objective (Focus Area)

* **Toolbar button alignment — round 4 found and fixed the REAL bug, confirmed by direct
  measurement (not by guessing and checking a screenshot).** The project owner correctly
  called out that rounds 2 and 3 were solving the wrong problem: "It isn't size. The buttons
  aren't lined up" — Puzzle library sat visibly higher than Stats/the save icon, and the
  Fill/Mark-empty toggle sat higher than the save icon too. Checking `getBoundingClientRect().top`
  for every toolbar button (not just height, which rounds 2-3 had already confirmed identical)
  immediately showed it: `.btn + .btn { margin-top: 0.5rem }` (`styles.css`) — a rule that
  exists for VERTICAL button stacks elsewhere (mistake popup, modal actions, library rows) —
  was leaking into `.library-entry-group`'s horizontal row. Every other consumer of that base
  rule already resets it (`.mistake-popup__actions .btn`, `.modal-card__actions .btn`,
  `.library-row .btn`, all `{ margin-top: 0 }`); `.library-entry-group` was simply the one place
  that reset was missing, so "Stats" and the save icon (each directly following another `.btn`)
  sat 8px lower than "Puzzle library". Fixed the same way as every other consumer:
  `.library-entry-group .btn { margin-top: 0 }`, placed after `.btn + .btn` in source order so
  the equal-specificity cascade tie-break lands correctly (a first attempt placed it earlier in
  the file and silently lost the tie — worth remembering if this pattern comes up again).
  Also gave `.mode-toggle` (the Fill/Mark-empty pill) an explicit `height: 2.2rem` matching
  `.btn`'s own fixed height, and made `.mode-btn` fill/center within it — it had no fixed height
  of its own before, sizing off padding instead, which left it a few px off from every
  `.btn`-based sibling once the margin leak was fixed and exposed it. **Verified by direct
  remeasurement in preview**: every button on the toolbar's first row now reports an identical
  `rect.top`/`rect.bottom` (130/165.2 in that preview run) — not just matching heights, actual
  matching Y-position. All 812 tests still pass; Cancel/Confirm and other `.btn + .btn` vertical
  stacks (restart confirm modal, checked directly) are unaffected. Round 3's
  `-webkit-appearance: none` addition to `.btn` and the `?debug=scroll` toolbar-geometry report
  are both left in place (harmless, and the geometry report is still generally useful
  diagnostic infrastructure) but neither turned out to be the actual fix — see Completed Tasks
  for the corrected record. **Still worth a real-device screenshot to confirm**, since every
  round in this whole bug family has had at least one surprise the preview didn't catch, but
  this is the first round backed by an actual matching-coordinates measurement rather than an
  eyeballed comparison or an untested theory.

* **Scroll bug — round 3 implemented, awaiting real-device verification** (round 2 passed every
  local/preview check and still failed on-device, so this isn't being called resolved yet
  either). Added a periodic idle re-check — `setInterval(correctResidualViewportPan, 400)`
  (`app.js`, right after the existing `focusout`/`focusin`/`resize` listeners, which are kept
  as-is). Directly implements round 2's own diagnosis: the stuck-pan repro's "nothing focused,
  offsetTop stuck nonzero" state is exactly what `correctResidualViewportPan`'s existing
  unconditional `scrollTo` branch already handles correctly — it just never got invoked again
  because no covered event (`focusout`/`focusin`/`resize`) fired during the 54+ second stuck
  window. The function is cheap (a couple of property reads, early-returns when `offsetTop === 0`,
  the common case) so polling doesn't chase individual triggers anymore — it self-corrects
  regardless of what transition caused the stuck state.
  - **Next step is entirely on-device**: load `?debug=scroll` on the real iPhone, reproduce the
    stuck-pan repro (open keyboard, close it, wait), and reopen the panel/tap the diagnostic
    button afterward — the history log should show the periodic poll catching and correcting the
    pan within ~400ms of it going stale. Do not report this fix as resolved without that capture.

* **Historical: round 2's fix, tested on the real device with `?debug=scroll`,
  did NOT resolve the scroll bug** — the negative evidence and diagnosis that
  round 3 above was built from. Kept for the full history/reasoning trail.
  Full sequence captured by the project owner:
  ```
  5:15:23 PM — baseline — offsetTop=0, EXCESS=0px
  5:17:30 PM — keyboard open — offsetTop=408 (expected, normal pan)
  5:18:55 PM — "again" — offsetTop=79, active=(none) — STUCK
  5:19:49 PM — after cancelling the scan wizard, 54s later — offsetTop STILL 79
  5:20:32 PM — back on the main play screen — offsetTop STILL ~79 (74 reported)
  ```
  **New diagnosis, directly explaining why round 2's fix didn't catch this**: the
  fix only re-checks and corrects on two specific events — `focusout` of a text
  input, and `visualViewport` `resize`. Once the pan gets stuck and **neither of
  those events fires again**, nothing in the current implementation ever
  re-corrects it — not closing the scan wizard modal, not navigating back to the
  main play screen. Both of those transitions happened in this repro with the pan
  still stuck 79px off, and neither is a trigger the fix listens for, so the stuck
  state simply carries through untouched. This is a coverage gap in *which events
  trigger a check*, not necessarily a flaw in the correction logic itself once it
  does run.
  - **Also worth investigating**: whether round 2's more careful "is the focused
    input actually visible" logic somehow interferes with round 1's simpler
    "nothing focused → just correct" path — round 1's original mechanism was
    already designed to handle exactly this case (nonzero `offsetTop`, nothing
    focused) via a blind `window.scrollTo` on `resize`/`focusout`, and it's not
    obvious from this data alone why that simpler path also isn't firing here
    (no `resize` or `focusout` occurred in this repro after the pan got stuck,
    which may fully explain it — but worth Code confirming that's actually the
    reason rather than assuming).
  - **Recommended direction**: don't add more specific event listeners one at a
    time (that's the pattern that's produced round 1 and round 2, each covering
    one more specific trigger but still missing others). Given how persistent
    this stuck state has proven (over a minute, across a modal close and a full
    screen navigation), **a periodic/idle re-check is worth strong consideration
    over continuing to chase individual trigger events** — e.g. a low-frequency
    interval (a few times a second, or on `requestAnimationFrame` while idle)
    that checks "is `offsetTop` nonzero and nothing focused" and self-corrects
    whenever true, regardless of what caused that state or what event (if any)
    just fired. This trades a small amount of constant background work for
    actually closing the gap this event-driven approach keeps missing.
  - **The `.explain-panel` defensive fix appears to be working** in this same
    capture — its `rect.top`/`rect.bottom` stayed within the visible viewport
    bounds (`897`–`969`, matching a 969px-tall viewport) in both the
    "after cancelling" and "main screen" readings, rather than being pushed
    off-screen the way it reportedly was before. Worth a direct visual
    confirmation (not just geometric inference from the diagnostic data) next
    time, but this looks like a real, working partial fix even while the main
    pan-correction issue remains unresolved.

* **Historical: round 2's toolbar button height/alignment fix did not resolve the
  visual issue on the real device either** — the evidence round 3 above was built
  from. Kept for the full history/reasoning trail. The project owner's screenshot (after round
  2's `.btn { height: 2.2rem }` fix) still shows "Puzzle library" visibly
  taller/rounder than its neighboring buttons (Stats, the save icon, the Fill/
  Mark-empty toggle, mute). The desktop-preview measurement Code used to confirm
  this fix (`35.2px` for all five buttons) may not hold on the real device/browser
  — re-measure directly on the actual iPhone rather than trusting the earlier
  preview numbers, and check whether "Puzzle library" specifically (which has
  both an emoji AND multi-word text, unlike the icon-only buttons) has some
  other size-affecting property (e.g. padding, min-width, or the pill/rounded
  styling itself) that the emoji-font-metrics fix didn't address.

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
  across FOUR rounds** (the original scan-wizard-specific bug took four rounds
  itself; this app-wide regression's round 1 and now round 2 have both failed
  real-device testing despite passing every local/preview check). The current
  leading theory is a coverage gap in which *events* trigger a re-check, not a
  flaw in the correction logic itself — see Current Objective's recommendation to
  consider a periodic/idle check instead of chasing individual trigger events one
  at a time.
* `countGridLines` miscounting is understood and mitigated via the known-count
  override (see Completed Tasks) rather than by retuning the underlying heuristic.
* Clue-number legibility on large puzzles — fixed, font floors at `MIN_CLUE_FONT_PX`.
* OCR residual accuracy — accepted as a known limitation per the project owner,
  confirmed twice now; not currently being pursued further.
* Sibling repo `game-hub` (`C:\Users\danmo\game-hub`) is directly accessible to
  Code — the game-hub listing is live at https://dansgamehub.netlify.app/.
