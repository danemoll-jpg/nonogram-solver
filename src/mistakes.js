// Item 5: mistake handling. Three separate, independently-triggered tools — deliberately
// not one combined setting (see design spec):
//   1. autoCheckMark   - real-time, off by default; validates a single mark the instant
//                         it's placed.
//   2. checkForMistakes - on-demand; behaves differently depending on whether the board
//                          has real move history (undo-to-point) or is a snapshot from a
//                          photo/scan (flag the wrong cells as a set, no ordering to undo).
//   3. removeBadMarks   - always-available silent reset of wrong cells. Not a hint.
// All three compare against `solution`, a rows x cols grid of booleans (true = filled).

import { FILLED, EMPTY, UNKNOWN } from './model.js';

function correctState(solution, row, col) {
  return solution[row][col] ? FILLED : EMPTY;
}

// Is the mark just placed at (row, col) wrong? Returns a deduction-shaped explanation
// (technique: 'mistake') for the phrasing layer, or null if the mark is correct.
export function autoCheckMark(board, solution, row, col) {
  const mark = board.get(row, col);
  if (mark === UNKNOWN) return null;
  const correct = correctState(solution, row, col);
  if (mark === correct) return null;
  return {
    technique: 'mistake',
    line: null,
    reasoningCells: [{ row, col }],
    resultCells: [{ row, col }],
    resultState: correct,
    meta: { markedAs: mark, shouldBe: correct },
  };
}

// On-demand check when auto-check is off.
//   - In-app puzzle (board.hasHistory === true): finds the EARLIEST wrong move and
//     returns enough to offer "back up to move #N" (board.undoToMove(moveIndex)).
//   - Snapshot-origin puzzle (no history): returns the set of currently-wrong cells with
//     no ordering, since there's no way to know which was made first.
export function checkForMistakes(board, solution) {
  if (board.hasHistory) {
    for (let i = 0; i < board.history.length; i++) {
      const move = board.history[i];
      const correct = correctState(solution, move.row, move.col);
      if (move.next !== correct && move.next !== UNKNOWN) {
        return {
          origin: 'history',
          moveIndex: i,
          cell: { row: move.row, col: move.col },
          markedAs: move.next,
          shouldBe: correct,
        };
      }
    }
    return { origin: 'history', moveIndex: null, cell: null }; // no mistakes found
  }

  const wrongCells = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const mark = board.get(r, c);
      if (mark === UNKNOWN) continue;
      if (mark !== correctState(solution, r, c)) wrongCells.push({ row: r, col: c });
    }
  }
  return { origin: 'snapshot', wrongCells };
}

// Always-available, silent, no explanation: clears every cell that disagrees with the
// solution. A convenience/speed tool, not a learning tool.
export function removeBadMarks(board, solution) {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const mark = board.get(r, c);
      if (mark === UNKNOWN) continue;
      if (mark !== correctState(solution, r, c)) board.set(r, c, UNKNOWN);
    }
  }
}
