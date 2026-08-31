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

Current Objective (Focus Area)

* **Redesign "Scan a puzzle" grid selection: auto-detect first, highlight for
  confirmation, with manual drag as fallback — this also fixes the missing-confirm-button
  bug found on real-device testing.** The original flow (drag a box, then "detect the
  grid") is being found to have no working way to proceed after the drag — see the bug
  found below. Rather than just patching that missing button, redesign the step itself:
  1. **On image load, auto-run grid detection immediately** — no manual drag required
     first. Search the whole image for the most likely grid rectangle (extending the
     existing line-counting/border-intensity heuristics in `gridDetect.js` from
     "refine a user-given rectangle" to "find the best candidate across the full image").
     **Real risk worth designing around**: the project owner's actual use case is
     screenshots (not photos of printed puzzles), which likely contain other rectangular
     UI elements — app chrome, buttons, other panels — that could be mistaken for the
     puzzle grid if the search isn't reasonably selective (e.g. favoring the largest,
     most regular/evenly-subdivided candidate rectangle, and requiring some minimum
     confidence before accepting one automatically).
  2. **Highlight the detected rectangle as an overlay on the image**, with draggable
     corner/edge handles so the user can nudge it if it's slightly off, rather than
     drawing a box from scratch.
  3. **Explicit "Looks good" / "Confirm" button to proceed** — this is the actual fix for
     the missing-action bug below: there is always a clear, visible, real action to
     trigger next (grid-line counting → row/col confirmation → OCR), whether the user
     just accepted the auto-detected rectangle or adjusted it first.
  4. **Fallback to manual drag-to-select** (today's existing flow) if auto-detection finds
     no confident candidate — same confirm button applies either way, so this isn't a
     second, separately-fragile path.

  **Bug this replaces/fixes: "Scan a puzzle" wizard has no way to proceed after drawing
  the grid-selection box.** Found by the project owner testing the deployed item 10 flow
  against a real screenshot on iPad (their actual use case) — the very case that hadn't
  been tried yet during development. After completing the manual drag, nothing happened:
  no visible "Detect Grid"/confirm button, no loading state, no error. Confirmed this
  isn't a hidden/offscreen-button issue (a known failure mode earlier in this project) —
  the modal traps focus, and no button is visible regardless of scrolling. Likely means
  the drag-completion handler was never actually wired to a rendered button in
  `scanUI.js`, despite working in the synthetic-image browser test during development —
  worth checking whether that test drove the flow programmatically rather than by
  clicking an actual rendered button, which would explain how this slipped through.
  **Verify the fix with a real screenshot** (the project owner's actual use case), not
  another synthetic image.

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