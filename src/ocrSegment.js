// Pure pixel-geometry helpers for segmenting a clue-strip crop into individual clue NUMBERS
// before OCR ever sees them, rather than relying on Tesseract's own word-boundary detection.
// Takes plain boolean arrays (never a Canvas/ImageData), same "no DOM in this file" rule as
// src/gridDetect.js, for the same reason: testable under plain Node (see
// test/ocrSegment.test.js). Turning a strip crop's pixels into the boolean arrays these
// functions consume, and turning the resulting number groups into actual OCR crops, is
// src/scanUI.js's job.
//
// Design tradeoff (documented per CLAUDE.md convention): confirmed against a real screenshot
// (see TODO.md) that Tesseract, at every page-segmentation mode tried, cannot reliably tell
// "two adjacent single-digit numbers" (e.g. a lone "1" then a lone "1") apart from "one
// two-digit number" (e.g. "11") when a puzzle app renders every digit at a fairly uniform
// small gap — to a human eye the gap between separate numbers is visibly wider than the gap
// between digits of the same multi-digit number, but that distinction lives in the image's
// pixel geometry, not something OCR text output preserves reliably (observed failures
// ranged from silently merging "1 1" into "11", to outright misreading digits when a whole
// multi-number strip was recognized in one pass). This measures the real geometry directly:
// find which rows contain any ink at all (a puzzle's clue margin can stack multiple text
// lines when a clue has many numbers — see computeClueBands's column-clue case), then within
// each line find contiguous ink columns (glyph blobs), then decide whether consecutive
// glyphs belong to the same number or are separate numbers by comparing their gap against a
// threshold calibrated from real crops of this exact style (see groupGlyphsIntoNumbers).

// Finds contiguous `true` runs in a boolean array, each becoming one {start, end} band
// (inclusive indices). Used for both axes: rows with any ink -> text lines; columns with any
// ink within one line's row-span -> glyph blobs.
export function findRuns(flags) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && start === -1) {
      start = i;
    } else if (!on && start !== -1) {
      runs.push({ start, end: i - 1 });
      start = -1;
    }
  }
  return runs;
}

// How tall a line band needs to be, relative to the tallest line band found in the same
// crop, to count as real text rather than a rendering artifact. Confirmed directly against
// real crops (see TODO.md): a clue-strip crop can contain a tiny 5-8px sliver of ink
// alongside its genuine ~30px+ line of digits — a bleed from a neighboring row's clue text
// at the crop's exact top/bottom edge, an artifact of the equal-height row/column band
// slicing not perfectly matching where the source app actually draws each line. Treating
// that sliver as its own real "line" wastes an OCR call and can inject spurious digits.
const DEFAULT_MIN_LINE_HEIGHT_RATIO = 0.4;

// Filters line bands down to only those at least `minHeightRatio` as tall as the tallest
// band in the set — see the constant above for why. A relative (not absolute-pixel)
// threshold, so it holds regardless of a crop's own resolution/scale.
export function filterNoiseLines(lineBands, { minHeightRatio = DEFAULT_MIN_LINE_HEIGHT_RATIO } = {}) {
  if (lineBands.length === 0) return [];
  const maxHeight = Math.max(...lineBands.map((b) => b.end - b.start + 1));
  return lineBands.filter((b) => b.end - b.start + 1 >= maxHeight * minHeightRatio);
}

// Default gap-size threshold (px, at this project's own OCR crop scale — see ocr.js's
// OCR_MIN_HEIGHT / FULL_MAX_DIM) below which two adjacent glyph blobs are treated as digits
// of the SAME multi-digit number, above which they're treated as two separate numbers.
// Calibrated directly against real crops of a screenshot with a genuine two-digit number
// ("11", "15") next to single digits: the gap between a multi-digit number's own digits
// measured 10-12px across four independent real examples, while the gap between distinct
// numbers measured 18-27px across the same set — no overlap, so this sits with margin on
// both sides rather than splitting a knife-edge. See TODO.md for the full measurement.
const DEFAULT_MAX_SAME_NUMBER_GAP = 15;

// Glyph blobs narrower than this are treated as noise (anti-aliasing specks, a stray dark
// pixel) rather than a real digit. Deliberately low: a real digit can end up just 1-2px wide
// in an actual crop if the column-clue band's fixed width clips a wide digit like "1" at its
// own edge (confirmed directly against a real screenshot — see TODO.md, and
// ocrSegment.test.js's "2 11" case, whose second "1" of "11" is only 2px wide for exactly
// this reason) — a higher floor would silently drop that real digit as if it were noise.
const DEFAULT_MIN_GLYPH_WIDTH = 2;

// Merges a line's glyph blobs (in left-to-right order, as found by findRuns over a
// "has ink in this column" array) into number tokens: consecutive blobs separated by no more
// than `maxSameNumberGap` are the same number (e.g. the "1" and "1" of "11"); a larger gap
// starts a new number. Filters out sub-`minGlyphWidth` blobs first so noise can't masquerade
// as a lone extra digit or corrupt a real gap measurement. Each returned group carries
// `glyphCount` (how many blobs merged into it) alongside its {start, end} span — a reliable
// stand-in for "how many digits this number has" (one blob per digit, holds for isolated
// 0-9 glyphs, which are always a single connected stroke) that recognizeStripSegmented uses
// to re-split a whole line's OCR'd digit stream back into individual numbers — see that
// function's own comment in scanUI.js for why it OCRs a whole line rather than each number
// alone.
export function groupGlyphsIntoNumbers(
  glyphBands,
  { maxSameNumberGap = DEFAULT_MAX_SAME_NUMBER_GAP, minGlyphWidth = DEFAULT_MIN_GLYPH_WIDTH } = {}
) {
  const real = glyphBands.filter((b) => b.end - b.start + 1 >= minGlyphWidth);
  if (real.length === 0) return [];

  const groups = [{ start: real[0].start, end: real[0].end, glyphCount: 1 }];
  for (let i = 1; i < real.length; i++) {
    const gap = real[i].start - real[i - 1].end;
    if (gap <= maxSameNumberGap) {
      const g = groups[groups.length - 1];
      g.end = real[i].end;
      g.glyphCount += 1;
    } else {
      groups.push({ start: real[i].start, end: real[i].end, glyphCount: 1 });
    }
  }
  return groups;
}
