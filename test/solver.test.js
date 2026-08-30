import { describe, test, assert, assertEqual } from './harness.js';
import { Board, FILLED } from '../src/model.js';
import { getNextHint, applyDeduction, solveToFixpoint } from '../src/solver.js';
import { SAMPLE_PUZZLES } from '../src/puzzles.js';
import { solvePuzzleFully } from '../src/fullSolve.js';

function boardMatchesSolution(board, puzzle) {
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      const shouldBeFilled = puzzle.solution[r][c];
      const isFilled = board.get(r, c) === FILLED;
      if (shouldBeFilled !== isFilled) return false;
    }
  }
  return true;
}

describe('sample puzzles solve correctly end-to-end', () => {
  for (const puzzle of SAMPLE_PUZZLES) {
    test(`${puzzle.name} solves to the authored solution`, () => {
      const result = solvePuzzleFully(puzzle);
      assert(result.solved, `${puzzle.name} did not solve (contradiction=${result.contradiction}, stalled=${result.stalled})`);
      assert(boardMatchesSolution(result.board, puzzle), `${puzzle.name} solved board does not match its authored solution`);
    });
  }
});

describe('getNextHint delivers one technique application at a time', () => {
  test('hint on a blank board only ever changes cells in the reported line', () => {
    const puzzle = SAMPLE_PUZZLES.find((p) => p.id === 'heart-5');
    const board = new Board(puzzle.rows, puzzle.cols);
    const hint = getNextHint(board, puzzle);
    assert(hint !== null, 'expected a hint on a blank puzzle with a strong first move');
    for (const cell of hint.resultCells) {
      if (hint.line.type === 'row') assertEqual(cell.row, hint.line.index);
      else assertEqual(cell.col, hint.line.index);
    }
  });

  test('repeatedly applying hints eventually completes the puzzle (or reaches a genuine stuck state)', () => {
    const puzzle = SAMPLE_PUZZLES.find((p) => p.id === 'boat-10');
    const board = new Board(puzzle.rows, puzzle.cols);
    let guard = 0;
    while (!board.isComplete() && guard < 5000) {
      const hint = getNextHint(board, puzzle);
      if (!hint) break;
      applyDeduction(board, hint);
      guard++;
    }
    assert(guard < 5000, 'hint loop did not terminate — likely an infinite loop in the solver');
  });
});

describe('solveToFixpoint reports contradictions on an inconsistent board', () => {
  test('a row that cannot match its clue is flagged invalid', () => {
    const puzzle = { rows: 1, cols: 3, rowClues: [[3]], colClues: [[1], [0], [1]] };
    const board = new Board(1, 3);
    board.set(0, 1, 'empty'); // clue [3] over width 3 requires every cell filled
    const result = solveToFixpoint(board, puzzle, {});
    assert(result.contradiction, 'expected a contradiction to be detected');
  });
});
