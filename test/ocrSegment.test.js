import { describe, test, assert, assertEqual } from './harness.js';
import {
  findRuns,
  groupGlyphsIntoNumbers,
  filterNoiseLines,
  filterBorderBleedGlyphs,
  findRepeatedDigitOutlier,
  findOversizedClue,
  suggestOversizedClueSplit,
} from '../src/ocrSegment.js';

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

describe('filterBorderBleedGlyphs', () => {
  // Real measurements taken directly from the real 25x25 ground-truth image's own row 4 clue
  // strip (see TODO.md's Current Objective writeup): canvas width 278px, four genuine digit
  // glyphs ("3,1,1,3") each covering 61-68% of the line's own height, plus a fifth "glyph" at
  // x=[275,277] — the grid's own left border line bleeding into the strip crop's right edge —
  // covering 100% of the line's height and sitting flush against the crop's own right edge.
  // This exact geometry, fed to Tesseract unfiltered, read back as "3,1,1,7,3": the real bug
  // this function exists to catch before OCR ever sees it.
  function coverageArray(width, entries) {
    const arr = new Array(width).fill(0);
    for (const [start, end, value] of entries) for (let x = start; x <= end; x++) arr[x] = value;
    return arr;
  }

  test('drops a full-height glyph flush against the crop edge (the real row-4 border-bleed case)', () => {
    const numbers = [
      { start: 88, end: 107, glyphCount: 1, glyphs: [{ start: 88, end: 107 }] }, // "3"
      { start: 133, end: 145, glyphCount: 1, glyphs: [{ start: 133, end: 145 }] }, // "1"
      { start: 179, end: 191, glyphCount: 1, glyphs: [{ start: 179, end: 191 }] }, // "1"
      { start: 225, end: 244, glyphCount: 1, glyphs: [{ start: 225, end: 244 }] }, // "3"
      { start: 275, end: 277, glyphCount: 1, glyphs: [{ start: 275, end: 277 }] }, // border bleed
    ];
    const coverage = coverageArray(278, [
      [88, 107, 0.673], [133, 145, 0.673], [179, 191, 0.673], [225, 244, 0.673], [275, 277, 1.0],
    ]);
    assertEqual(filterBorderBleedGlyphs(numbers, coverage, 278), numbers.slice(0, 4));
  });

  test('keeps a real digit even at typical ~65% coverage, well clear of the threshold', () => {
    const numbers = [{ start: 10, end: 30, glyphCount: 1, glyphs: [{ start: 10, end: 30 }] }];
    const coverage = coverageArray(50, [[10, 30, 0.68]]);
    assertEqual(filterBorderBleedGlyphs(numbers, coverage, 50), numbers);
  });

  test('keeps a full-height glyph that does NOT touch either crop edge — coverage alone is not enough', () => {
    const numbers = [{ start: 20, end: 30, glyphCount: 1, glyphs: [{ start: 20, end: 30 }] }];
    const coverage = coverageArray(100, [[20, 30, 1.0]]);
    assertEqual(filterBorderBleedGlyphs(numbers, coverage, 100), numbers);
  });

  test('keeps an edge-touching glyph with ordinary digit coverage — edge alone is not enough', () => {
    const numbers = [{ start: 0, end: 12, glyphCount: 1, glyphs: [{ start: 0, end: 12 }] }];
    const coverage = coverageArray(50, [[0, 12, 0.65]]);
    assertEqual(filterBorderBleedGlyphs(numbers, coverage, 50), numbers);
  });

  test('never discards a multi-glyph number, even if somehow edge-touching and full-coverage', () => {
    const numbers = [
      { start: 0, end: 20, glyphCount: 2, glyphs: [{ start: 0, end: 8 }, { start: 12, end: 20 }] },
    ];
    const coverage = coverageArray(30, [[0, 20, 1.0]]);
    assertEqual(filterBorderBleedGlyphs(numbers, coverage, 30), numbers);
  });

  test('an empty numbers list stays empty', () => {
    assertEqual(filterBorderBleedGlyphs([], [], 50), []);
  });

  test('a column-strip glyph (always full-height by construction, since its line band is fit exactly to it) survives when it does not also touch the crop edge', () => {
    // Real column-clue glyphs (see this project's own real ground-truth column strips) are
    // always ~100% coverage — their own line band IS their own ink extent — which is exactly
    // why edge-touching is required as a SECOND, independent condition rather than relying on
    // coverage alone: real column digits normally sit with real crop margin on both sides
    // (STRIP_MARGIN_PX plus CROP_PADDING), not flush against the edge.
    const numbers = [{ start: 16, end: 27, glyphCount: 1, glyphs: [{ start: 16, end: 27 }] }];
    const coverage = coverageArray(52, [[16, 27, 1.0]]);
    assertEqual(filterBorderBleedGlyphs(numbers, coverage, 52), numbers);
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

describe('findOversizedClue', () => {
  test('flags a clue number larger than the line length (the motivating real-world case: "1011" in a 30-cell line)', () => {
    assertEqual(findOversizedClue([1011], 30), { index: 0, value: 1011, lineLength: 30 });
  });

  test('flags an oversized number sitting among otherwise-legitimate numbers, by its own index', () => {
    assertEqual(findOversizedClue([4, 1011, 2], 30), { index: 1, value: 1011, lineLength: 30 });
  });

  test('does not flag a number exactly equal to the line length — a single full-line run is legitimate', () => {
    assertEqual(findOversizedClue([30], 30), null);
  });

  test('does not flag a genuinely large but still-possible clue', () => {
    assertEqual(findOversizedClue([15, 10], 30), null);
  });

  test('an empty clue is never flagged', () => {
    assertEqual(findOversizedClue([], 30), null);
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
      assertEqual(findOversizedClue(clue, 25), null, `line ${i} (${JSON.stringify(clue)}) should not be flagged`);
    }
  });
});

describe('suggestOversizedClueSplit', () => {
  test('picks the widest internal gap as the split point (the motivating real case: "1014" -> 10, 14)', () => {
    // Gaps between adjacent digit pairs of "1014": (1,0), (0,1), (1,4) — the middle gap (the
    // real boundary between the two merged numbers) measures widest, matching this feature's
    // real-measured "within a number ~10-12px, between numbers ~18-27px" thresholds.
    const result = suggestOversizedClueSplit('1014', [11, 20, 11]);
    assertEqual(result, { left: 10, right: 14 });
  });

  test('a single-digit value has no gaps and nothing to split', () => {
    assertEqual(suggestOversizedClueSplit('5', []), null);
  });

  test('a gap-count mismatch against the value text is treated as stale/untrustworthy geometry', () => {
    assertEqual(suggestOversizedClueSplit('123', [5]), null); // expects 2 gaps for 3 digits, got 1
    assertEqual(suggestOversizedClueSplit('123', [5, 6, 7]), null); // too many, too
  });

  test('every gap tied at the same width has no confident split point', () => {
    assertEqual(suggestOversizedClueSplit('1234', [10, 10, 10]), null);
  });

  test('normalizes a spurious leading zero at the split point', () => {
    const result = suggestOversizedClueSplit('034', [5, 20]);
    assertEqual(result, { left: 3, right: 4 });
  });

  test('rejects a split that would leave a zero-value side (an all-zero digit chunk)', () => {
    assertEqual(suggestOversizedClueSplit('04', [20]), null);
  });

  test('no gaps at all (missing geometry) yields no suggestion', () => {
    assertEqual(suggestOversizedClueSplit('1014', null), null);
    assertEqual(suggestOversizedClueSplit('1014', undefined), null);
  });

  // The "1410" bug (TODO.md): reproduced directly by rendering "1410" in a monospaced/
  // tabular-figure font and measuring its real pixel gaps — a dead 3-way tie ([7, 7, 7],
  // carrying zero split-point signal), which is exactly why the old gap-only algorithm
  // declined here even though "14, 10" is the obviously correct (and only legal) reading.
  test('uses line length to resolve a tied/uninformative gap set (the "1410" bug)', () => {
    // Gaps alone give no signal at all — every prior test's "tied gaps" case (see above)
    // correctly returns null here on its own.
    assertEqual(suggestOversizedClueSplit('1410', [7, 7, 7]), null);
    // But in a 25-wide line, "1, 410" (410) and "141, 0" (141, and 0 is not a legal clue
    // value either) are both structurally impossible — "14, 10" is the ONLY split where both
    // sides could ever fit, so line length alone proves it without needing gap evidence.
    assertEqual(suggestOversizedClueSplit('1410', [7, 7, 7], 25), { left: 14, right: 10 });
  });

  test('line length alone resolves a split even with no gap evidence at all', () => {
    assertEqual(suggestOversizedClueSplit('1410', null, 25), { left: 14, right: 10 });
    assertEqual(suggestOversizedClueSplit('1410', undefined, 25), { left: 14, right: 10 });
  });

  test('line length narrows candidates but gap evidence still breaks a remaining tie', () => {
    // In a wide (99-cell) line, both "1, 410" (410 ≤ 99? no — still too big) ... use a value
    // where line length leaves TWO legal candidates, so gap evidence is still the deciding
    // factor exactly as it was before line length was ever considered.
    // "1234" in a 40-wide line: "1,234" (234 > 40, illegal), "12,34" (both ≤ 40, legal),
    // "123,4" (123 > 40, illegal) — only one legal candidate here regardless of gaps, so use a
    // case with two: "1213" in a 40-wide line: "1,213" (213>40 illegal), "12,13" (legal),
    // "121,3" (121>40 illegal) — still only one. A genuinely two-legal-candidate case needs a
    // smaller merged number: "123" in a 40-wide line: "1,23" (legal) and "12,3" (legal) both
    // fit, so gap evidence must still decide between them.
    assertEqual(suggestOversizedClueSplit('123', [10, 20], 40), { left: 12, right: 3 });
    assertEqual(suggestOversizedClueSplit('123', [20, 10], 40), { left: 1, right: 23 });
    assertEqual(suggestOversizedClueSplit('123', [10, 10], 40), null); // still tied — decline
  });

  test('a line length that rules out every split yields no suggestion', () => {
    assertEqual(suggestOversizedClueSplit('99', [5], 5), null); // 99 vs 9,9 — both sides > 5
  });

  test('an omitted line length preserves the exact prior gap-only behavior', () => {
    // Same inputs as the very first test above, called the old (2-arg) way — must still work
    // unchanged for any existing caller that hasn't been updated to pass a line length.
    assertEqual(suggestOversizedClueSplit('1014', [11, 20, 11]), { left: 10, right: 14 });
  });
});
