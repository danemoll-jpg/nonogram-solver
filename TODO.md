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
     yet deployed, transient error) so hints never go missing. **The function is written but
     not yet deployed — deploying it is the Current Objective below.**
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
  2. **Fixed: stray "TODO" text.** Was the page footer (`<footer class="footer">...on the
     roadmap — see README.md.</p></footer>` in `index.html`) — an internal dev note in
     player-facing UI, pointing at a file players don't have. Deleted, along with its now-
     unused `.footer` CSS. The unwanted-auto-scroll half didn't reproduce (no
     `scrollIntoView()`/`.focus()`/`autofocus` anywhere in the codebase); removing the
     footer removes one plausible scroll target regardless. **Re-open with repro steps
     (which puzzle, which action) if scrolling resurfaces.**
  3. **Added line locking on top of auto-X.** `isLineLocked(line, clue)` (`src/model.js`) =
     `isLineSatisfied` **and** fully marked (no UNKNOWN cells left) — satisfied alone isn't
     enough, since an empty clue (`[]`) reads as "satisfied" from its first all-UNKNOWN
     render, which would otherwise lock it before the player can X it out (regression-tested
     in `test/model.test.js`). Computed live off the board every render, same as
     `isLineSatisfied` — no persistent lock flag to keep in sync. `paintCell` blocks any
     change to a cell in a locked line, except clearing an existing FILLED cell back to
     UNKNOWN, which also reverts that line's auto-X'd cells (tracked in a new UI-local
     `autoXCells` set, distinguishing "auto-X put this here" from "the player deliberately
     X'd this") back to UNKNOWN in the same batched move — a deliberate manual X survives,
     an auto-X'd one doesn't.
  4. **Added red clue numbers for genuine contradictions.** Reused `isLineConsistent`
     (`src/lineSolver.js`, already a DP-based feasibility check, not brute force — was
     already exported but only used internally by `generalLineSolve`) — wired into
     `app.js`'s `syncAllCellVisuals` as a `.contradiction` class (red, `var(--danger)`) on
     the clue element. Confirmed a red line and a locked line never co-occur (as expected
     by construction), and red clears once the line becomes consistent again. Feedback
     only — never blocks the move that caused it.

  **Existing Firebase project config** (already created; used by `src/firebase.js` for the
  Cloud Function client, and later for Auth/Firestore in item 9):
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

Current Objective (Focus Area)

* **Deploy Firebase Cloud Function + wire up Netlify, so the app is testable on iPad.**
  Reordered ahead of the roadmap items below at the project owner's request — this unblocks
  real-device testing sooner rather than later.

  1. **Deploy the `phraseHint` Cloud Function.** Steps are already documented in
     `functions/README.md`: `firebase login`, `firebase functions:secrets:set
     ANTHROPIC_API_KEY`, `firebase deploy --only functions`. These require the project
     owner's own Firebase login/credentials and can't be run unattended — Code should walk
     the owner through running them (or run what it can and hand back the exact remaining
     commands), not attempt to complete the login step itself. Once deployed, hint phrasing
     should switch from the template fallback to real LLM output — verify this live rather
     than assuming from the deploy succeeding.
  2. **Wire up Netlify for auto-deploy from the repo.** `netlify.toml` (`publish = "."`)
     already exists per `CLAUDE.md`, but confirm whether the Netlify *site* itself is
     actually connected to auto-deploy from this GitHub repo, or whether that connection
     still needs to be made. Connecting a Netlify site to a GitHub repo requires the
     project owner's own Netlify login (same category of manual step as Firebase) — Code
     should verify the config is correct and walk the owner through the connection if it
     isn't already made, not attempt the login itself.
  3. Once both are live, confirm end-to-end on a real device (iPad): hint phrasing pulls
     real LLM output, and the deployed Netlify URL loads and plays correctly outside of
     local development.

  No application code changes are expected for this objective — it's deploy/config/
  infrastructure work, plus verification.

Next Steps (Do Not Start Yet)

* **Item 10 — Scan-existing-puzzle flow.** Rescoped to be self-contained rather than
  dependent on item 8: reading an already-printed/existing puzzle (real grid lines, printed
  clue numbers already visible in the photo) is closer to the "already-structured image"
  case than the "arbitrary photo, threshold and guess" case — so this item brings its own
  minimal grid-detection with it instead of waiting on item 8's harder image-processing
  work. Scope: detect the existing grid from a photo/scan, OCR the printed clue numbers,
  and a user-correction step for anything misread — feeding the result into the existing
  hint/solver system as a snapshot-origin puzzle (no move history, per the earlier
  mistake-handling design). This is now the next roadmap item after the current deploy
  objective above, per the project owner.
* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid; the
  pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's grid
  detection — worth revisiting whether these share code once item 10 exists). Still open:
  is grid size user-adjustable at generation time or fixed per image; slider vs. automatic
  threshold/contrast tuning; reject, flag, or allow non-unique-solution puzzles (solver can
  validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a friends/share-by-code model. Schema and permissions are undesigned. Now also scoped to include **persistent user stats bucketed by exact grid size** (puzzles solved, avg completion time, avg hints used) — ties to Firebase Auth, which this item needs regardless. Open questions: does a scanned/snapshot-origin puzzle (no reliable move history) count toward stats; are stats visible only to the player or also to friends.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` now calls the `phraseHint` Cloud Function
  (`functions/index.js`) by default, with `defaultPhraser`'s old deterministic templates kept
  as the fallback for when that call fails — see the comment at the top of that file.
* Firebase project exists (`nonogram-pro-e8a31`) — config above. `firebase.json` /
  `.firebaserc` at the repo root scope Firebase to Functions only (deploy target for the
  static site stays Netlify). Auth/Firestore for item 9 come later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Firestore security rules: **not** needed for the hint-phrasing function — it doesn't
  read/write Firestore. Real rules design (who can read/write puzzle documents, per-user
  stats write access, etc.) belongs to item 9 when it's scoped. Update `firestore.rules` only
  if/when Code identifies an actual read/write need.