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
    const { solved, contradiction, deductions } = solveToFixpoint(board, puzzle, { recordHistory: false });
    for (const d of deductions) techniquesUsed.add(d.technique);
    if (contradiction) return { solved: false, contradiction: true, board, techniquesUsed };
    if (solved) return { solved: true, contradiction: false, board, techniquesUsed };
    if (steps >= maxContradictionSteps) return { solved: false, contradiction: false, board, techniquesUsed, stalled: true };

    const hint = findContradictionHint(board, puzzle);
    if (!hint) return { solved: false, contradiction: false, board, techniquesUsed, stalled: true };
    techniquesUsed.add('contradiction');
    applyDeduction(board, hint, { recordHistory: false });
    steps++;
  }
}
