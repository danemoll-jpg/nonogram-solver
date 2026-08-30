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
     **Known bug — see Current Objective below: this check doesn't run on the
     hint-application path, only on manual marking.**
  4. Auto-check mistake pop-up anchored to the board panel (`#mistake-popup` /
     `.mistake-popup` in `index.html` / `styles.css`) with Dismiss and Learn More; Learn
     More reuses the existing on-demand-check flow (`runOnDemandCheck` in `app.js`, backed
     by `mistakes.js`) rather than a new explanation path.
  5. Puzzle-complete modal (`#complete-modal`) showing time taken, hints used, and mistakes
     made — all derived from `board.history` at completion time (`computeCompletionStats`
     in `app.js`): hint-originated moves are tagged `source: 'hint'` by `applyDeduction`
     (`solver.js`), and any historical cell-write that disagreed with the solution counts as
     a caught mistake. No new persistence or live counters needed.
  6. Real LLM-backed hint phrasing — `src/hintPhrasing.js` now calls a Firebase Cloud
     Function (`functions/index.js`, callable `phraseHint`) via `src/firebase.js`, falling
     back to the old deterministic template if the call fails for any reason (offline, not
     yet deployed, transient error) so hints never go missing. **The function is written but
     not yet deployed** — see `functions/README.md` for the one-time `firebase login` /
     `functions:secrets:set ANTHROPIC_API_KEY` / `firebase deploy --only functions` steps,
     which need the project owner's Firebase credentials and aren't something this
     environment can run unattended.

Current Objective (Focus Area)

* **UI consolidation pass + auto-X bug fix.** Playing the item 7 UI surfaced real
  usability problems, especially bad in portrait (buttons pushed offscreen), plus one
  regression bug in the already-shipped item 7.3 auto-X logic:

  1. **Single "Help" dropdown, replacing the separate button panels.** One trigger button
     replaces the current "Hints & help" panel (`Get a hint`) and "Mistakes" panel
     (`Check my work`, `Remove bad marks`), reclaiming the vertical space both panels take.
     Menu items, in order:
     - **How to play** — opens an info screen/overlay with instructions, consistent with
       the "How to play" pattern used in your other apps (not a toggle of the existing
       bottom panel — that panel's current instructional content should move into this
       screen instead, then the bottom panel can go away or be repurposed for the
       explanation panel in item 2 below).
     - **Get a hint**
     - **Check my work**
     - **Remove bad marks**
     - **Clear all** — this is the *existing* Reset button/behavior, just relocated into
       the dropdown instead of its own always-visible button. Keep (or add, if not already
       present) a confirmation step before it fires, since it clears history and isn't
       recoverable via undo.
  2. **Persistent bottom-anchored explanation panel.** Hint reasoning and "Learn more"
     mistake explanations currently render somewhere below the fold with no indication
     they're there — a real bug independent of the redesign. Replace with a single
     explanation panel fixed within the visible viewport (not below it), always in the same
     location, showing: the current hint's reasoning when "Get a hint" is used, and the
     mistake explanation when "Learn more" is used from the auto-check pop-up. One shared
     surface for both — no scrolling required to see either.
  3. **Bug: hint-triggered line completion doesn't auto-X.** Manually filling a line's
     last required cell correctly triggers auto-X (item 7.3) via `autoXCellsFor` in
     `app.js`. Applying a hint that completes a line the same way does not —
     `applyDeduction` in `solver.js` isn't invoking the same post-change check that manual
     marking goes through. Fix so both paths run the same completion check.

  Items 1–2 are a layout/consolidation pass (mostly `index.html` / `app.js` /
  `styles.css`); item 3 is a targeted bug fix in the hint-application path. No data model
  or solver changes expected.

  (Cloud Function deploy for item 7.6 is still a manual step pending the project owner's
  Firebase credentials — see Technical Notes below. Unrelated to this objective.)

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