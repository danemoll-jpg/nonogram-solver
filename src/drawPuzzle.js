// Orchestration for the "draw a puzzle" flow (TODO.md's Current Objective): turns a
// hand-drawn grid into a playable Puzzle, enforcing that its derived clues have exactly one
// solution before it's allowed to be saved/published. Pure data in, pure data out — no DOM
// here, same "each module does one job" split as scanPuzzle.js, this module's closest
// sibling: both turn a picture (a photo there, a hand-drawn grid here) into a real published
// puzzle via the same solver-backed validation step.

import { puzzleFromSolution } from './model.js';
import { solvePuzzleFully } from './fullSolve.js';

// A drawn grid with fewer filled cells than this can't be a real picture-revealing puzzle —
// guards against publishing a blank (or near-blank) grid, which is technically solvable and
// trivially "unique" (there's nothing to be ambiguous about) but pointless to play.
const MIN_FILLED_CELLS = 1;

// Builds and validates a puzzle from a hand-drawn solution grid (rows x cols of
// booleans — see model.js's cluesFromLine for the full set of accepted cell shapes).
//
// Unlike buildScannedPuzzle (scanPuzzle.js), the true solution is already known here — it's
// exactly what the player drew — so this never needs to re-solve clues to find *a* solution.
// What it needs to check instead is uniqueness: derive the clues from the drawing, then run
// the exact same solver scanned puzzles are already validated with (fullSolve.js's
// solvePuzzleFully, line techniques plus contradiction search) against ONLY those derived
// clues, with no peeking at the known solution.
//
// That check is a genuine uniqueness proof, not just a solvability check, because every
// technique solvePuzzleFully applies is SOUND — it only ever fixes a cell when every valid
// completion of the clues agrees on that cell. So reaching a fully-marked board
// (`solved: true`) proves the clues have exactly one solution: a second, different valid
// solution would mean two completions disagree on some cell, and neither value at that cell
// could ever be soundly forced, so full completion could never be reached by construction.
// See TODO.md's "draw a puzzle" item for the fuller version of this reasoning.
//
// A `result.contradiction` from solvePuzzleFully is not expected to be reachable here — the
// drawn grid is itself a valid completion of its own derived clues, so a genuine
// contradiction would mean a solver bug, not a real property of the drawing — but any
// non-solved result is treated the same way (reason: 'ambiguous') regardless, since that's
// the only outcome a caller actually needs to act on.
export function buildDrawnPuzzle({ id, name, grid }) {
  const filledCount = grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  if (filledCount < MIN_FILLED_CELLS) {
    return { solved: false, reason: 'empty' };
  }

  const draft = puzzleFromSolution({ id, name, solution: grid, source: 'drawn' });
  const result = solvePuzzleFully(draft);
  if (!result.solved) {
    return { solved: false, reason: 'ambiguous' };
  }
  return { solved: true, puzzle: draft };
}
