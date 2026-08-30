// Sample puzzles for the dev harness / full UI, standing in for the shared library
// (item 9, deferred). Each is authored as a solution grid of '#'/'.' rows; clues are
// derived automatically via puzzleFromSolution so they're always internally consistent.

import { puzzleFromSolution } from './model.js';

function gridFromRows(rows) {
  const width = rows[0].length;
  for (const row of rows) {
    if (row.length !== width) throw new Error(`puzzle row length mismatch: "${row}" (expected ${width})`);
  }
  return rows.map((row) => row.split('').map((ch) => ch === '#'));
}

const HEART_5 = gridFromRows([
  '.#.#.',
  '#####',
  '#####',
  '.###.',
  '..#..',
]);

const ARROW_8 = gridFromRows([
  '...##...',
  '..####..',
  '.######.',
  '########',
  '...##...',
  '...##...',
  '...##...',
  '...##...',
]);

const PLUS_10 = gridFromRows([
  '...####...',
  '...####...',
  '...####...',
  '##########',
  '##########',
  '##########',
  '##########',
  '...####...',
  '...####...',
  '...####...',
]);

const BOAT_10 = gridFromRows([
  '....##....',
  '...####...',
  '..######..',
  '.########.',
  '##########',
  '....##....',
  '...####...',
  '..........',
  '..........',
  '..........',
]);

export const SAMPLE_PUZZLES = [
  puzzleFromSolution({ id: 'heart-5', name: 'Heart (5x5)', solution: HEART_5 }),
  puzzleFromSolution({ id: 'arrow-8', name: 'Arrow (8x8)', solution: ARROW_8 }),
  puzzleFromSolution({ id: 'plus-10', name: 'Plus (10x10)', solution: PLUS_10 }),
  puzzleFromSolution({ id: 'boat-10', name: 'Boat (10x10)', solution: BOAT_10 }),
];

export function getPuzzleById(id) {
  return SAMPLE_PUZZLES.find((p) => p.id === id) ?? null;
}
