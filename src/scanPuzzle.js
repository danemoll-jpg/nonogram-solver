// Orchestration for the scan-existing-puzzle flow (item 10): turns confirmed clue text into
// a playable Puzzle. Pure data in, pure data out — no DOM/canvas/OCR here, so it's
// unit-testable the same way the rest of src/ is (see test/scanPuzzle.test.js), matching
// CLAUDE.md's "each module does one job" rule. The OCR call itself lives in src/ocr.js and
// the DOM/canvas wiring in src/scanUI.js; this module is what sits between them and the
// solver.

import { makePuzzle, FILLED } from './model.js';
import { solvePuzzleFully } from './fullSolve.js';

// Parses one clue strip's OCR text into a clue array, e.g. "3 1 2" -> [3, 1, 2],
// "3,1,2" -> [3, 1, 2] (a stacked column clue OCRs with newlines between numbers, which
// \d+ matching handles the same as spaces), "" -> [] (an all-empty line's clue, per
// model.js's cluesFromLine convention — not [0]). A stray "0" some OCR misreads produce
// isn't a valid clue value on its own, so it's dropped rather than kept as noise.
export function parseClueText(text) {
  if (!text) return [];
  const matches = text.match(/\d+/g);
  if (!matches) return [];
  return matches.map((n) => parseInt(n, 10)).filter((n) => n > 0);
}

// Builds and validates a scanned puzzle from confirmed row/col clue arrays. A scanned
// puzzle doesn't come with a known solution the way an authored one does (see model.js's
// makePuzzle) — but mistakes.js's mistake-checking tools (autoCheckMark, checkForMistakes,
// removeBadMarks) all require one, so we derive it by solving the clues ourselves via
// src/fullSolve.js. A real published puzzle's clues have a unique solution by construction;
// if the solver can't reach one, that's a strong signal the OCR (or a not-yet-fixed
// correction) still has an error somewhere, surfaced back as { solved: false } so the
// wizard can send the user back to fix clue text and retry rather than handing them an
// unplayable board.
//
// Note on uniqueness: solvePuzzleFully's contradiction-search fallback proves *a* valid
// completion exists, not that it's the *only* one — full uniqueness-proving is out of scope
// here (see TODO.md item 8's note on solver-based uniqueness checking for generated
// puzzles). For a photo of an already-published puzzle this is an acceptable gap: those are
// vanishingly unlikely to be genuinely ambiguous, so a solve failure in practice means a
// misread clue, not real ambiguity.
export function buildScannedPuzzle({ id, name, rows, cols, rowClues, colClues }) {
  const draft = makePuzzle({ id, name, rows, cols, rowClues, colClues, solution: null, source: 'scan' });
  const result = solvePuzzleFully(draft);
  if (!result.solved) {
    // contradictionLine (see fullSolve.js/solver.js) is only ever present alongside
    // reason:'contradiction' — a genuine solver dead-end, not just a stall — and is what
    // powers the scan wizard's tier-2 "best-effort" build-failure lead (Current Objective #4,
    // see src/scanUI.js's showBuildFailure).
    return { solved: false, reason: result.contradiction ? 'contradiction' : 'stalled', contradictionLine: result.contradictionLine ?? null };
  }
  const solution = result.board.grid.map((row) => row.map((cell) => cell === FILLED));
  return { solved: true, puzzle: { ...draft, solution } };
}
