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
* **Item 7 — puzzle UI refinement pass** (mode toggle, 5×5 chunking, solver-based auto-X,
  auto-check mistake pop-up, puzzle-complete modal, real LLM-backed hint phrasing via
  Firebase Cloud Function). All six sub-items landed — summarized here since it's
  long-settled.
* **UI consolidation pass + auto-X-on-hint fix** — single "Help" dropdown replacing
  scattered panels, persistent bottom-anchored explanation panel, auto-X now runs on the
  hint path too.
* **Post-ship bug fixes**: Clear All (native `window.confirm()` silently suppressed in some
  contexts — replaced with an in-page dialog), stray "TODO" footer text removed, line
  locking added on top of auto-X (`isLineLocked` in `src/model.js`), red clue numbers for
  genuine contradictions (`isLineConsistent` in `src/lineSolver.js`, DP-based feasibility
  check, not brute force).

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

* **Post-iPad-verification pass**: puzzle name hidden until completion, grid scales to fill
  available screen space (`fitBoardToViewport`, one `--cell-size` CSS variable everything
  else scales off of), sound-effect plumbing + real audio files in `assets/sounds/`
  (drag-sweep uses a 'retrigger' short-tick approach, not a long glissando), persistent
  mute toggle, cross-device stats + pairing via Firebase Anonymous Auth
  (`createPairingCode`/`redeemPairingCode`, per-uid Firestore rules, 10-minute code expiry,
  cumulative bucket-summed stats merge on redemption — **confirmed working live**), and a
  bundled Node.js 20→22 runtime bump (dependency updates, `firebase-admin` v12+ modular-API
  migration). Deploy gotchas worth remembering for any future Firebase redeploy: Blaze plan
  required for 2nd-gen functions, the default Compute Engine service account needs an
  explicit **Cloud Datastore User** IAM role added by hand (console.cloud.google.com → IAM
  & Admin → IAM) before Firestore access works, and a callable function defaults to
  "Require authentication" and needs "Allow public access" explicitly set.

* **Clue-number spacing bug — fixed.** Multi-number clues (e.g. `1, 1`) were misreadable as
  `11` at large `--cell-size` values because the gap between numbers was a fixed `rem`
  while the font scales — switched to `em` so the gap scales proportionally with the font
  at every cell size. CSS-only.

* **Item 10 — Scan-existing-puzzle flow: built, redesigned, and hardened against real
  screenshots across three rounds. This is the project's primary current feature and the
  main reason the app exists** (per the project owner: get unstuck on a real puzzle when
  stuck, not a hint-starved/ad-gated system). New "Scan a puzzle" Help-menu entry opens a
  wizard: pick an image → confirm the detected (or manually-drawn) grid → OCR each clue
  strip → correct any misreads → solve and play, as a `source: 'scan'` puzzle (no move
  history; never counts toward stats — both by design, from `model.js`'s `Board` and
  `stats.js`'s `recordCompletion`).
  1. **v1 (original build)**: `src/gridDetect.js` (pure, unit-tested) — cell/clue-margin
     boundaries computed as an even subdivision of one detected outer rectangle rather than
     locating every individual line (fragile against noise). `src/ocr.js` — Tesseract.js
     loaded lazily from CDN as an ES module (default-export-only build, no named exports —
     `(await import(url)).default`). `src/scanPuzzle.js` — derives a solution from the
     confirmed clues via `fullSolve.js`; a solve failure sends the user back to correction
     rather than starting an unplayable board (doesn't *prove* uniqueness, acceptable for an
     already-published puzzle). `src/scanUI.js` — the wizard's DOM/canvas layer.
  2. **Redesign (auto-detect + adjustable overlay, replacing manual-drag-then-hidden-
     button)**: found and fixed the real bug behind "nothing happens after I drag the
     box" — the old flow's confirm button only appeared after a separate "Detect grid"
     click that manual dragging didn't fully set up. Redesigned instead of re-patched:
     `gridDetect.js` gained full-image auto-detection (`findGridCandidates`/
     `detectBestGrid`) that searches for the most likely grid rectangle on load, requiring
     ≥4 lines per axis before even considering a candidate (rejects ordinary rectangular UI
     chrome — buttons/cards only ever have 2 lines per side) and scoring by
     line-count × spacing-regularity × area-fraction against a confidence floor before
     auto-accepting. `scanUI.js` now always has exactly one `state.gridRect` (from
     detection or a fresh manual drag), always adjustable via 8 draggable handles, with one
     always-enabled "Looks good" confirm button — eliminating the hidden-step class of bug
     entirely rather than re-wiring the old one. Verified via synthetic screenshot-style
     mockups (UI chrome deliberately included to stress the false-positive guard) and real
     `PointerEvent` drive-throughs (caught and fixed a real crash in the manual-fallback
     drag-start path along the way).
  3. **Real-screenshot round 1**: tested against the project owner's actual target app's
     screenshot style (dark background, colorful clue chips, 25×25 grid with heavier lines
     every 5th row/col) and found two deeper detection bugs: (a) a single global Otsu
     threshold gets swamped by a large dark background, missing the grid's lines entirely
     — fixed with `adaptiveBinarize`, tile-local thresholding instead of one whole-image
     cut; (b) Otsu is a two-class splitter but this screenshot style has *three* darkness
     tiers (background, thin regular lines, heavier reinforcement lines), so it can isolate
     just the heavy lines and badly undercount — fixed with `inkThreshold`, a
     background-percentile-relative cut instead of requiring one tidy Otsu cluster. Also
     fixed a correction-step CSS bug where tall multi-number column-clue thumbnails were
     nearly invisible (`max-height` raised from `2.4rem` to `11rem`). **Confirmed during
     this round: mid-solve scanning is the actual core use case, not an edge case** — the
     project owner's real test image was a genuine "I made a mistake, help me find it"
     attempt, not an incidental test. This is why the current objective below (capturing
     fill state, not just clues) matters as much as it does.
  4. **Real-screenshot round 2**: tested against the literal real screenshot file (not just
     synthetic reproductions) and found two more real bugs: (a) filled/X-marked cells shift
     an entire row/column's average brightness for as long as the fill continues, which a
     single whole-profile threshold can't handle — fixed with a multi-pass local approach
     (`countDarkRunsLocal`, rolling-max local background estimate, iterating up to 3 rounds
     as pitch estimates improve); (b) an unrelated tall UI feature (e.g. a scrollbar) far
     from the grid but sharing a similar vertical span got merged into the grid's own line
     cluster, dragging the detected rectangle's edge outward — fixed with
     `trimClusterEndOutliers`, which only trims cluster-list *end* outliers (a real
     unrelated feature sits apart at one end; real internal gaps from missing lines must be
     left alone, since an earlier "split at any big internal gap" attempt fragmented the
     real grid cluster into uselessly small pieces). End-to-end result against the real
     image: 5×9 (unusable) → 21×26 (within easy manual correction of the true size).
  5. **Real-screenshot round 3**: tested against the FULL uncropped screenshot (round 2's
     file had been cropped by the OS screenshot tool) — grid detection landed at 25/25 rows
     and 26/25 cols (off by one), confirming round 2's fixes generalize. Two more real bugs
     found and fixed: (a) clicking "Looks good" grew the confirmed box past the true grid
     edges, because `snapRectToBorder`'s search radius (4% of image dimension) was wide
     enough to jump onto this app's near-black clue-number background chips, which are
     darker than the actual grid border — fixed by shrinking the radius to 1%, still enough
     to smooth minor imprecision but too small to jump a whole cell into unrelated content;
     (b) OCR silently merged adjacent clue numbers with no separator (e.g. "2 5" → "25",
     "1 1 4 4" → "1144") — root-caused via real crop measurement (genuine multi-digit
     numbers have a consistent ~10-12px inter-digit gap vs. ~18-27px between distinct
     numbers, no overlap across four measured examples) and fixed via new module
     **`src/ocrSegment.js`** (`findRuns`, `groupGlyphsIntoNumbers`, `filterNoiseLines`, all
     pure/unit-tested from real measured data): OCR each whole clue-strip line in one call
     (isolating single glyphs was tried and rejected — confirmed Tesseract mis-reads an
     identical, perfectly legible "4" as the letter "A" once cropped alone with no
     surrounding context), then re-split the digit stream using real pixel-geometry glyph
     counts; falls back to per-number OCR only when the digit count from OCR disagrees with
     geometry. Also fixed isolated-crop padding (4px → 12px `CROP_PADDING`) after
     confirming Tesseract returns nothing at all for too-tightly-cropped glyphs. End-to-end
     result: fully garbled merged output → mostly-correct clue text, remaining errors now
     ordinary single-digit OCR noise (exactly what the correction step's editable
     text-next-to-thumbnail design exists to catch), not systematic merging failures.
  6. **Fill-state detection — built and verified against the real test screenshot,
     completing item 10.** `buildScannedPuzzle` used to derive a fresh blank-board solution
     from the confirmed clues alone, discarding whatever was already filled/X-marked in the
     source screenshot — scanning a mid-solve puzzle now restores that state instead. New
     pure module **`src/cellStateDetect.js`** (`estimateBackgroundColor` — a color MODE over
     pooled cell-interior pixels, not a fixed palette, so it adapts to whatever fill/X colors
     a given app/theme uses; `classifyCellPixels` — FILLED for a large block of non-background
     ink, EMPTY for ink concentrated near BOTH diagonals AND spanning most of the cell on
     both axes, UNKNOWN otherwise; the two-part diagonal test matters — diagonal-proximity
     alone isn't enough, since a stray straight line through a cell's center is geometrically
     close to a diagonal too without running corner-to-corner, confirmed by a real bug this
     caught, see below). Returns `model.js`'s own FILLED/EMPTY/UNKNOWN states directly, no
     separate vocabulary to translate later.
     - **Real bug found and fixed via the real screenshot** (confirming CLAUDE.md's
       "synthetic mockups miss real failure modes" pattern yet again): this screenshot's
       outer grid border (~14px) is noticeably thicker than its internal lines (~1-2px).
       `sliceGridCells`' even subdivision — anchored on `snapRectToBorder`'s snapped edge,
       which picks the single DARKEST pixel near a rough edge — landed on the border's OUTER
       edge rather than its middle, offsetting every cell boundary inward by the extra
       thickness and leaving real internal grid lines crossing straight through what should
       have been blank cell interiors (confirmed directly: blank cells read as false
       X-marks). Fixed with new `gridDetect.js` export **`centerRectOnBorders`**
       (`innerEdgeOfBorder` walks INWARD only from a rough edge — the outward side is
       unreliable here since this app's clue-number margin sits flush against the border with
       no white gap, confirmed directly — until the border's own ink ends, using a threshold
       computed from a window straddling just that edge rather than the whole image or the
       rect's own interior span, both of which were tried and shown wrong against real pixel
       data). Used only for the fill-state cell-slicing step; `snapRectToBorder` itself is
       untouched, so the already-tuned OCR clue-band flow is unaffected.
     - Wizard gained a new step between clue-correction and done: a compact clickable grid
       (`.scan-fillstate-grid`/`.scan-fillstate-cell` in `styles.css`, reusing the real play
       board's own filled/X visuals) previewing detected state per cell, cycling
       UNKNOWN→FILLED→EMPTY→UNKNOWN on click — the same order normal play's fill mode already
       uses, not a new interaction pattern. Confirmed marks attach to the puzzle object as
       `initialMarks`; `app.js`'s `startPuzzle` seeds the board via `Board.fromGrid` when
       present instead of a blank `new Board()`, so `mistakes.js`'s existing snapshot-origin
       checking (`hasHistory: false`) picks it up with no changes needed there — matched the
       design sketch's prediction that this wouldn't need a data-model change.
     - **Verified two ways**: (1) the classification pipeline directly against real crops
       from the project owner's actual test screenshot (a temporary browser-side harness
       driving the real `src/` modules against the real image, not synthetic pixel arrays —
       matched the puzzle's true fill/X shape once the border-offset bug above was found and
       fixed); (2) the full wizard flow end-to-end through the real UI (auto-detect → confirm
       → fill-state review incl. a live click-to-correct → confirm → play), using a
       synthetic photo for this pass only because it needed a *known* ground truth to
       diff against and a *solvable* clue set — confirmed the restored board matches exactly,
       including a manual correction made in the review step surviving into the final
       playable board. 15 new unit tests (`test/cellStateDetect.test.js`), all real-data-
       calibrated (background/fill/X colors taken from real measured pixels, not guessed).
     - **Known limitation, documented, not yet hit in practice**: the background-color
       estimate is a mode across ALL cells' interior pixels, which assumes blank cells are
       the majority — true for the actual target use case (a mid-solve scan) but could drift
       toward the fill color on an almost-entirely-filled puzzle. The wizard's click-to-correct
       step is the safety net, same as it already is for OCR misreads.
     - **iOS follow-up fix**: the project owner reported the scan wizard's scrollbar
       "missing" on iOS. Root cause: the new fill-state grid above had its OWN
       `max-height`/`overflow-y: auto`, nested inside `.modal-card__body`'s existing
       `overflow-y: auto` — two independently vertical-scrollable regions nested inside each
       other, which iOS Safari doesn't reliably scroll-chain (a touch starting over the inner
       grid can get stuck there instead of handing off to the outer modal once the grid's own
       scroll bottoms out). Fixed by dropping the inner region's vertical scroll entirely —
       `.scan-fillstate-grid` now just grows to its natural height and lets the one outer
       `.modal-card__body` region handle all vertical scrolling (kept `overflow-x: auto` on
       the grid alone, for a very wide puzzle exceeding the modal's width — a single-axis
       nested scroll doesn't compete with the outer vertical gesture the way a second
       vertical one did). Added `-webkit-overflow-scrolling: touch` to both regions for
       momentum scrolling. Verified via the Browser pane's mobile viewport emulation
       (measured `scrollHeight`/`clientHeight` before/after — the grid no longer needs its
       own vertical scroll, the outer body does); **not yet confirmed on a real iOS device**,
       worth a real-device check next time the project owner is testing on iPad/iPhone.

Current Objective (Focus Area)

* None right now — item 10 (scan-existing-puzzle, including fill-state detection) is
  complete. Check with the project owner on what's next: item 8 (photo → puzzle generation)
  and item 9 (Firestore shared library) are both still open and undesigned, see "Next Steps"
  below.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid; the
  pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's grid
  detection — worth revisiting whether these share code now that item 10's detection code
  exists and is battle-tested). Still open: is grid size user-adjustable at generation time
  or fixed per image; slider vs. automatic threshold/contrast tuning; reject, flag, or allow
  non-unique-solution puzzles (solver can validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a
  friends/share-by-code model. Schema and permissions are undesigned. The stats-tracking
  and cross-device pairing piece was pulled out into its own item, already confirmed done —
  what's left here is the library/sharing side: puzzle storage, browsing, and whether stats
  become visible to friends.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function
  (`functions/index.js`) by default, with `defaultPhraser`'s old deterministic templates kept
  as the fallback for when that call fails — see the comment at the top of that file.
* Firebase project exists (`nonogram-pro-e8a31`). `firebase.json` / `.firebaserc` at the
  repo root declare Functions and Firestore (rules only). Deploy target for the static site
  stays Netlify regardless. Anonymous Auth + Firestore are in active use for the
  stats/pairing item; item 9's puzzle-library Firestore usage is still separate/later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* **Node.js 20→22 runtime bump — done and deployed.** No longer outstanding.
* **Firestore security rules: in active use** — `firestore.rules` (repo root) covers
  `users/{uid}/stats/*` (owning-uid only) and locks `pairingCodes/*` to the Admin SDK
  entirely. Full puzzle-library rules still belong to item 9 when it's scoped.
* Hint phrasing has an invisible-by-design fallback (real LLM call → deterministic template
  on any failure), which means "a hint appeared" is not proof the LLM call actually
  succeeded. **When verifying hint phrasing after any Cloud Function change, check the
  console/Cloud Function logs, not just that a hint shows up.**
* A diagnostic `console.error(response.status, JSON.stringify(data))` is deliberately left
  in `functions/index.js` on the "LLM response had no text content" error path, as a
  tripwire in case that failure recurs — harmless, only logs on that one path. Has not
  fired again since the original clean redeploy; root cause was a reasonable best guess but
  never 100% confirmed. If it fires again, check Cloud Function logs before assuming the
  same fix applies.
* Real audio files are in place in `assets/sounds/` — sound effects are fully done as far
  as this project's build order is concerned (the project owner may still iterate on
  individual files later).
* Tesseract.js (OCR, item 10) is loaded lazily from the CDN as an ES module (`src/ocr.js`),
  same no-bundler pattern as `src/firebase.js` — its ESM build has no named exports, only a
  default export bundling everything (`(await import(url)).default`).
* **Item 10's grid/line detection and OCR were built and repeatedly fixed against real
  screenshots from the project owner's actual target app, not synthetic mockups alone** —
  synthetic mockups missed multiple real failure modes across all three rounds (a swamped
  global threshold, a three-tier line-darkness scheme, filled-cell brightness drift, a
  scrollbar-like false positive, digit-merging OCR). When extending or debugging this area
  further (including the fill-state detection objective above), prefer testing against a
  real image file over guessing at plausible synthetic pixel values — this project's own
  history strongly favors it.