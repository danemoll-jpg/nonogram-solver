import { describe, test, assert } from './harness.js';
import { Board } from '../src/model.js';
import { getNextHint } from '../src/solver.js';
import { findContradictionHint } from '../src/contradiction.js';
import { solvePuzzleFully } from '../src/fullSolve.js';

describe('contradiction search', () => {
  test('never invents a forced move for a genuinely ambiguous puzzle', () => {
    // 3x3, every row/col clue is [1]: any permutation matrix satisfies these clues, so no
    // cell is actually forced by the clues alone. Contradiction search must not claim one is.
    const puzzle = {
      rows: 3,
      cols: 3,
      rowClues: [[1], [1], [1]],
      colClues: [[1], [1], [1]],
    };
    const board = new Board(3, 3);
    assert(getNextHint(board, puzzle) === null, 'line techniques should find nothing on this blank board');
    assert(findContradictionHint(board, puzzle) === null, 'contradiction search must not force a move on a non-unique puzzle');
  });

  test('finds cases line techniques alone cannot, and solves them correctly', () => {
    // Search a handful of denser small random puzzles for one that stalls under line
    // techniques alone, then confirm the contradiction-search fallback (via
    // solvePuzzleFully) completes it and reaches a self-consistent solved board.
    let foundOneThatNeededContradiction = false;
    for (let attempt = 0; attempt < 40 && !foundOneThatNeededContradiction; attempt++) {
      const n = 6;
      const solution = Array.from({ length: n }, () =>
        Array.from({ length: n }, () => Math.random() < 0.5)
      );
      const puzzle = puzzleFrom(solution);
      const result = solvePuzzleFully(puzzle);
      if (result.techniquesUsed.has('contradiction') && result.solved) {
        foundOneThatNeededContradiction = true;
        assert(matches(result.board, puzzle), 'contradiction-assisted solve did not match the authored solution');
      }
    }
    // Not asserting foundOneThatNeededContradiction as a hard requirement (random search),
    // but log it so it's visible whether this path actually got exercised.
    console.log(`         (contradiction fallback exercised: ${foundOneThatNeededContradiction})`);
  });
});

function puzzleFrom(solution) {
  const rows = solution.length;
  const cols = solution[0].length;
  const rowClues = solution.map(runsOf);
  const colClues = [];
  for (let c = 0; c < cols; c++) colClues.push(runsOf(solution.map((row) => row[c])));
  return { rows, cols, rowClues, colClues, solution };
}

function runsOf(line) {
  const runs = [];
  let count = 0;
  for (const v of line) {
    if (v) count++;
    else if (count > 0) { runs.push(count); count = 0; }
  }
  if (count > 0) runs.push(count);
  return runs;
}

function matches(board, puzzle) {
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      const isFilled = board.get(r, c) === 'filled';
      if (isFilled !== puzzle.solution[r][c]) return false;
    }
  }
  return true;
}
