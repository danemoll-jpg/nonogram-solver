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
     multiple cells), so undo-to-point removes a move's auto-X marks along with it. See
     `model.js`'s class comment and the new `Board.setBatch` tests in `test/model.test.js`.
     (Originally only ran on manual marking, not the hint-application path — fixed as part
     of the UI consolidation pass below, see its sub-item 3.)
  4. Auto-check mistake pop-up anchored to the board panel (`#mistake-popup` /
     `.mistake-popup` in `index.html` / `styles.css`) with Dismiss and Learn More; Learn
     More reuses the existing on-demand-check flow (`runOnDemandCheck` in `app.js`, backed
     by `mistakes.js`) rather than a new explanation path.
  5. Puzzle-complete modal (`#complete-modal`) showing time taken, hints used, and mistakes
     made — all derived from `board.history` at completion time (`computeCompletionStats`
     in `app.js`): hint-originated moves are tagged `source: 'hint'` (now by `app.js`'s
     `applyHintDeduction`, see the UI consolidation pass below), and any historical
     cell-write that disagreed with the solution counts as a caught mistake. No new
     persistence or live counters needed.
  6. Real LLM-backed hint phrasing — `src/hintPhrasing.js` now calls a Firebase Cloud
     Function (`functions/index.js`, callable `phraseHint`) via `src/firebase.js`, falling
     back to the old deterministic template if the call fails for any reason (offline, not
     yet deployed, transient error) so hints never go missing. **The function is written but
     not yet deployed** — see `functions/README.md` for the one-time `firebase login` /
     `functions:secrets:set ANTHROPIC_API_KEY` / `firebase deploy --only functions` steps,
     which need the project owner's Firebase credentials and aren't something this
     environment can run unattended.
* **UI consolidation pass + auto-X bug fix.** All three sub-items landed:
  1. **Single "Help" dropdown** (`#help-menu-btn` / `#help-menu-list` in `index.html`,
     wired in `app.js`'s "Help dropdown" section) replaces the old always-visible
     "Hints & help" / "Mistakes" side-panel blocks — those pushed content offscreen in
     portrait. Menu items: How to play, Get a hint, Check my work, Remove bad marks, and
     Clear all (the old Reset button, relocated; now behind a `window.confirm` since it
     clears history with no undo). "Dig deeper" stays a conditional follow-up button next
     to the explanation panel rather than a menu item, since it only appears after a
     "no forced move" hint result.
  2. **Persistent bottom-anchored explanation panel** (`#explain-panel` in `index.html`,
     `setExplain()` in `app.js`) — `position: fixed` to the viewport bottom, `body` reserves
     matching `padding-bottom` so it never covers the board or footer. One shared surface
     for hint reasoning (Get a hint) and mistake explanations (Check my work / Learn more),
     replacing the old `#hint-text` / `#mistake-text` elements that could render below the
     fold with no indication they were there.
  3. **Auto-X now runs on the hint path too.** `autoXCellsFor` (single-cell, pre-board-write
     lookahead) generalized into `app.js`'s `withAutoX(changes)`, which takes a batch of
     pending `{row,col,state}` writes — covers both a single manual mark and a multi-cell
     hint deduction (a hint can fill several cells across several lines at once) — and
     checks every row/col touched by a new FILLED cell for satisfaction. `applyHintDeduction`
     (new, `app.js`) applies a deduction's result cells through `withAutoX` before calling
     `board.setBatch`, same as `paintCell` does for manual marks, so both paths batch into
     one history entry and undo-to-point removes a hint's auto-X marks along with it.
     `solver.js`'s `applyDeduction` is untouched (still used by `solveToFixpoint`, which
     doesn't need the auto-X convenience) — the fix stayed UI-side, matching CLAUDE.md's
     "solver only produces facts" rule.

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

* None picked yet. The UI consolidation pass above is done and tested (430/430,
  `npm test`) and verified in-browser (dropdown, How to play modal, hint auto-X across
  crossing columns, mistake pop-up → Learn more → persistent panel, portrait layout with
  no offscreen controls). Next up is picking one of the deferred items below, or the
  Cloud Function deploy step in Technical Notes.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation: image processing (grayscale/threshold, adjustable grid size), clue derivation, and puzzle-uniqueness checking (the solver can validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a friends/share-by-code model. Schema and permissions are undesigned. Now also scoped to include **persistent user stats bucketed by exact grid size** (puzzles solved, avg completion time, avg hints used) — ties to Firebase Auth, which this item needs regardless. Open questions: does a scanned/snapshot-origin puzzle (no reliable move history) count toward stats; are stats visible only to the player or also to friends.
* Item 10 — Scan-existing-puzzle flow: reuse item 8's grid pipeline + OCR for clue numbers, plus a user-correction step, feeding into the existing hint/solver system.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` now calls the `phraseHint` Cloud Function
  (`functions/index.js`) by default, with `defaultPhraser`'s old deterministic templates kept
  as the fallback for when that call fails — see the comment at the top of that file.
* **The Cloud Function is written but not deployed yet** — deploying it needs the project
  owner's `firebase login` and an `ANTHROPIC_API_KEY` secret, neither of which this
  environment can do unattended. See `functions/README.md` for the exact steps. Until it's
  deployed, hints keep working via the template fallback (an expected, harmless console
  warning logs each time).
* Firebase project now exists (`nonogram-pro-e8a31`) — config above. `firebase.json` /
  `.firebaserc` at the repo root scope Firebase to Functions only (deploy target for the
  static site stays Netlify, per `CLAUDE.md`). Auth/Firestore for item 9 come later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Firestore security rules: **not** needed for the hint-phrasing function — it doesn't
  read/write Firestore. Real rules design (who can read/write puzzle documents, per-user
  stats write access, etc.) belongs to item 9 when it's scoped. Update `firestore.rules` only
  if/when Code identifies an actual read/write need.