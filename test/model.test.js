import { describe, test, assert, assertEqual } from './harness.js';
import { Board, cluesFromLine, deriveClues, isLineSatisfied, isLineLocked, FILLED, EMPTY, UNKNOWN } from '../src/model.js';

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

describe('isLineLocked', () => {
  test('false while unknowns remain, even if already satisfied', () => {
    const line = [FILLED, FILLED, UNKNOWN, EMPTY, FILLED];
    assertEqual(isLineSatisfied(line, [2, 1]), true); // satisfied...
    assertEqual(isLineLocked(line, [2, 1]), false); // ...but not locked: one UNKNOWN left
  });

  test('true once satisfied and fully marked', () => {
    const line = [FILLED, FILLED, EMPTY, EMPTY, FILLED];
    assertEqual(isLineLocked(line, [2, 1]), true);
  });

  test('an empty-clue line of all UNKNOWNs is not locked (regression: would otherwise ' +
    'lock before the player ever gets to X it out, since isLineSatisfied alone reads an ' +
    'all-UNKNOWN line against an empty clue as already satisfied)', () => {
    const line = [UNKNOWN, UNKNOWN, UNKNOWN];
    assertEqual(isLineSatisfied(line, []), true);
    assertEqual(isLineLocked(line, []), false);
  });

  test('an empty-clue line locks once fully marked EMPTY', () => {
    const line = [EMPTY, EMPTY, EMPTY];
    assertEqual(isLineLocked(line, []), true);
  });

  test('false when fully marked but the pattern does not match the clue', () => {
    const line = [FILLED, FILLED, FILLED, EMPTY, EMPTY];
    assertEqual(isLineLocked(line, [2]), false);
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

describe('Board.fromGrid baseline survives undo (real bug, found via a drag-placed run ' +
  'of X marks on a resumed puzzle — see TODO.md)', () => {
  // undoToMove used to rebuild the grid from scratch and replay only `history` onto it —
  // fine for a fresh board (nothing predates history), but a resumed/scan-imported board
  // seeds real marks straight into the grid via Board.fromGrid without ever recording them
  // in history. The very first undo after resuming wiped every one of those marks back to
  // UNKNOWN, since they were never in history to replay. Board now tracks that seed as
  // `baseline` and undoToMove rebuilds from a copy of it instead of a blank grid.
  test('undoLast leaves a fromGrid baseline (both FILLED and EMPTY cells) untouched', () => {
    const board = Board.fromGrid([
      [FILLED, EMPTY, UNKNOWN],
    ]);
    board.set(0, 2, EMPTY); // one new move on top of the resumed baseline
    assertEqual(board.history.length, 1);

    board.undoLast();
    assertEqual(board.history.length, 0);
    assertEqual(board.get(0, 0), FILLED); // baseline fill — must survive
    assertEqual(board.get(0, 1), EMPTY); // baseline X — must survive (the reported symptom)
    assertEqual(board.get(0, 2), UNKNOWN); // the actual undone move
  });

  test('undoToMove(0) — undoing every new move — still leaves the baseline intact', () => {
    const board = Board.fromGrid([[EMPTY, EMPTY]]);
    board.set(0, 0, UNKNOWN); // clears a baseline X, one move
    board.set(0, 0, FILLED); // then fills it, a second move
    assertEqual(board.history.length, 2);

    board.undoToMove(0);
    assertEqual(board.get(0, 0), EMPTY); // back to the original baseline mark, not UNKNOWN
    assertEqual(board.get(0, 1), EMPTY);
  });

  test('clone() carries the baseline through, not just the current grid', () => {
    const board = Board.fromGrid([[FILLED]]);
    board.set(0, 0, UNKNOWN);
    const copy = board.clone();
    copy.undoLast();
    assertEqual(copy.get(0, 0), FILLED);
  });

  test('a board with no seeded baseline (new Board) still undoes down to blank as before', () => {
    const board = new Board(1, 1);
    board.set(0, 0, EMPTY);
    board.undoLast();
    assertEqual(board.get(0, 0), UNKNOWN);
  });
});
