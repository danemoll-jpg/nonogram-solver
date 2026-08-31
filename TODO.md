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
* **Item 7 — puzzle UI refinement pass.** All six sub-items landed:
  1. Fill/Mark-empty mode toggle in the toolbar (`#mode-fill` / `#mode-x`), replacing
     right-click/long-press. Click applies the active mode's mark, clears it if already set;
     drag paints using whatever the first cell in the drag did. See `app.js`'s
     `attachPointerHandlers`.
  2. 5×5 grid chunking — thicker border every 5 rows/cols, computed from actual row/col
     index in `app.js`'s `renderBoard` (not `nth-child`, which doesn't line up once clue
     cells are counted as siblings) and rendered via `.chunk-col-end` / `.chunk-row-end` in
     `styles.css`.
  3. Solver-based auto-X on line completion — `app.js`'s `autoXCellsFor`, using
     `isLineSatisfied`'s exact run-comparison (not a fill-count check). Batched into the
     triggering move via the model's new `Board.setBatch` (one history entry for
     multiple cells), so undo-to-point removes a move's auto-X marks along with it.
     (Originally only ran on manual marking, not the hint-application path — fixed in the
     UI consolidation pass below.) Line locking was later added on top of this — see the
     "Post-ship bug fixes" entry below — auto-X itself is unchanged.
  4. Auto-check mistake pop-up anchored to the board panel (`#mistake-popup` /
     `.mistake-popup` in `index.html` / `styles.css`) with Dismiss and Learn More; Learn
     More reuses the existing on-demand-check flow (`runOnDemandCheck` in `app.js`, backed
     by `mistakes.js`) rather than a new explanation path.
  5. Puzzle-complete modal (`#complete-modal`) showing time taken, hints used, and mistakes
     made — all derived from `board.history` at completion time (`computeCompletionStats`
     in `app.js`): hint-originated moves are tagged `source: 'hint'` (by `app.js`'s
     `applyHintDeduction`), and any historical cell-write that disagreed with the solution
     counts as a caught mistake. No new persistence or live counters needed.
  6. Real LLM-backed hint phrasing — `src/hintPhrasing.js` now calls a Firebase Cloud
     Function (`functions/index.js`, callable `phraseHint`) via `src/firebase.js`, falling
     back to the old deterministic template if the call fails for any reason (offline, not
     yet deployed, transient error) so hints never go missing.
* **UI consolidation pass + auto-X-on-hint fix.** All three sub-items landed:
  1. Single "Help" dropdown (`#help-menu-btn` / `#help-menu-list`) replaces the old
     always-visible "Hints & help" / "Mistakes" side panels — those pushed content offscreen
     in portrait. Menu items: How to play, Get a hint, Check my work, Remove bad marks,
     Clear all (relocated Reset, confirm-gated — see fix below). "Dig deeper" stays a
     conditional follow-up button next to the explanation panel, not a menu item.
  2. Persistent bottom-anchored explanation panel (`#explain-panel`, `setExplain()` in
     `app.js`) — `position: fixed` to the viewport bottom, `body` reserves matching
     `padding-bottom`. One shared surface for hint reasoning and mistake explanations.
  3. Auto-X now runs on the hint path too, via `app.js`'s `withAutoX(changes)` /
     `applyHintDeduction` — both manual marks and hint deductions batch into one history
     entry so undo-to-point works for either. `solver.js`'s `applyDeduction` is untouched
     (still used by `solveToFixpoint`), per CLAUDE.md's "solver only produces facts" rule.
* **Post-ship bug fixes: Clear All, stray scroll/TODO text, line locking, and red
  (contradiction) numbers.** All four landed:
  1. **Fixed: "Clear all" did nothing.** Root cause was `window.confirm()` itself — several
     real browser/embedded-webview contexts silently auto-dismiss it (returns `false`, no
     dialog shown), which looks identical to "broken" rather than "not yet confirmed."
     Replaced with an in-page confirm dialog (`#confirm-modal`, `showConfirm()` in `app.js`),
     styled like the existing How-to-play/Complete modals — no dependency on a native dialog
     that can be silently suppressed.
  2. **Fixed: stray "TODO" text.** Was the page footer — an internal dev note in
     player-facing UI. Deleted, along with its now-unused `.footer` CSS. The
     unwanted-auto-scroll half didn't reproduce; removing the footer removes one plausible
     scroll target regardless. **Re-open with repro steps if scrolling resurfaces.**
  3. **Added line locking on top of auto-X.** `isLineLocked(line, clue)` (`src/model.js`) =
     `isLineSatisfied` **and** fully marked (no UNKNOWN cells left). `paintCell` blocks any
     change to a cell in a locked line, except clearing an existing FILLED cell back to
     UNKNOWN, which also reverts that line's auto-X'd cells back to UNKNOWN in the same
     batched move.
  4. **Added red clue numbers for genuine contradictions.** Reused `isLineConsistent`
     (`src/lineSolver.js`, a DP-based feasibility check, not brute force) — wired into
     `app.js`'s `syncAllCellVisuals` as a `.contradiction` class on the clue element.
     Feedback only — never blocks the move that caused it.

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

* **Post-iPad-verification pass: puzzle-name reveal, responsive board sizing, sound
  plumbing, and cross-device stats/pairing.** All four coded, deployed, and now confirmed
  working live:
  1. **Puzzle name hidden until completion.** `#puzzle-select` shows `Puzzle N — RxC`
     instead of the real name; revealed as a new row in the completion modal (`#stat-name`).
  2. **Grid scales to fill available screen space.** `app.js`'s `fitBoardToViewport`
     measures live layout and picks the largest square cell size (clamped 18–64px) via one
     `--cell-size` CSS variable that clue font-size and the ✕ mark also scale off of.
     Re-fits on resize/orientation change and whenever the explain panel's height changes.
  3. **Sound-effect plumbing**, built against placeholder silent audio, then real files
     dropped in (see Technical Notes — sound effects are fully done). `src/sounds.js` holds
     playback + the persistent mute toggle (`#mute-toggle`, `localStorage`-backed, defaults
     unmuted); `app.js` wires all eight trigger points, with `lock` taking priority over
     `batchCompleteChime` when auto-X completing a line also locks it (`isLineLocked` is a
     superset of what triggers auto-X). **Drag-sweep prototype resolved: 'retrigger' is the
     default** (a short, cleanly-loopable tick/scrape sample fired repeatedly as the drag
     crosses cells — scales naturally with drag speed/cell count, no time-stretching
     needed).
  4. **Cross-device stats + pairing.** `src/stats.js` (client) + `createPairingCode`/
     `redeemPairingCode` callables (`functions/index.js`, using `firebase-admin` for
     `createCustomToken` + Firestore) + `firestore.rules` (per-uid stats access only;
     pairing codes locked to the Admin SDK). Design: Anonymous Auth per device; pairing
     re-authenticates the second device as the first device's uid via a minted custom
     token, so ordinary per-uid security rules just work with no merge-aware special-casing.
     Code expiry 10 minutes; pre-existing stats on redemption are summed bucket-by-bucket
     (cumulative, lossless — `mergeStatsBucket`, unit-tested); visibility stays player-only.
     New "Stats & pairing" Help-menu item opens a modal with the stats table and
     generate/redeem-code UI. **Confirmed working live** — the project owner successfully
     generated a pairing code via Help → Stats & pairing.
  5. **Node.js 20→22 runtime bump**, bundled into this pass since it already touched
     `functions/`. `functions/package.json`: `engines.node` now `"22"`;
     `firebase-functions@^7.3.2`, `firebase-admin@^14.3.0`. Hit and fixed a breaking change:
     `firebase-admin` v12+ dropped the old namespaced `admin.firestore()`/`admin.auth()` API
     — switched to the modular `firebase-admin/app`, `firebase-admin/firestore`,
     `firebase-admin/auth` imports. Deployed and working (see IAM fix below).
  6. **Deploy steps taken:** Anonymous sign-in enabled in the Firebase console; `functions`
     deployed via `firebase deploy --only functions` (`phraseHint`, `createPairingCode`,
     `redeemPairingCode` all live); a Firestore database was created (didn't exist before)
     and `firestore.rules` published through the console's Rules tab.
  7. **Hit and fixed: IAM permissions gap.** `createPairingCode` first failed with a generic
     "internal" error; `firebase functions:log` showed the real cause —
     `PERMISSION_DENIED` from the Firestore Admin client. Cause: 2nd-gen Cloud Functions run
     as the **default Compute Engine service account**
     (`537841607435-compute@developer.gserviceaccount.com`), which on newer GCP projects no
     longer gets automatic Firestore access. **Fix**: added the **Cloud Datastore User**
     IAM role to that service account via console.cloud.google.com → IAM & Admin → IAM (a
     Google Cloud IAM grant, not a Firebase console setting — same category as the IAM
     grants hit during the original `phraseHint` deploy).

* **Clue-number spacing bug — fixed.** Root cause confirmed: `.nono-clue--row`'s gap
  between numbers was a fixed `0.3rem`, but clue font-size scales with the responsive
  `--cell-size` (18–64px, see `fitBoardToViewport` in `app.js`). At the top of that range a
  fixed-rem gap is proportionally tiny next to the now-much-bigger digits, so a clue like
  `1, 1` could visually read as `11` — confirmed in the live app by forcing `--cell-size` to
  its 64px ceiling and reading the computed gap-to-font-size ratio (0.183, vs. 0.4 after the
  fix). Fix: `styles.css`'s `.nono-clue--row`/`.nono-clue--col` gaps now use `em` instead of
  `rem`, tying them to each clue element's own (already-scaling) font-size, so the ratio —
  and the visual separation — holds at every `--cell-size` the board computes, not just the
  one size this was originally tuned at. CSS-only, no Cloud Function deploy needed.

* **Item 10 — Scan-existing-puzzle flow, v1 — built and working end-to-end (verified
  against a synthetic test image in the live app; not yet tried against a real photo or
  screenshot — see caveat below, including a note on the project owner's actual use case).
  A real-device test surfaced a bug — see Current Objective below.**
  New "Scan a puzzle" entry in the Help menu opens
  a step-by-step wizard: choose an image -> drag a box around just the grid squares ->
  detect the grid -> OCR every row's/column's clue strip -> correct any misreads -> solve and
  play. Feeds the result in as a `source: 'scan'` puzzle — the "no move history" and "never
  counts toward stats" behavior were both already designed for and stubbed in from an earlier
  pass (see `model.js`'s `Board` class comment, `mistakes.js`'s snapshot-origin
  mistake-checking, and `stats.js`'s `recordCompletion` early-return); this round wired the
  actual acquisition pipeline that produces one.
  1. **Grid detection (`src/gridDetect.js`, pure functions, unit-tested).** Design tradeoff,
     documented in that file: rather than pinpointing every individual internal grid line
     from the photo (fragile against noise/lighting/skew), cell and clue-margin boundaries
     are an *even subdivision* of one detected outer rectangle. Pixel analysis is used for
     two narrower, more forgiving jobs instead — `snapRectToBorder` nudges the user's rough
     drag-rectangle onto the puzzle's actual printed border (Otsu-thresholded row/col
     intensity profiles, searched only within each rectangle's own cross-axis span so the
     two opposite edges of a symmetric border don't get confused with each other — an early
     bug caught by the unit tests), and `countGridLines` counts grid lines to *suggest* a
     row/col count that the user still confirms in an editable field before OCR runs.
     Row-clue and column-clue bands are computed geometrically from the confirmed grid
     rectangle (everything left of / above it, sliced into `rows`/`cols` equal-pitch strips)
     — no separate margin-line detection needed, since a printed nonogram's clue numbers
     always line up cell-for-cell with the grid line they describe.
  2. **OCR (`src/ocr.js`).** Tesseract.js loaded lazily from the CDN as an ES module
     (`tesseract.js@5.1.1`, matching `src/firebase.js`'s no-bundler CDN-import pattern), one
     shared worker reused across every strip in a scan session, digit/punctuation
     whitelisted (`tessedit_char_whitelist`). **Hit and fixed:** the ESM build has no named
     exports, only a default export bundling everything (`(await import(url)).default`) —
     confirmed against the actual CDN file rather than assumed, since the mismatch only
     surfaces at runtime (`createWorker is not a function`) otherwise. Each strip crop is
     upscaled (short strips are only a cell-pitch tall in source pixels) and binarized with
     the same Otsu thresholding as grid detection before recognition — a standard, meaningful
     OCR accuracy improvement for printed digits.
  3. **Puzzle building (`src/scanPuzzle.js`, pure functions, unit-tested — differential
     test against every `SAMPLE_PUZZLES` entry's own clues).** A scanned puzzle has no known
     solution the way an authored one does, but `mistakes.js`'s tools all require one — so
     `buildScannedPuzzle` derives it by running the confirmed clues through
     `fullSolve.js`'s existing `solvePuzzleFully`. A real published puzzle's clues have a
     unique solution by construction, so a solve failure (`{ solved: false }`) is treated as
     "OCR (or an uncorrected typo) still has an error" and sends the user back to the
     correction step rather than starting an unplayable board. Noted in that module's
     comment: this doesn't *prove* uniqueness (contradiction-search finds *a* valid
     completion, not provably the only one) — acceptable for a photo of an already-published
     puzzle, genuinely out of scope here (that's item 8's uniqueness-checking territory).
  4. **Wizard UI (`src/scanUI.js`, the one module in this feature touching the
     DOM/canvas).** Pointer-event rectangle dragging on a downscaled analysis canvas (max
     800px) with OCR crops cut from a separate, higher-resolution canvas (max 1600px) for
     legible digits; per-strip progress text during OCR; each correction row pairs an
     editable text input with a thumbnail of the actual cropped strip so the user can verify
     against the photo, not just trust the OCR text.
  5. **`app.js` integration:** `loadPuzzle`/board-init logic factored into a shared
     `startPuzzle(p)` (sets `board.hasHistory = puzzle.source !== 'scan'`), plus
     `startScannedPuzzle(p)` which adds/reuses one puzzle-picker entry so switching back to a
     scanned puzzle later in the session works the same as picking any other.
  6. **Verification:** unit tests (`test/gridDetect.test.js`, `test/scanPuzzle.test.js`) plus
     a live end-to-end run in the browser — a synthetically-drawn 5x5 grid image (matching
     the `Heart (5x5)` sample puzzle's clues) was fed through the actual wizard: grid
     detection correctly found 5x5 and snapped to the true border, OCR read 9 of 10 clue
     strips correctly and misread `1  1` as `11` (a real OCR ambiguity — corrected by hand in
     the wizard's own correction step, which is exactly what that step is for), and the
     resulting puzzle solved to and played as the correct Heart pattern, completion modal and
     all. **Caveat, updated after talking with the project owner:** their actual use case is
     screenshots of a nonogram puzzle (from another app/site), not a physical print
     photographed with a camera — a friendlier input than what the original caveat here
     worried about (no lighting variation, no skew, no camera noise, crisp digital font
     rendering), so this may need little to no follow-up tuning. Dropped the file input's
     `capture="environment"` attribute accordingly, since it biases mobile browsers toward
     opening the camera rather than a normal photo/file picker — wrong nudge for "pick an
     existing screenshot." Still genuinely unverified against a real screenshot at the time
     this pass shipped — **the project owner has since tried it on a real device; see the
     bug found, in Current Objective below.**

* **Scan wizard grid-selection redesign: auto-detect on load, highlighted/adjustable
  overlay, explicit confirm button, manual drag as fallback.** Replaces (not just patches)
  the bug found on real-device testing — see that bug's own writeup below for what was
  actually wrong.
  1. **`src/gridDetect.js`: full-image auto grid detection**, new exports
     `findGridCandidates`/`detectBestGrid`, pure functions, unit-tested
     (`test/gridDetect.test.js`). Extends this file's existing line-detection primitives
     from "refine a user-given rectangle" to "search the whole image": finds horizontal/
     vertical dark-pixel runs long enough to plausibly be grid lines, merges same-line
     runs into bands, clusters bands into line-families sharing a common cross-axis span,
     and pairs a horizontal-line-family with a vertical-line-family that mutually bound
     the same box. **The false-positive guard the project owner's screenshots specifically
     needed**: requiring >= `minLines` (default 4) lines per axis before a cluster is even
     considered rejects ordinary rectangular UI chrome outright — a button/card/panel has
     exactly one outline per side (2 lines), never enough to become a candidate at all,
     regardless of size or prominence. Among clusters that do qualify, score =
     line-count-product × spacing-regularity × rectangle-area-fraction, and only a
     candidate clearing a minimum confidence floor (`DEFAULT_MIN_CONFIDENT_SCORE`) is
     auto-accepted — otherwise the wizard falls back to manual selection. rows/cols come
     directly from the winning clusters' line counts (n lines bound n-1 cells), no
     separate counting pass needed for the auto path. **Bug caught by the unit tests
     during development**: the first cluster-matching metric (overlap ÷ shorter-span)
     let one long unrelated line's span *contain* a much shorter grid line's span and
     merge into its cluster, silently inflating the line count (a 10x10 test grid next to
     a wide banner line came back as 12 rows) — fixed by switching to
     intersection-over-union, which requires both spans to be close to the same size, not
     just overlapping. See that file's comment above `findGridCandidates` for the full
     writeup.
  2. **`src/scanUI.js`: one rectangle, one interaction model, always one working "Looks
     good" button.** Replaced the old two-state roughRect/gridRect split (and the
     never-rendered confirm button that went with it) with a single `state.gridRect` that
     always exists once an image is loaded — either from `detectBestGrid` immediately on
     load, or from a fresh manual drag if detection wasn't confident. It's always
     adjustable via 8 canvas-drawn handles (4 corners + 4 edge midpoints; pressing inside
     the box moves it, pressing outside starts a brand new box). The `#scan-btn-confirm-
     grid` ("Looks good") button is enabled any time the rect has real size, regardless of
     how it got there — that's the actual fix for the missing-action bug, since there's no
     longer a distinct hidden step whose button could go unwired. Clicking it runs the
     same snap-to-border + line-counting refinement either way (auto-detected or
     hand-drawn), populating the existing editable rows/cols fields before OCR.
  3. **`index.html`/`app.js`/`styles.css`: renamed `#scan-btn-detect` → `#scan-btn-confirm-
     grid` ("Detect grid" → "Looks good"), added a live-updating `#scan-grid-hint`
     paragraph** ("Grid detected automatically…" vs. "Couldn't auto-detect the grid…")
     driven by whether `detectBestGrid` found a confident candidate.
  4. **Verification:** `npm test` — 460 passed, 0 failed, incl. 3 new tests for the
     detection false-positive guard specifically (a plain outline rectangle never becomes
     a candidate; the real grid wins over a nearby plain rectangle when both are present).
     Live-browser smoke test via a synthetic *screenshot-style* mockup (a dark header bar,
     a bordered "Submit" button, a bordered card, and an 8x8 grid with clue-number-style
     digits, deliberately built to exercise the false-positive risk) confirmed: auto-
     detection found the grid and ignored all three UI-chrome rectangles, the overlay +
     handles rendered correctly, "Looks good" was enabled immediately and produced the
     exact right row/col count (8/8) with no manual step required. Also drove the pointer
     handlers with real `PointerEvent`s (not just clicks) against a *no-grid* image to
     exercise the manual-fallback path end-to-end, which **caught a real bug before it
     shipped**: the fresh-rectangle-draw branch of the pointerdown handler never set
     `state.dragStart`, so dragging out a manual box crashed on the first `pointermove`
     (`Cannot read properties of null`) — fixed by setting it alongside the other two drag
     modes. Confirmed the fallback path (auto-detect declines, manual drag, "Looks good",
     no crash) end-to-end after the fix.
  5. **Still open — not yet verified against a real screenshot.** Everything above was
     checked with synthetic mockups (deliberately including nearby UI-chrome rectangles to
     stress the false-positive guard), not an actual photo/screenshot from a device — the
     project owner should re-try the flow on the iPad screenshot that originally surfaced
     the missing-button bug (or a similar one) to confirm both that detection finds the
     real grid on genuine screenshot content and that the false-positive guard holds up
     against whatever UI chrome that app's screenshots actually contain. Report back
     either way — if detection is unconfident or wrong on real content, `minLines`/
     `minLineLenRatio`/`DEFAULT_MIN_CONFIDENT_SCORE` in `gridDetect.js` are the knobs to
     retune, not a reason to redesign the fallback (manual drag still always works).

  **Bug this replaces/fixes: "Scan a puzzle" wizard had no way to proceed after drawing
  the grid-selection box.** Found by the project owner testing the deployed item 10 flow
  against a real screenshot on iPad (their actual use case) — the very case that hadn't
  been tried yet during development. After completing the manual drag, nothing happened:
  no visible "Detect Grid"/confirm button, no loading state, no error. Root cause, per the
  redesign above: the old flow's confirm button only appeared after a separate "Detect
  grid" click that itself depended on state that a manual drag alone didn't fully set up
  right — the redesign removes that split entirely rather than re-patching it.

* **Real-screenshot verification round 1: two deeper detection bugs found and fixed,
  one real limitation remains (row/col auto-count still needs manual correction on this
  app's screenshots).** The project owner tried the redesign above against an actual
  screenshot from their target app (dark navy background, colorful clue-number chips
  directly on that background, a 25x25 grid with thin per-cell lines reinforced by darker
  lines every 5th row/col — this project's own app uses that same "every 5" convention).
  Result: auto-detection found nothing at all, and manually dragging a box only counted
  5x9 instead of the true 25x25 (confirmable/correctable, but a bad starting suggestion);
  separately, the correction-step thumbnails for this puzzle's tall multi-number column
  clues were "too big and mostly not visible."
  1. **Root cause 1 (why auto-detection found nothing): a single global threshold gets
     swamped by a large dark background.** Confirmed directly: fed a synthetic
     navy-background/white-panel/medium-gray-line image through `otsuThreshold` and the
     global threshold came back at 35 — the line color (190) was nowhere near dark enough
     to register relative to a whole-image split dominated by the navy background. **Fix:**
     `gridDetect.js`'s new `adaptiveBinarize` bins the image into small tiles and
     thresholds each tile against only its own local content, so a tile straddling the
     white grid panel judges the grid's lines on that contrast alone, regardless of how
     dark the rest of the image is. `findGridCandidates` now builds its dark-pixel mask
     from this instead of one global `otsuThreshold` call. New tests: `adaptiveBinarize`
     directly (marks a locally-faint edge dark despite a much-darker dominant region;
     leaves a truly uniform tile alone rather than manufacturing speckle), plus a
     `detectBestGrid` regression test reproducing the exact navy-background/white-panel
     scenario.
  2. **Root cause 2 (why the row/col count undercounted so badly, in *both* the old
     manual-fallback path and the new auto path): Otsu is a two-class splitter, but this
     app's screenshots render (at least) three line-darkness tiers** — near-white
     background, thin regular lines, and much darker reinforced lines every 5th row/col
     (this project's own app does the same "5x5 chunking" per the Completed Tasks above).
     With three unevenly-sized populations, Otsu's single optimal cut can land between the
     wrong pair — e.g. isolating just the heavy reinforcement lines from "everything else,
     including the thinner real lines" — undercounting badly. Confirmed directly against a
     live mockup built to reproduce this exact three-tier style: the pre-existing
     `countGridLines` path (unchanged by the redesign, called by "Looks good" regardless of
     auto or manual rect) only found the heavy lines. **Fix:** new `inkThreshold` helper
     (not exported outside the module) estimates the background tone as a high percentile
     of the sample (robust to a minority of darker ink pixels, in whatever tier they're in)
     and treats anything a fixed margin darker than that as ink, rather than requiring the
     ink to form one tidy Otsu cluster. Swapped into both `countGridLines` (the row/col
     count suggestion, both paths) and `adaptiveBinarize` (the full-image rectangle search).
     `otsuThreshold` itself is untouched and still exported/used as-is for `scanUI.js`'s OCR
     strip binarization, a genuinely simpler two-class (ink digit vs. paper) problem where
     it's still the right tool.
  3. **Verified via a live-browser mockup built specifically to reproduce the reported
     failure** (dark navy background, colorful clue-number text on that background, a
     20x20 grid with thin gray lines reinforced every 5th line, plus scattered
     filled/X-marked cells to mimic a mid-solve screenshot): before these two fixes,
     auto-detection found nothing (fell back to manual-only) and the manual path's line
     count came back as low as 4-7 lines per axis; after both fixes, auto-detection finds
     the grid immediately with a correctly-placed rectangle (confirmed by screenshot — gold
     overlay bounds exactly the white grid area, ignoring the navy background, the moon
     icon, and the clue-number chips) and the row/col suggestion improved to 12/12 —
     **much closer, but still short of the true 20/20 in this mockup**, presumably because
     some faint lines near the scattered filled/X-marked cells still don't clear the ink
     margin. This remaining gap is exactly what the always-editable rows/cols fields exist
     for (never applied blind, per this file's own long-standing design note) — but it
     means the auto-suggested count on a busy, mid-solve, three-tier-line screenshot like
     this one will likely still need manual correction. **Not a regression**: the old
     pre-redesign code had this same undercounting weakness on this style of screenshot
     (confirmed above) — it's just newly visible because detection now gets far enough to
     produce a rect and a (still-imperfect) count at all, instead of finding nothing.
  4. **`styles.css`: `.scan-clue-row__thumb`'s fixed `2.4rem` max-height raised to
     `11rem`** (and `.scan-clue-list`'s scrollable max-height from 16rem to 22rem) — a
     25x25 puzzle's column clues can stack a dozen+ numbers, illegible when forced into a
     height sized for a couple of numbers. This was likely the dominant cause of the
     "too big and mostly not visible" complaint on its own (independent of the row/col
     miscount above, though a wrong count also produces strips that don't correspond to
     real single lines, compounding it).
  5. **`npm test`: 464 passed, 0 failed** (8 new tests across `adaptiveBinarize` and
     `findGridCandidates`/`detectBestGrid`, all built from first-principles reproductions
     of the confirmed root causes above, not blind tuning).
  6. **Still open — everything above was verified against synthetic mockups built to
     reproduce the *described* failure, not the literal real screenshot file** (only a
     rendered preview was available in chat, not a file this environment could read
     pixel-exact). The project owner should re-try the actual screenshot: auto-detection
     finding the grid at all would confirm root-cause-1's fix generalizes; if the row/col
     count is still noticeably off, that's the known remaining gap in item 2 above (correct
     it manually — the fields are designed for exactly this) rather than a new bug to
     chase blind. **If further precision tuning is wanted, the most useful thing the
     project owner can provide is the actual image file** (not just a chat screenshot) so
     the real pixel values can be tested against directly instead of approximated.
  7. **Confirmed with the project owner: mid-solve scanning is THE core use case, not an
     edge case.** The whole reason item 10 exists is to help when stuck on a real puzzle —
     this screenshot was a genuine attempt to get unstuck after spotting a mistake, not an
     incidental test image. Because of this, once the project owner shared the actual image
     file (see below), detection tuning targeted this exact scenario directly rather than
     treating filled/marked cells as noise to merely tolerate.
     **Still true and worth a deliberate decision separately**: `scanPuzzle.js`'s
     `buildScannedPuzzle` derives a fresh solution from clues alone (`fullSolve.js`) and
     never captures current fill state, so scanning a mid-solve puzzle today still hands
     back a **blank** board with the right clues — existing marks aren't carried over. That
     may be perfectly fine (get unstuck, remark what's already figured out) but is a
     separate, materially bigger addition (color-aware per-cell state detection, not just
     clue-strip OCR) from the grid/line-detection accuracy work below, and deserves its own
     design pass rather than silent scope creep here.
  8. **Round 2: tested directly against the actual real screenshot file the project owner
     provided, and found + fixed two more real bugs** (previous rounds only had synthetic
     approximations to go on). Loaded the literal PNG into a browser canvas and ran
     `gridDetect.js`'s functions against its real pixel data — a categorically better
     signal than guessing at plausible colors.
     - **Root cause: filled/X-marked cells shift entire spans of a row/column profile to a
       different average tone** — a green-filled or X-marked cell isn't just "a bit darker
       at the grid line," it drags the WHOLE row's average brightness to a different
       baseline for as long as the fill continues, and `countGridLines`' single
       whole-profile threshold (however it's computed) can't be simultaneously loose enough
       to catch a faint line sitting on a bright span and tight enough not to swallow an
       entire dim span as one giant false run. Confirmed directly: dumping the real row
       profile showed long flat plateaus at varying tones (255, then 229, then 199, then
       179...) each broken by small local dips — the dips (real lines) were still there,
       just riding on a drifting baseline no single cutoff can handle.
       **Fix**: `countGridLines` now does a rough global pass just to seed a pitch
       estimate, then one or more local passes (`countDarkRunsLocal`, using a rolling-max
       "what would this neighborhood look like without a line" background estimate)
       sized off that pitch, iterating up to 3 rounds since each round's improved count
       gives a better pitch/window-size estimate for the next. Verified against the real
       image: rows went from the original 12 (from 13 lines) to 21 (22 lines), cols from
       16 to 25 — both far closer to (and plausibly exactly at) the puzzle's true
       dimensions than before.
     - **Root cause: a scrollbar/UI-edge feature far from the grid, sharing a similar
       vertical extent, got merged into the same "vertical line family" as the real grid
       lines.** `clusterLinesBySpan` groups lines only by how similar their CROSS-axis span
       is (needed so a grid's own vertical lines cluster together regardless of exactly
       which x each sits at) — but nothing required cluster members to also sit near each
       other along their OWN axis, so an unrelated tall feature 50-60px past the true grid
       border got pulled in, dragging the detected rectangle's right edge out to x≈746
       instead of the true ≈688. **First fix attempt (splitting a cluster wherever any
       internal gap looked oversized) was itself wrong** — confirmed directly: the real
       cluster ALSO had several oversized internal gaps from the missing-line problem
       above, and splitting at every one of those fragmented the real grid's own cluster
       into pieces too small to clear `minLines`, producing ZERO candidates (worse than the
       bug being fixed). **Working fix**: `trimClusterEndOutliers` — only trims points from
       the two ENDS of a cluster's sorted position list while the boundary gap is a clear
       outlier, leaving every internal gap alone regardless of size. A genuinely unrelated
       feature is a minority sitting apart from the main mass, which in practice means
       isolated at one end (real lines flanking it on both sides is what an internal-gap
       fix would need, and doesn't have). Verified: the rogue line is now correctly
       trimmed, and the real grid cluster stays intact.
     - **End-to-end result against the actual screenshot, through the real wizard UI (not
       just the underlying functions): auto-detection now finds a rectangle that visually
       matches the true grid border on inspection, with a row/col suggestion of 21x26** —
       up from an unusable 5x9 before this investigation started. Not confirmed pixel-exact
       against whatever the puzzle's true dimensions are (still short by an unknown amount,
       possibly zero), but now within an easy manual correction rather than a full redo.
     - **New tests**: a regression test for the scrollbar/rogue-line scenario
       (`test/gridDetect.test.js`), confirming it's trimmed without fragmenting a real
       cluster. `npm test`: 465 passed, 0 failed.
     - **Still open**: whether 21x26 needs further manual correction to reach the puzzle's
       true dimensions is unconfirmed (the actual source app's true grid size was never
       independently verified against anything other than the project owner's own recall).
       If the project owner tries this again and the count is still off, the concrete next
       step is comparing the wizard's row/col suggestion against a manual count of the real
       puzzle, and reporting how far off — that tells us whether `countDarkRunsLocal`'s
       margin (currently 15) needs further adjustment, versus something else entirely.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid; the
  pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's grid
  detection — worth revisiting whether these share code once item 10 exists). Still open:
  is grid size user-adjustable at generation time or fixed per image; slider vs. automatic
  threshold/contrast tuning; reject, flag, or allow non-unique-solution puzzles (solver can
  validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a
  friends/share-by-code model. Schema and permissions are undesigned. The stats-tracking
  and cross-device pairing piece was pulled out into its own item, now confirmed done above
  — what's left here is the library/sharing side: puzzle storage, browsing, and whether
  stats become visible to friends.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` calls the `phraseHint` Cloud Function
  (`functions/index.js`) by default, with `defaultPhraser`'s old deterministic templates kept
  as the fallback for when that call fails — see the comment at the top of that file.
* Firebase project exists (`nonogram-pro-e8a31`). `firebase.json` / `.firebaserc` at the
  repo root declare Functions and Firestore (rules only). Deploy target for the static site
  stays Netlify regardless. Anonymous Auth + Firestore are in active use for item 4's
  stats/pairing; item 9's puzzle-library Firestore usage is still separate/later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* **Node.js 20→22 runtime bump — done and deployed.** Was a time-boxed fast-follow (Node 20
  decommissions 2026-10-30); bundled into the item-4 pass since that already touched
  `functions/`. See Completed Tasks above for what changed. No longer outstanding.
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
* Real audio files are in place in `assets/sounds/` (fill-click, x-click, drag-sweep,
  batch-complete-chime, error, complete-fanfare, lock, unlock) — no longer placeholder
  audio. The project owner may still iterate on individual files later, but as far as this
  project's build order is concerned, sound effects are done.
* Tesseract.js (OCR, item 10) is also loaded lazily from the CDN as an ES module
  (`src/ocr.js`), same no-bundler pattern as `src/firebase.js` — its ESM build has no named
  exports, only a default export bundling everything (`(await import(url)).default`).