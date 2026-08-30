# Active Development Plan

## Completed Tasks
- [x] Data model — cell states, clue derivation, `Board` w/ move history (`src/model.js`)
- [x] Line-solving engine: overlap, edge/completion, general/gap-forcing + cross-line
      propagation (`src/lineSolver.js`, `src/solver.js`)
- [x] Hint orchestration — one structured deduction per technique application
- [x] Mistake handling: auto-check, on-demand check w/ undo-to-point, remove-bad-marks
      (`src/mistakes.js`)
- [x] On-demand contradiction search for genuinely stuck states (`src/contradiction.js`)
- [x] Full playable UI — click/right-click/drag marking, clue graying, hint highlighting
      (`index.html`, `app.js`, `styles.css`)
- [x] 425-test suite, incl. a brute-force differential test of the line solver
- [x] `CLAUDE.md` project context file

## Current Objective (Focus Area)
- [ ] Nothing actively in progress. Waiting on a decision for which deferred item (below)
      to design and build next.

## Next Steps (Do Not Start Yet)
- [ ] Item 8 — Photo → puzzle generation: image processing (grayscale/threshold,
      adjustable grid size), clue derivation, and puzzle-uniqueness checking (the solver
      can validate uniqueness once generation exists).
- [ ] Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a
      friends/share-by-code model. Schema and permissions are undesigned.
- [ ] Item 10 — Scan-existing-puzzle flow: reuse item 8's grid pipeline + OCR for clue
      numbers, plus a user-correction step, feeding into the existing hint/solver system.
- [ ] Real LLM-backed hint phrasing: replace the template placeholder in
      `src/hintPhrasing.js` with a backend call (e.g. a Firebase Cloud Function, so the
      API key isn't exposed client-side).

## Technical Notes / Blockers
- `phraseDeduction()` in `src/hintPhrasing.js` is a deterministic template placeholder,
  not a real LLM call — see that file's header comment for the intended swap-in point.
- No backend exists yet. Firebase (Auth/Firestore/Storage) is the planned choice per the
  design spec, but nothing is wired up.
- No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
