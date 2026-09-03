import { describe, test, assert, assertEqual } from './harness.js';
import { buildDrawnPuzzle } from '../src/drawPuzzle.js';
import { SAMPLE_PUZZLES } from '../src/puzzles.js';

describe('buildDrawnPuzzle', () => {
  test('rejects a blank grid — nothing drawn yet', () => {
    const grid = Array.from({ length: 4 }, () => Array(4).fill(false));
    const result = buildDrawnPuzzle({ id: 'draw-test', name: 'Drawn test', grid });
    assertEqual(result.solved, false);
    assertEqual(result.reason, 'empty');
  });

  test('accepts every built-in sample puzzle\'s own solution as a drawing — each is unique ' +
    'by construction (differential check, standing in for a real hand-drawn picture)', () => {
    for (const p of SAMPLE_PUZZLES) {
      const grid = p.solution.map((row) => row.map((c) => !!c));
      const result = buildDrawnPuzzle({ id: 'draw-test', name: 'Drawn test', grid });
      assert(result.solved, `expected ${p.id}'s own solution to build a unique puzzle; got ${JSON.stringify(result)}`);
      assertEqual(result.puzzle.solution, p.solution, `solution mismatch for ${p.id}`);
      assertEqual(result.puzzle.rowClues, p.rowClues);
      assertEqual(result.puzzle.colClues, p.colClues);
      assertEqual(result.puzzle.source, 'drawn');
      // Unlike a scanned puzzle, a drawn puzzle is never played pre-filled — startPuzzle
      // (app.js) only seeds a board from puzzle.initialMarks when present.
      assert(!('initialMarks' in result.puzzle), `drawn puzzle for ${p.id} should not carry initialMarks`);
    }
  });

  test('rejects a genuinely ambiguous drawing — a 2x2 diagonal has a second valid ' +
    'arrangement (the other diagonal) satisfying the exact same clues', () => {
    const grid = [
      [true, false],
      [false, true],
    ];
    const result = buildDrawnPuzzle({ id: 'draw-ambiguous', name: 'Drawn ambiguous', grid });
    assertEqual(result.solved, false);
    assertEqual(result.reason, 'ambiguous');
  });

  test('a single filled cell is the minimum accepted drawing (trivially unique)', () => {
    const grid = [
      [false, false],
      [false, true],
    ];
    const result = buildDrawnPuzzle({ id: 'draw-min', name: 'Drawn min', grid });
    assert(result.solved, `expected a single filled cell to build a valid puzzle; got ${JSON.stringify(result)}`);
    assertEqual(result.puzzle.solution, [
      [false, false],
      [false, true],
    ]);
  });
});
