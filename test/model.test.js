import { describe, test, assert, assertEqual } from './harness.js';
import { Board, cluesFromLine, deriveClues, isLineSatisfied, FILLED, EMPTY, UNKNOWN } from '../src/model.js';

describe('cluesFromLine / deriveClues', () => {
  test('empty line has an empty clue', () => {
    assertEqual(cluesFromLine([false, false, false]), []);
  });

  test('derives runs in order', () => {
    assertEqual(cluesFromLine([true, true, false, true, false, false, true]), [2, 1, 1]);
  });

  test('deriveClues covers both rows and columns', () => {
    const solution = [
      [true, false],
      [true, true],
    ];
    const { rowClues, colClues } = deriveClues(solution);
    assertEqual(rowClues, [[1], [2]]);
    assertEqual(colClues, [[2], [1]]);
  });
});

describe('isLineSatisfied', () => {
  test('true once filled runs match the clue, even with unknowns remaining', () => {
    const line = [FILLED, FILLED, UNKNOWN, EMPTY, FILLED];
    assertEqual(isLineSatisfied(line, [2, 1]), true);
  });

  test('false when the run pattern does not match', () => {
    const line = [FILLED, EMPTY, FILLED];
    assertEqual(isLineSatisfied(line, [2]), false);
  });
});

describe('Board.setBatch (atomic multi-cell moves)', () => {
  test('batches several cells into one history move', () => {
    const board = new Board(1, 3);
    const applied = board.setBatch([
      { row: 0, col: 0, state: FILLED },
      { row: 0, col: 1, state: EMPTY },
    ]);
    assertEqual(applied.length, 2);
    assertEqual(board.history.length, 1); // one move, not two
    assertEqual(board.history[0].cells.length, 2);
  });

  test('no-op cells are skipped and do not push an empty move', () => {
    const board = new Board(1, 2);
    board.set(0, 0, FILLED);
    const applied = board.setBatch([{ row: 0, col: 0, state: FILLED }]); // already filled
    assertEqual(applied, []);
    assertEqual(board.history.length, 1); // still just the earlier set()
  });

  test('undoToMove removes a whole batched move at once', () => {
    const board = new Board(1, 3);
    board.set(0, 0, FILLED); // move 0
    board.setBatch([
      { row: 0, col: 1, state: FILLED },
      { row: 0, col: 2, state: EMPTY },
    ]); // move 1, two cells
    assertEqual(board.history.length, 2);

    board.undoToMove(1);
    assertEqual(board.get(0, 0), FILLED);
    assertEqual(board.get(0, 1), UNKNOWN);
    assertEqual(board.get(0, 2), UNKNOWN);
  });

  test('set() tags a move with source, defaulting to player', () => {
    const board = new Board(1, 1);
    board.set(0, 0, FILLED);
    assertEqual(board.history[0].source, 'player');
    board.set(0, 0, UNKNOWN);
    board.set(0, 0, FILLED, { source: 'hint' });
    assertEqual(board.history[2].source, 'hint');
  });
});
