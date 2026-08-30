// Hint orchestration: turns the line-solving techniques into the structured deduction
// objects the rest of the app (UI highlighting, hint phrasing) consumes, and drives the
// "solve line, propagate to the crossing lines, repeat" loop (technique 4).
//
// A deduction looks like:
//   {
//     technique: 'overlap' | 'edge' | 'gap-forcing',
//     line: { type: 'row' | 'col', index },
//     reasoningCells: [{ row, col }, ...],
//     resultCells: [{ row, col }, ...],
//     resultState: 'filled' | 'empty',
//     meta: { clue, length, ... },   // extra context for the phrasing layer
//   }
// This solver only ever produces facts; hintPhrasing.js turns one into player-facing text.

import { UNKNOWN, FILLED, EMPTY } from './model.js';
import { overlapForcedCells, edgeCompletionDeductions, generalLineSolve, isLineConsistent } from './lineSolver.js';

function cellsForLine(type, index, indices) {
  return indices.map((i) => (type === 'row' ? { row: index, col: i } : { row: i, col: index }));
}

// Apply techniques 1 -> 2 -> 3, cheapest first, to a single line. Returns one deduction
// (batching every cell that technique resolves) or null if the line yields nothing yet.
export function solveLineOnce(type, index, line, clue) {
  // Gate on overall consistency first, cheaply — this catches a contradiction even in a
  // line that's already fully marked (and so has no UNKNOWN cells left to search from).
  if (!isLineConsistent(line, clue)) {
    return {
      technique: 'contradiction-in-line',
      line: { type, index },
      reasoningCells: [],
      resultCells: [],
      resultState: null,
      meta: { clue, length: line.length },
      invalid: true,
    };
  }
  if (line.every((c) => c !== UNKNOWN)) return null; // fully marked and consistent — nothing to do

  const overlap = overlapForcedCells(line.length, clue).filter((o) => line[o.index] === UNKNOWN);
  if (overlap.length > 0) {
    const indices = overlap.map((o) => o.index);
    return {
      technique: 'overlap',
      line: { type, index },
      reasoningCells: [],
      resultCells: cellsForLine(type, index, indices),
      resultState: FILLED,
      meta: { clue, length: line.length },
    };
  }

  const edges = edgeCompletionDeductions(line, clue);
  if (edges.length > 0) {
    const first = edges[0];
    return {
      technique: 'edge',
      line: { type, index },
      reasoningCells: cellsForLine(type, index, first.reasoning),
      resultCells: cellsForLine(type, index, [first.index]),
      resultState: EMPTY,
      meta: { clue, length: line.length, runLength: first.reasoning.length },
    };
  }

  const { valid, forced } = generalLineSolve(line, clue);
  if (!valid) {
    return {
      technique: 'contradiction-in-line',
      line: { type, index },
      reasoningCells: [],
      resultCells: [],
      resultState: null,
      meta: { clue, length: line.length },
      invalid: true,
    };
  }
  if (forced.length > 0) {
    const filled = forced.filter((f) => f.state === FILLED).map((f) => f.index);
    const empties = forced.filter((f) => f.state === EMPTY).map((f) => f.index);
    const indices = filled.length > 0 ? filled : empties;
    const state = filled.length > 0 ? FILLED : EMPTY;
    const knownCells = [];
    for (let i = 0; i < line.length; i++) if (line[i] !== UNKNOWN) knownCells.push(i);
    return {
      technique: 'gap-forcing',
      line: { type, index },
      reasoningCells: cellsForLine(type, index, knownCells),
      resultCells: cellsForLine(type, index, indices),
      resultState: state,
      meta: { clue, length: line.length },
    };
  }

  return null;
}

// Scan rows then columns (skipping already-fully-known lines) for the first line a
// technique can resolve. This is what "one hint" delivers.
export function getNextHint(board, puzzle) {
  // A contradiction here means the board (not the puzzle) is already wrong — that's
  // mistakes.js's job to surface, not a hint, so skip past it and keep looking.
  for (let r = 0; r < puzzle.rows; r++) {
    const d = solveLineOnce('row', r, board.getRow(r), puzzle.rowClues[r]);
    if (d && !d.invalid) return d;
  }
  for (let c = 0; c < puzzle.cols; c++) {
    const d = solveLineOnce('col', c, board.getCol(c), puzzle.colClues[c]);
    if (d && !d.invalid) return d;
  }
  return null; // no forced move — the "stuck" state
}

// Mutates `board` to apply a deduction's result cells. Pass recordHistory:false for
// scratch boards (contradiction-search hypotheses) that shouldn't touch real move history.
export function applyDeduction(board, deduction, opts = {}) {
  if (!deduction || deduction.resultState == null) return;
  for (const { row, col } of deduction.resultCells) {
    board.set(row, col, deduction.resultState, opts);
  }
}

// Technique 4: cross-line propagation. Repeatedly solves every row/col that changed
// (or all of them, the first pass) until a full pass finds nothing new. Used internally
// for full-solve / solvability checks and as the propagation step inside contradiction
// search — NOT used directly for single-hint delivery (see getNextHint for that).
// Returns { solved, contradiction, deductions }.
export function solveToFixpoint(board, puzzle, opts = {}) {
  const deductions = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < puzzle.rows; r++) {
      const d = solveLineOnce('row', r, board.getRow(r), puzzle.rowClues[r]);
      if (!d) continue;
      if (d.invalid) return { solved: false, contradiction: true, contradictionLine: d.line, deductions };
      applyDeduction(board, d, opts);
      deductions.push(d);
      changed = true;
    }
    for (let c = 0; c < puzzle.cols; c++) {
      const d = solveLineOnce('col', c, board.getCol(c), puzzle.colClues[c]);
      if (!d) continue;
      if (d.invalid) return { solved: false, contradiction: true, contradictionLine: d.line, deductions };
      applyDeduction(board, d, opts);
      deductions.push(d);
      changed = true;
    }
  }
  return { solved: board.isComplete(), contradiction: false, deductions };
}
