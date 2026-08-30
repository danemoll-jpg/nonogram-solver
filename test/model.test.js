import { describe, test, assertEqual } from './harness.js';
import { cluesFromLine, deriveClues, isLineSatisfied, FILLED, EMPTY, UNKNOWN } from '../src/model.js';

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
