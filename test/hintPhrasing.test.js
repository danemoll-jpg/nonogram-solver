import { describe, test, assertEqual } from './harness.js';
import { factualDirective } from '../src/hintPhrasing.js';

// Current Objective (see TODO.md — "the hint's suggested cell is sometimes already correctly
// filled in"): `factualDirective` is the fix — the one place exact cell coordinates are ever
// stated in a hint's text, replacing what used to be an LLM's own free-form restatement of
// them (a paraphrase task it could get wrong). It's plain, deterministic code, so it gets
// direct unit coverage rather than only the browser-preview verification this project usually
// relies on for hint/UI behavior.

describe('factualDirective produces the authoritative cell statement for a hint', () => {
  test('a single-cell FILLED result names the line and the one cell', () => {
    const deduction = {
      line: { type: 'row', index: 1 },
      resultCells: [{ row: 1, col: 3 }],
      resultState: 'filled',
    };
    assertEqual(factualDirective(deduction), 'Row 2: Fill (row 2, col 4).');
  });

  test('a multi-cell EMPTY result lists every cell, comma-separated, 1-indexed', () => {
    const deduction = {
      line: { type: 'col', index: 4 },
      resultCells: [{ row: 0, col: 4 }, { row: 1, col: 4 }, { row: 2, col: 4 }],
      resultState: 'empty',
    };
    assertEqual(
      factualDirective(deduction),
      'Column 5: Mark empty (row 1, col 5), (row 2, col 5), (row 3, col 5).'
    );
  });

  test('no line (e.g. a contradiction deduction with contradictionLine unknown) omits the line prefix', () => {
    const deduction = {
      line: null,
      resultCells: [{ row: 2, col: 2 }],
      resultState: 'filled',
    };
    assertEqual(factualDirective(deduction), 'Fill (row 3, col 3).');
  });

  test('no result cells (a contradiction-in-line marker) returns null rather than an empty statement', () => {
    const deduction = { line: { type: 'row', index: 0 }, resultCells: [], resultState: null };
    assertEqual(factualDirective(deduction), null);
  });

  test('missing resultCells entirely (not just empty) also returns null, not a crash', () => {
    const deduction = { line: { type: 'row', index: 0 }, resultState: 'filled' };
    assertEqual(factualDirective(deduction), null);
  });
});
