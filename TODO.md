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

* **Scroll bug: escalating past another blind fix attempt — and the diagnostic tool
  itself needs attention first.** Three consecutive rounds (gating fix, then a
  structural permanent-lock fix) have each looked sound and passed everything this
  project's own tooling can verify, then failed on the real device anyway — a clear
  sign the verification tooling itself cannot reproduce whatever's actually happening.
  **The project owner tried `?debug=scroll` on the real device and nothing visible
  appeared on screen — this is itself a real finding, not a null result to ignore.**
  Before anything else: confirm whether `initScrollDiagnostics` (`app.js`) is designed
  to render something on-screen (an overlay, a panel) versus only logging to the
  browser's developer console — if it's console-only, that's not usable by the
  project owner on an iPad without a Mac connected via cable for Safari's remote Web
  Inspector, which is a real access barrier worth solving before relying on this tool
  further. If it's meant to render visibly and isn't, that's a bug in the tool itself
  to fix first. **Once the tool is confirmed actually producing visible, accessible
  output, get real on-device diagnostic data from it** — contributing elements,
  measured scrollHeight vs. viewport, etc. — as the next real lead, not another
  plausible-sounding hypothesis shipped blind. Also worth double-checking as a
  first, cheaper step regardless: confirm the round-2 structural-fix deploy actually
  reached the device being tested (fresh reload / cache-busted, not a stale cached
  build), since three straight real-device failures for a fix that passed thorough
  preview testing is worth ruling out a deploy/cache mismatch for before assuming the
  CSS/JS itself is still wrong.

* **Per-number gray-out (`anchoredClueNumbers`) only appears to work for imported
  (scanned) puzzles, not during regular gameplay on normal puzzles — needs
  investigation.** The feature was implemented and wired into `app.js`'s
  `syncAllCellVisuals` via `applyAnchoredClasses`, which should run generally, not
  only on the scan-import code path — but real-device testing shows it isn't visibly
  triggering during ordinary play. Investigate whether `applyAnchoredClasses` (or the
  `anchoredClueNumbers` call feeding it) is actually being invoked on every board
  render, or only on the code path scanned puzzles happen to go through — check
  whether normal play's render/update path differs from the scanned-puzzle path in a
  way that skips this call. Verify fix live in normal gameplay (not just against a
  scanned puzzle), since that's specifically where it's currently missing.

* **OCR residual accuracy — the previously-flagged "single digit sometimes drops or
  an extra digit appears" bug is confirmed present in real-device testing; open
  question for the project owner on whether it's worth continuing to chase.** Overall
  OCR accuracy is now much improved (clean geometry, most digits correct); the
  remaining errors are occasional, not systemic, and are exactly the kind of ordinary
  residual noise the correction step (editable text next to a thumbnail) already
  exists to catch. Given diminishing returns are a real risk here (this feature's own
  history already flagged this exact tradeoff once before, per its Round 3 OCR notes),
  worth explicitly asking the project owner whether the current error rate is
  acceptable given they're already reviewing every line anyway, rather than assuming
  further chasing is automatically worth it. If they do want it pursued further,
  `findStripLines`'s spurious-glyph-blob false positive (the `3,1,1,3`→`3,1,1,7,3`
  case) and the dropped-single-digit case are the two concrete repro leads already on
  record.

* **New feature, scoped and design-approved by the project owner: save a scanned
  puzzle to a public shared library, reusing the existing "Scan a puzzle" wizard as
  the puzzle-authoring tool rather than building a separate creation flow.** This
  pulls forward a scoped first slice of item 9 (below), ahead of item 8, which the
  project owner has explicitly deprioritized (not a current priority — keep it in
  Next Steps but no longer positioned as the next thing after item 9's remaining
  scope).
  - **Design, confirmed with the project owner:**
    1. **Saving always saves a blank puzzle — grid + clues only, never the current
       fill/X marks**, even if the scan came from a mid-solve photo. This is a
       one-way snapshot of the puzzle *definition*, not a copy of the player's
       progress.
    2. **Saving is fully decoupled from the player's own current session.** The
       "Save to library" action does not replace, interrupt, or link to whatever the
       player is doing in their own in-progress (possibly mid-solve) scan session —
       both continue to exist independently. The player can save a clean copy AND
       keep playing their own detected-fill-state version, with no interaction
       between the two.
    3. **Public visibility for this first version** — any user of the app can browse
       and play a saved puzzle. (Friends-only/private sharing explicitly deferred to
       a later version, not this round.)
  - **Scope for this round:**
    - A "Save to library" option added to the scan wizard's existing "Puzzle ready"
      step (alongside "Play it"/"Cancel"), extracting just the confirmed grid
      dimensions + row/col clues (ignoring whatever `initialMarks` the current scan
      session detected) and writing a new document to a new Firestore collection
      (e.g. `puzzles/{puzzleId}`).
    - New Firestore schema fields needed, minimum viable: dimensions, row clues, col
      clues, `title`, creator uid (Anonymous Auth, already in use elsewhere in this
      app), `createdAt`. **Confirmed with the project owner: the save action prompts
      for a title up front (required, not auto-generated/optional), and the creator
      can edit that title later** — this is real, additional scope beyond a
      write-once save.
    - **Title editing means the library browse UI (below) needs an edit affordance
      for puzzles the current user created** — not just a read-only list. Simplest
      reasonable approach: an edit control (pencil icon, or tap-to-rename) visible
      only on the current user's own saved puzzles in the library view, opening a
      small rename prompt that writes the updated `title` back to that puzzle's
      Firestore document.
    - New Firestore security rules, updated for editability: public read on the new
      collection; **create** restricted to an authenticated (including anonymous)
      user creating their own document; **update** restricted to the original
      creator (`request.auth.uid == resource.data.creatorUid`) AND scoped to only
      allow changing the `title` field — grid dimensions, clues, and creator should
      never be editable after creation. No delete needed for this first version
      unless the project owner wants creators to be able to remove their own saved
      puzzles — worth confirming, otherwise assume not needed yet.
    - New "browse the library" UI — likely a new Help-menu entry (matching the
      existing pattern for "Scan a puzzle"/"Stats & pairing"), listing public saved
      puzzles, tap to play, with the rename affordance above for the current user's
      own puzzles. Pagination/sorting/filtering can start minimal (e.g. most recent
      first) — this doesn't need to be a polished library experience yet, just
      functional browsing, play, and title editing.
    - **A puzzle played from the library behaves like any other authored puzzle, NOT
      like a scan-session puzzle**: real move history, undo-to-point, and normal
      stats counting — this is a genuine, permanent puzzle now, not an ephemeral
      scan snapshot. This should fall out naturally from not setting `source: 'scan'`
      on puzzles loaded this way, reusing the existing distinction already built for
      `Board`'s snapshot-origin vs. normal-origin behavior.
    - The existing solvability check in `scanPuzzle.js` (a puzzle must actually solve
      before the wizard lets it proceed) already guarantees only solvable puzzles
      reach the save step — no new uniqueness/validity work needed for this round.

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
* Per-number clue gray-out (`anchoredClueNumbers`) is implemented and algorithmically
  verified but **not actually working in normal gameplay** — see Current Objective.