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
     UI consolidation pass below.) **Line-locking is being added on top of this — see
     Current Objective below — auto-X itself is unchanged.**
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
     not yet deployed** — see `functions/README.md` for the one-time `firebase login` /
     `functions:secrets:set ANTHROPIC_API_KEY` / `firebase deploy --only functions` steps,
     which need the project owner's Firebase credentials and aren't something this
     environment can run unattended.
* **UI consolidation pass + auto-X-on-hint fix.** All three sub-items landed:
  1. Single "Help" dropdown (`#help-menu-btn` / `#help-menu-list`) replaces the old
     always-visible "Hints & help" / "Mistakes" side panels — those pushed content offscreen
     in portrait. Menu items: How to play, Get a hint, Check my work, Remove bad marks,
     Clear all (the old Reset button, relocated behind a `window.confirm`). "Dig deeper"
     stays a conditional follow-up button next to the explanation panel, not a menu item.
     **Bug found post-ship: Clear all does nothing when clicked — see Current Objective.**
  2. Persistent bottom-anchored explanation panel (`#explain-panel`, `setExplain()` in
     `app.js`) — `position: fixed` to the viewport bottom, `body` reserves matching
     `padding-bottom`. One shared surface for hint reasoning and mistake explanations.
     **Bug found post-ship: a stray "TODO" placeholder and unwanted scroll-into-view
     behavior around this panel and the page header — see Current Objective.**
  3. Auto-X now runs on the hint path too, via `app.js`'s `withAutoX(changes)` /
     `applyHintDeduction` — both manual marks and hint deductions batch into one history
     entry so undo-to-point works for either. `solver.js`'s `applyDeduction` is untouched
     (still used by `solveToFixpoint`), per CLAUDE.md's "solver only produces facts" rule.

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

* **Post-ship bug fixes: Clear All, stray scroll/TODO text, line locking, and red
  (contradiction) numbers.** Found by playing the UI consolidation pass build:

  1. **Bug: "Clear all" does nothing.** The dropdown menu item isn't wired to the existing
     reset/confirm logic — trace why the click handler isn't firing (listener not attached
     to the new menu item, or attached before the item existed in the DOM) and fix so it
     behaves like the old Reset button did (with its `window.confirm` guard intact).

  2. **Bug: stray "TODO" text + unwanted auto-scrolling.** There's leftover literal "TODO"
     placeholder content still in the page, and the game auto-scrolls to the top (logo) or
     bottom (likely toward that same stray element) at points during play — this is a
     `scrollIntoView()` / `.focus()`-triggered-scroll bug, not a layout-shift bug. The
     persistent bottom explanation panel itself is fine as-is and shouldn't change. Fix:
     find and remove the unintended scroll-into-view/focus calls (likely tied to whatever
     renders that stray TODO element), and delete the leftover TODO placeholder entirely.

  3. **Add line locking on top of auto-X.** Once a row/column's filled cells exactly match
     its clue (the existing solver satisfaction check — same one that currently drives
     clue-graying), auto-X still fires as it does today (`autoXCellsFor`/`withAutoX` fills
     the line's remaining unknown cells with X) — that behavior is unchanged. What's new:
     once that line is fully marked (fills + auto-X'd X's covering every cell), the line
     **locks** — no further changes to any cell in that line are allowed, with one
     exception: clicking an existing **filled** cell in that line still clears it back to
     unknown. Clearing a fill un-satisfies the line, which should also **revert that line's
     auto-X'd cells back to unknown** (they were only valid while the line was complete)
     and make the line editable again. So the sequence per line is: fill → auto-X fires →
     line locks; unfill a cell → auto-X'd cells revert → line unlocks.

  4. **Add red clue numbers for genuine contradictions.** Separate from locking/overfill:
     a line can become *unsatisfiable* before it's ever full — e.g. a clue of `[2, 3]`
     where a run of 4 gets placed instead of 3, or where three runs (`2, 1, 3`) exist
     against a two-number clue. This needs a real satisfiability check — given the line's
     current fixed cells (filled/empty/unknown), does *any* arrangement still exist that
     matches the clue? If none exists, that line's clue numbers turn red. This is **not**
     the same logic as the existing overlap-technique hint code — implement it as a
     standard line-fitting DP (`O(cells × clue-numbers)`), not brute-force enumeration,
     since longer lines would make brute force too slow. Unlike locking, **red is
     feedback only — it does not block the move that caused it**; the player can place the
     invalid cell, see it flagged red, and fix it themselves. A locked (exactly-satisfied)
     line and a red (contradictory) line are mutually exclusive by construction — a
     contradictory line can't reach exact satisfaction while still contradictory, so no
     special-casing should be needed between the two states, but call this out for review
     once both are implemented in case an edge case surfaces.

  No data model changes expected beyond what `Board`/`setBatch` already support; this is
  solver-adjacent logic (the new satisfiability check) plus UI wiring (locking, red state,
  the two bug fixes).

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation. Two distinct upload paths, worth keeping separate
  rather than solving as one problem:
  - **Pre-pixelated/blocky image → direct mapping.** An image that's already in blocky/
    pixel-art form (e.g. a sprite or something deliberately made blocky) maps directly:
    detect (or let the user specify) the grid dimensions, read each block's color/darkness,
    no thresholding judgment calls needed. Much simpler — a reasonable first pass.
  - **Arbitrary photo → thresholded/downsampled grid.** A normal photo needs real image
    processing: grayscale/threshold, adjustable grid size, downsampling — inherently
    lossy/interpretive since there's no existing grid to read.
  - Both paths converge on the same output (a grid + derived clues) and both need
    puzzle-uniqueness checking (the solver can validate this once generation exists) —
    still open: is grid size user-adjustable at generation time or fixed per image; for the
    arbitrary-photo path, slider vs. automatic threshold/contrast tuning; reject, flag, or
    allow non-unique-solution puzzles.
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