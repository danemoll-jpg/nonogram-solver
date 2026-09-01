import { describe, test, assert, assertEqual } from './harness.js';
import { Board, FILLED, EMPTY, UNKNOWN } from '../src/model.js';
import { autoCheckMark, checkForMistakes, removeBadMarks } from '../src/mistakes.js';

const solution = [
  [true, false],
  [false, true],
];

describe('autoCheckMark', () => {
  test('returns null for a correct mark', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED);
    assertEqual(autoCheckMark(board, solution, 0, 0), null);
  });

  test('flags a wrong mark with the correct state', () => {
    const board = new Board(2, 2);
    board.set(0, 1, FILLED); // solution says (0,1) is empty
    const result = autoCheckMark(board, solution, 0, 1);
    assert(result !== null);
    assertEqual(result.resultState, EMPTY);
  });
});

describe('checkForMistakes (in-app puzzle, has history)', () => {
  test('finds the earliest wrong move for undo-to-point', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED); // correct, move 0
    board.set(1, 0, FILLED); // WRONG, move 1 (solution says empty)
    board.set(1, 1, FILLED); // correct, move 2
    const result = checkForMistakes(board, solution);
    assertEqual(result.origin, 'history');
    assertEqual(result.moveIndex, 1);
    assertEqual(result.cell, { row: 1, col: 0 });

    board.undoToMove(result.moveIndex);
    assertEqual(board.get(0, 0), FILLED);
    assertEqual(board.get(1, 0), UNKNOWN);
    assertEqual(board.get(1, 1), UNKNOWN);
  });

  test('reports no mistake when everything placed so far is correct', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED);
    board.set(0, 1, EMPTY);
    const result = checkForMistakes(board, solution);
    assertEqual(result.moveIndex, null);
  });
});

describe('checkForMistakes (batched moves, e.g. a fill plus its auto-X cells)', () => {
  test('finds a wrong cell inside a multi-cell move, and undo removes the whole move', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED); // correct, move 0
    // Simulate a manual fill batched together with an auto-X mark, the way app.js's
    // paintCell does — one move, two cells, the second one wrong (solution says (1,1) is
    // filled, not empty).
    board.setBatch([
      { row: 1, col: 0, state: EMPTY }, // correct
      { row: 1, col: 1, state: EMPTY }, // WRONG — solution says filled
    ]);
    const result = checkForMistakes(board, solution);
    assertEqual(result.origin, 'history');
    assertEqual(result.moveIndex, 1); // the whole batched move, not a fractional index
    assertEqual(result.cell, { row: 1, col: 1 });

    board.undoToMove(result.moveIndex);
    assertEqual(board.get(0, 0), FILLED);
    assertEqual(board.get(1, 0), UNKNOWN); // undone along with the wrong cell in its move
    assertEqual(board.get(1, 1), UNKNOWN);
  });
});

describe('checkForMistakes (snapshot-origin, no history)', () => {
  test('flags the wrong cells as a set, with no ordering', () => {
    const board = Board.fromGrid(
      [
        [FILLED, FILLED], // (0,1) wrong
        [UNKNOWN, EMPTY], // (1,1) wrong
      ],
      { hasHistory: false }
    );
    const result = checkForMistakes(board, solution);
    assertEqual(result.origin, 'snapshot');
    const cells = result.wrongCells.map((c) => `${c.row},${c.col}`).sort();
    assertEqual(cells, ['0,1', '1,1']);
  });
});

describe('removeBadMarks', () => {
  test('silently clears wrong cells only', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED); // correct
    board.set(0, 1, FILLED); // wrong
    board.set(1, 1, FILLED); // correct
    removeBadMarks(board, solution);
    assertEqual(board.get(0, 0), FILLED);
    assertEqual(board.get(0, 1), UNKNOWN);
    assertEqual(board.get(1, 1), FILLED);
  });

  test('batches its clears into one history move tagged source:hint (Current Objective #5)', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED); // correct
    board.set(0, 1, FILLED); // wrong
    board.set(1, 0, EMPTY); // wrong
    const historyLenBefore = board.history.length;
    removeBadMarks(board, solution);
    assertEqual(board.history.length, historyLenBefore + 1);
    assertEqual(board.history[board.history.length - 1].source, 'hint');
  });

  test('is a no-op (no new history entry) when nothing is wrong', () => {
    const board = new Board(2, 2);
    board.set(0, 0, FILLED); // correct
    const historyLenBefore = board.history.length;
    removeBadMarks(board, solution);
    assertEqual(board.history.length, historyLenBefore);
  });
});
