import { describe, test, assert, assertEqual } from './harness.js';
import { findRuns, groupGlyphsIntoNumbers, filterNoiseLines, findRepeatedDigitOutlier } from '../src/ocrSegment.js';

describe('findRuns', () => {
  test('finds contiguous true runs as inclusive [start,end] bands', () => {
    const flags = [false, true, true, false, false, true, false, true, true, true];
    assertEqual(findRuns(flags), [
      { start: 1, end: 2 },
      { start: 5, end: 5 },
      { start: 7, end: 9 },
    ]);
  });

  test('a run touching the end of the array is still closed off', () => {
    assertEqual(findRuns([false, true, true]), [{ start: 1, end: 2 }]);
  });

  test('no runs in an all-false array', () => {
    assertEqual(findRuns([false, false, false]), []);
  });
});

describe('filterNoiseLines', () => {
  // Real line bands measured directly from actual clue-strip crops (see TODO.md) that each
  // contained a tiny ink sliver alongside their genuine line of digits.

  test('drops an 8px sliver above a real 32px line (row crop "1 1 4 4")', () => {
    const bands = [
      { start: 0, end: 7 }, // bleed-through sliver, not real content
      { start: 28, end: 59 }, // the real "1 1 4 4" line
    ];
    assertEqual(filterNoiseLines(bands), [{ start: 28, end: 59 }]);
  });

  test('drops a 5px sliver below a real 36px line (row crop "5 10")', () => {
    const bands = [
      { start: 0, end: 35 }, // the real "5 10" line
      { start: 55, end: 59 }, // bleed-through sliver
    ];
    assertEqual(filterNoiseLines(bands), [{ start: 0, end: 35 }]);
  });

  test('keeps multiple genuinely comparable-height lines (a real multi-line column clue)', () => {
    const bands = [
      { start: 143, end: 171 }, // "1"
      { start: 182, end: 210 }, // "1"
      { start: 222, end: 250 }, // "2 11"
    ];
    assertEqual(filterNoiseLines(bands), bands);
  });

  test('an empty list stays empty', () => {
    assertEqual(filterNoiseLines([]), []);
  });
});

describe('groupGlyphsIntoNumbers', () => {
  // Real measurements taken directly from actual clue-strip crops of a genuine screenshot
  // (see TODO.md) — not synthetic guesses. Each case pairs the real pixel-column bands found
  // for one clue line with the numbers a human reading the same crop would see. `glyphCount`
  // matters as much as the merged {start,end} span — it's what recognizeStripSegmented
  // (scanUI.js) uses to re-split a whole line's OCR'd digit stream back into numbers.

  test('row crop "1 1 4 4" (four separate single-digit numbers, no multi-digit ones)', () => {
    // x-bands measured directly from the real crop; every consecutive gap (37, 35, 25) is a
    // real gap between distinct numbers, none of them should merge.
    const bands = [
      { start: 100, end: 115 },
      { start: 152, end: 167 },
      { start: 202, end: 230 },
      { start: 255, end: 283 },
    ];
    assertEqual(
      groupGlyphsIntoNumbers(bands),
      bands.map((b) => ({ ...b, glyphCount: 1, glyphs: [{ start: b.start, end: b.end }] }))
    );
  });

  test('row crop "6 15" — a genuine two-digit number ("15") next to a separate single digit ("6")', () => {
    // "6" alone, then "1" and "5" of "15" only 12px apart (same number) vs. 18px from "6"
    // (a different number) — the exact real-world case this module exists for.
    const bands = [
      { start: 204, end: 231 }, // "6"
      { start: 249, end: 261 }, // "1" of "15"
      { start: 273, end: 291 }, // "5" of "15"
    ];
    assertEqual(groupGlyphsIntoNumbers(bands), [
      { start: 204, end: 231, glyphCount: 1, glyphs: [{ start: 204, end: 231 }] },
      { start: 249, end: 291, glyphCount: 2, glyphs: [{ start: 249, end: 261 }, { start: 273, end: 291 }] }, // "1" and "5" merged into one "15" token
    ]);
  });

  test('column crop line "2 11" — a separate single digit next to a genuine two-digit number', () => {
    // "2", then "1" and "1" of "11" only 10-11px apart (same number) vs. 18-19px from "2".
    const bands = [
      { start: 0, end: 6 }, // "2"
      { start: 24, end: 32 }, // first "1" of "11"
      { start: 42, end: 43 }, // second "1" of "11" (clipped short by the crop's own edge — still real ink, not noise)
    ];
    assertEqual(groupGlyphsIntoNumbers(bands), [
      { start: 0, end: 6, glyphCount: 1, glyphs: [{ start: 0, end: 6 }] },
      { start: 24, end: 43, glyphCount: 2, glyphs: [{ start: 24, end: 32 }, { start: 42, end: 43 }] },
    ]);
  });

  test('filters out sub-minGlyphWidth blobs as noise before grouping', () => {
    const bands = [
      { start: 0, end: 10 },
      { start: 14, end: 14 }, // 1px wide -- noise, below the default 2px floor
      { start: 40, end: 55 },
    ];
    assertEqual(groupGlyphsIntoNumbers(bands), [
      { start: 0, end: 10, glyphCount: 1, glyphs: [{ start: 0, end: 10 }] },
      { start: 40, end: 55, glyphCount: 1, glyphs: [{ start: 40, end: 55 }] },
    ]);
  });

  test('an empty band list produces no groups', () => {
    assertEqual(groupGlyphsIntoNumbers([]), []);
  });

  test('a single glyph is its own group', () => {
    assertEqual(groupGlyphsIntoNumbers([{ start: 5, end: 12 }]), [
      { start: 5, end: 12, glyphCount: 1, glyphs: [{ start: 5, end: 12 }] },
    ]);
  });
});

describe('findRepeatedDigitOutlier', () => {
  test('flags a lone misread digit among five repeated 1s (the motivating real-world case)', () => {
    assertEqual(findRepeatedDigitOutlier([1, 1, 7, 1, 1, 1]), { index: 2, suspectedValue: 7, expectedValue: 1 });
  });

  test('does not flag a genuinely varied 2-number clue ("1, 7") — not enough repetition to call it', () => {
    assertEqual(findRepeatedDigitOutlier([1, 7]), null);
  });

  test('does not flag a real confirmed puzzle line with four matching digits and one different one (real ground-truth column 14 clue: 2,1,2,2,2) — the exact case that determined the default threshold', () => {
    assertEqual(findRepeatedDigitOutlier([2, 1, 2, 2, 2]), null);
  });

  test('flags when the run is stretched to five matching digits plus one outlier', () => {
    assertEqual(findRepeatedDigitOutlier([2, 2, 9, 2, 2, 2]), { index: 2, suspectedValue: 9, expectedValue: 2 });
  });

  test('does not flag two or more differing digits — too ambiguous to call', () => {
    assertEqual(findRepeatedDigitOutlier([1, 7, 1, 1, 3, 1]), null);
  });

  test('does not flag a multi-digit number sitting among repeated single digits — a different, already-tracked failure mode', () => {
    assertEqual(findRepeatedDigitOutlier([1, 1, 1, 1, 11]), null);
  });

  test('does not flag a uniform run with no outlier at all', () => {
    assertEqual(findRepeatedDigitOutlier([1, 1, 1, 1, 1]), null);
  });

  test('every row and column clue in the real 25x25 ground-truth test puzzle passes clean (see TODO.md)', () => {
    const rows = [
      [2, 5], [1, 4], [1, 1, 4, 4], [3, 1, 1, 3], [2, 7, 2],
      [1, 1, 8], [2, 1, 1, 2], [2, 1, 7], [1, 1, 1, 1], [2, 1, 6],
      [3, 1, 1, 1], [5, 2, 4], [2, 2], [2, 2], [3, 5],
      [3, 6], [4, 1, 8], [6, 15], [4, 7, 8], [4, 1, 8],
      [5, 6, 9], [5, 10], [6, 12], [4, 2, 4, 10], [3, 1, 2, 10],
    ];
    const cols = [
      [11], [11], [12], [2, 8], [2, 1, 3],
      [1, 1, 1, 2], [2, 1, 1, 1, 2], [1, 2, 2, 2, 1], [2, 2, 2, 1], [1, 5, 2, 2, 1, 1],
      [1, 4, 3, 1, 2], [2, 2, 1, 3], [12, 2, 2], [2, 1, 2, 2, 2], [1, 2, 2, 9],
      [1, 1, 12], [1, 1, 11], [1, 4, 11], [1, 2, 2, 11], [1, 1, 1, 1, 11],
      [1, 1, 1, 1, 10], [4, 1, 3, 8], [1, 4, 1, 1, 5], [1, 5, 1, 2], [1, 1, 3],
    ];
    for (const [i, clue] of [...rows, ...cols].entries()) {
      assertEqual(findRepeatedDigitOutlier(clue), null, `line ${i} (${JSON.stringify(clue)}) should not be flagged`);
    }
  });
});
