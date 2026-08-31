import { describe, test, assert, assertEqual } from './harness.js';
import { parseClueText, buildScannedPuzzle } from '../src/scanPuzzle.js';
import { deriveClues } from '../src/model.js';
import { SAMPLE_PUZZLES } from '../src/puzzles.js';

describe('parseClueText', () => {
  test('space-separated numbers', () => {
    assertEqual(parseClueText('3 1 2'), [3, 1, 2]);
  });

  test('comma-separated numbers (a common printed-clue style)', () => {
    assertEqual(parseClueText('3, 1, 2'), [3, 1, 2]);
  });

  test('newline-separated numbers (how a stacked column clue OCRs)', () => {
    assertEqual(parseClueText('3\n1\n2'), [3, 1, 2]);
  });

  test('an all-empty line has an empty clue, not [0]', () => {
    assertEqual(parseClueText(''), []);
    assertEqual(parseClueText('   '), []);
  });

  test('multi-digit numbers are kept whole', () => {
    assertEqual(parseClueText('12 3'), [12, 3]);
  });

  test('a stray misread "0" is dropped rather than kept as a clue value', () => {
    assertEqual(parseClueText('0'), []);
    assertEqual(parseClueText('3 0 1'), [3, 1]);
  });
});

describe('buildScannedPuzzle', () => {
  test('re-derives the correct solution from a known puzzle\'s own clues (differential ' +
    'check against every sample puzzle, standing in for a real scanned photo\'s clues)', () => {
    for (const p of SAMPLE_PUZZLES) {
      const result = buildScannedPuzzle({
        id: 'scan-test',
        name: 'Scan test',
        rows: p.rows,
        cols: p.cols,
        rowClues: p.rowClues,
        colClues: p.colClues,
      });
      assert(result.solved, `expected ${p.id}'s own clues to solve; got ${JSON.stringify(result)}`);
      assertEqual(result.puzzle.solution, p.solution, `solved solution mismatch for ${p.id}`);
      assertEqual(result.puzzle.source, 'scan');
      assertEqual(result.puzzle.rowClues, p.rowClues);
      assertEqual(result.puzzle.colClues, p.colClues);
    }
  });

  test('round-trips through OCR-style text parsing back to the original clues', () => {
    const p = SAMPLE_PUZZLES[0];
    const rowClueTexts = p.rowClues.map((clue) => clue.join(' '));
    const colClueTexts = p.colClues.map((clue) => clue.join(' '));
    const rowClues = rowClueTexts.map(parseClueText);
    const colClues = colClueTexts.map(parseClueText);
    assertEqual(rowClues, p.rowClues);
    assertEqual(colClues, p.colClues);
    const { rowClues: expectedRow, colClues: expectedCol } = deriveClues(
      p.solution.map((row) => row.map((c) => (c ? 1 : 0)))
    );
    assertEqual(rowClues, expectedRow);
    assertEqual(colClues, expectedCol);
  });

  test('reports solved:false rather than throwing for clues that don\'t fit the grid ' +
    '(e.g. an OCR misread inflating a number) — the wizard sends the user back to correct ' +
    'the text rather than starting an unplayable board', () => {
    const result = buildScannedPuzzle({
      id: 'scan-bad',
      name: 'Scan bad',
      rows: 3,
      cols: 3,
      rowClues: [[5], [1], [1]], // 5 doesn't fit in a 3-wide row
      colClues: [[1], [1], [1]],
    });
    assertEqual(result.solved, false);
    assert(result.reason === 'contradiction' || result.reason === 'stalled', `unexpected reason: ${result.reason}`);
  });
});
