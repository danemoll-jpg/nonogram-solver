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
  6. **Current status**: 478 tests passing (all real-data-driven, not blind threshold
     tuning). Grid/line detection and clue OCR are considered solid against real-world
     screenshots from the project owner's actual target app. **Known limitation, not yet
     addressed**: `buildScannedPuzzle` derives a fresh blank-board solution from the
     confirmed clues alone — it never captures which cells are already filled/X-marked in
     the source screenshot, so scanning a mid-solve puzzle today hands back a **blank**
     board with the right clues, silently discarding real progress. This is the subject of
     the Current Objective below.

Current Objective (Focus Area)

* **Fill-state detection: capture the puzzle's current fill/X state from the scanned
  image, not just its clues.** Previously paused pending a design discussion with the
  project owner — that discussion happened (see the design sketch preserved below, from
  when this was on hold) and the project owner is now ready to move forward, so this is
  greenlit. Confirmed this is the actual core use case, not a nice-to-have: the project
  owner scans mid-solve specifically to get unstuck on a mistake they can feel but can't
  find, and that only works once restored fill state can be run through the *existing*
  mistake-checking tools (`autoCheckMark`/`checkForMistakes` in `mistakes.js`) to point at
  exactly what's wrong.

  **Design sketch already discussed (starting point, not a locked spec — revisit anything
  that doesn't hold up once real detection work starts):**
  1. **New per-cell classification step**, distinct from grid-line detection and clue OCR:
     for each confirmed grid cell, classify filled / X-marked / still-blank. "Filled" is
     comparatively easy (a large block of non-background color). "X-marked" is harder — a
     mostly-background-colored cell with only two thin diagonal ink strokes, which won't
     show up from a simple average-color check and needs an actual stroke/pattern
     detection, in the same spirit as the digit-gap geometry work in `ocrSegment.js`.
  2. **Don't hardcode a fill color.** This project owner's specific screenshot uses green
     fill / gray X, but another app or theme could use anything. Classify each cell
     relative to *that puzzle's own* detected background tone (already known from grid
     detection), not a fixed palette — the same principle behind `inkThreshold` and
     `adaptiveBinarize` in the grid-detection work above.
  3. **Where it plugs in**: a new pure, unit-tested module (e.g. `src/cellStateDetect.js`,
     tested against real cell crops, matching this project's established pattern), run once
     the grid rect and row/col count are confirmed — cropping each cell the same way clue
     strips are already cropped. A new wizard step: a visual grid preview of detected
     fill/X state, click-to-correct rather than text boxes (the correction UX should match
     how a player already marks cells during normal play, not introduce a new interaction
     pattern).
  4. **Board integration looks straightforward, not a data-model redesign**: `Board`'s
     existing "no move history" mode for scanned puzzles already anticipates a board that
     starts with pre-set marks rather than being built move-by-move — restoring detected
     fill state should fit into that existing shape.
  5. **Scope**: comparable in size to the Round 3 OCR-segmentation work above — a new
     detection algorithm, a new wizard UI step, new tests, likely multiple real-screenshot
     verification rounds given how the grid/OCR work above played out. Treat it the same
     way: build against a first real-screenshot pass, expect to iterate against the actual
     project owner's real images (synthetic mockups alone have repeatedly missed real
     failure modes in this feature so far), not as a one-shot addition.

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