// Item 6: contradiction search. Only ever run on-demand (the player explicitly asks for
// help while stuck) — never automatically, since it's a hypothesize-and-propagate search
// rather than a cheap line-local deduction.
//
// For each unknown cell, in turn: hypothesize it FILLED, propagate with the normal line
// techniques (solveToFixpoint), and see if that hypothesis makes some line impossible. If
// so, the cell must really be EMPTY (and vice versa). Returns the first such forced cell
// found, in the same deduction shape the line solver produces, so it flows through the
// same hint-highlighting and phrasing pipeline.

import { UNKNOWN, FILLED, EMPTY } from './model.js';
import { solveToFixpoint } from './solver.js';

export function findContradictionHint(board, puzzle) {
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      if (board.get(r, c) !== UNKNOWN) continue;
      const filled = tryHypothesis(board, puzzle, r, c, FILLED);
      if (filled) return filled;
      const empty = tryHypothesis(board, puzzle, r, c, EMPTY);
      if (empty) return empty;
    }
  }
  return null; // genuinely stuck even with contradiction search — needs real trial-and-error
}

function tryHypothesis(board, puzzle, row, col, hypothesisState) {
  const scratch = board.clone();
  scratch.hasHistory = false;
  scratch.set(row, col, hypothesisState, { recordHistory: false });
  const result = solveToFixpoint(scratch, puzzle, { recordHistory: false });
  if (!result.contradiction) return null;

  const forcedState = hypothesisState === FILLED ? EMPTY : FILLED;
  return {
    technique: 'contradiction',
    line: result.contradictionLine ?? null,
    reasoningCells: [{ row, col }],
    resultCells: [{ row, col }],
    resultState: forcedState,
    meta: { hypothesis: hypothesisState, forced: forcedState },
  };
}
