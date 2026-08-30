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

Current Objective (Focus Area)

* **Puzzle UI refinement pass.** The playable UI works but has usability gaps found during real play. Implement all five of the following (all in the existing `index.html` / `app.js` / `styles.css`, no data model or solver changes required):
  1. **Fill/X mode toggle, replacing right-click/long-press.** Add a visible mode control (Fill vs. Mark-empty/X), defaulting to **Fill**. A click applies the active mode's mark; clicking an already-marked cell in that state clears it to unknown. A drag paints a stroke of cells using whatever action the *first* cell in the drag performed (fill or clear), so a drag never produces mixed/inconsistent results across cells in different starting states.
  2. **5×5 grid chunking.** Add a visually thicker/darker border every 5 rows and every 5 columns, on top of the existing thin cell borders, for any puzzle size (a trailing partial chunk at the edge just contains whatever cells remain — no special-casing). Pure CSS/rendering change.
  3. **Solver-based auto-X on line completion.** When a row or column's placed fills, combined with its clue, force every remaining unknown cell in that line to be empty (per the existing line-solver check — not a simple fill-count check, to avoid auto-completing a wrong arrangement that happens to have the right count), place X marks on those remaining cells automatically. Batch these auto-placed X's into the single move that triggered them in the undo history, so undo-to-point doesn't leave a line half-auto-marked.
  4. **Auto-check error pop-up.** When auto-check is on and a mark is placed that doesn't match the solution, show a compact pop-up near the grid (not a below-the-fold message) with two actions: **Dismiss** (closes it, mark is left as-is) and **Learn more** (invokes the existing on-demand-check explanation flow — reuse `src/mistakes.js`, don't build a new explanation path).
  5. **Puzzle-complete notification with stats.** On full puzzle completion, show a clear "solved" notification with: time taken, hints used (count), and mistakes made (count of wrong marks caught by auto-check or on-demand check) — all derivable from the existing per-puzzle move history. No persistence/backend needed for this.
  6. **Real LLM-backed hint phrasing.** Replace the deterministic template in `src/hintPhrasing.js`'s `phraseDeduction()` with a real call to an LLM, via a **Firebase Cloud Function** (the Firebase project already exists — see config below — this just adds a Function to it). The client sends the structured deduction object (technique, reasoning cells, result cells, result state) to the Function; the Function calls the LLM API (holding the API key server-side, never in client code) and returns the phrased hint text. This is separate infrastructure from the other five UI-only items, so sequence it after them: land the self-contained front-end fixes first, then wire up the Function.

  **Existing Firebase project config** (already created, ready to use for the Cloud Function's project and later for Auth/Firestore in item 9):
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
  Note: this config's `apiKey` is a normal public Firebase web-app identifier, not a secret — safe to check in. The LLM provider's API key is the one that must stay server-side inside the Cloud Function only.

Next Steps (Do Not Start Yet)

* Item 8 — Photo → puzzle generation: image processing (grayscale/threshold, adjustable grid size), clue derivation, and puzzle-uniqueness checking (the solver can validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a friends/share-by-code model. Schema and permissions are undesigned. Now also scoped to include **persistent user stats bucketed by exact grid size** (puzzles solved, avg completion time, avg hints used) — ties to Firebase Auth, which this item needs regardless. Open questions: does a scanned/snapshot-origin puzzle (no reliable move history) count toward stats; are stats visible only to the player or also to friends.
* Item 10 — Scan-existing-puzzle flow: reuse item 8's grid pipeline + OCR for clue numbers, plus a user-correction step, feeding into the existing hint/solver system.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` is a deterministic template placeholder — being replaced by a real LLM call this pass (item 6 above), via a Firebase Cloud Function so the LLM provider's API key stays server-side.
* Firebase project now exists (`nonogram-pro-e8a31`) — config above. Cloud Function for hint phrasing is the first thing to wire up on it; Auth/Firestore for item 9 come later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* Firestore security rules: likely **not** needed for item 6 (hint phrasing) — a Cloud Function returning phrased text typically doesn't read/write Firestore, so this is more a Function-deploy + API-key-env-var task than a rules change. Real rules design (who can read/write puzzle documents, per-user stats write access, etc.) belongs to item 9 when it's scoped. Update `firestore.rules` only if/when Code identifies an actual read/write need.