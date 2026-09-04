// Solves a puzzle end-to-end using line techniques (technique 4's fixpoint loop) and,
// when that stalls, falling back to on-demand-style contradiction search repeatedly. This
// isn't exposed to players as a single button (contradiction search is on-demand, one
// step at a time, per the design) — it exists for testing solver correctness, and later
// for puzzle-generation uniqueness-checking and technique-based difficulty rating (both
// noted as open/deferred in the design spec).

import { Board } from './model.js';
import { solveToFixpoint, applyDeduction } from './solver.js';
import { findContradictionHint } from './contradiction.js';

export function solvePuzzleFully(puzzle, { maxContradictionSteps = 500 } = {}) {
  const board = new Board(puzzle.rows, puzzle.cols);
  board.hasHistory = false;
  const techniquesUsed = new Set();
  let steps = 0;

  while (true) {
    const { solved, contradiction, deductions, contradictionLine } = solveToFixpoint(board, puzzle, { recordHistory: false });
    for (const d of deductions) techniquesUsed.add(d.technique);
    // contradictionLine (see solver.js's solveToFixpoint) names the specific row/col that
    // became locally inconsistent once other lines' forced cells were applied to it — not a
    // certainty about which clue is actually wrong (several lines could each be "the" bad
    // one), but a genuine, solver-derived lead. Forwarded through so a caller that hits a
    // real contradiction (as opposed to a mere stall) has something more actionable than
    // "solved: false" to show — see src/scanUI.js's Current Objective #4 build-failure UI.
    if (contradiction) return { solved: false, contradiction: true, board, techniquesUsed, contradictionLine };
    if (solved) return { solved: true, contradiction: false, board, techniquesUsed };
    if (steps >= maxContradictionSteps) return { solved: false, contradiction: false, board, techniquesUsed, stalled: true };

    const hint = findContradictionHint(board, puzzle);
    if (!hint) return { solved: false, contradiction: false, board, techniquesUsed, stalled: true };
    techniquesUsed.add('contradiction');
    applyDeduction(board, hint, { recordHistory: false });
    steps++;
  }
}
