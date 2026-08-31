// Pure per-cell fill/X-mark/blank classification for the fill-state-detection objective (see
// TODO.md's Current Objective). Takes plain RGBA pixel arrays for each cell crop — never a
// Canvas/ImageData/DOM node — same "no DOM in this file" rule as src/gridDetect.js and
// src/ocrSegment.js, for the same reason: testable under plain Node (see
// test/cellStateDetect.test.js). Cropping each confirmed grid cell out of the photo and
// collecting its pixels is src/scanUI.js's job; this module only ever sees the resulting
// pixel arrays plus the cell's own geometry.
//
// Returns model.js's own FILLED/EMPTY/UNKNOWN states directly (not a separate vocabulary
// translated later) — a deliberately X-marked cell IS the model's EMPTY state (the player
// chose "not filled"), and a cell with no mark at all IS the model's UNKNOWN state, matching
// how mistakes.js and Board already treat those three states everywhere else in the app.
//
// Design tradeoff (documented per CLAUDE.md convention, same spirit as inkThreshold/
// adaptiveBinarize in gridDetect.js): don't hardcode a fill color. This project owner's own
// screenshot happens to use green fill / a black X on white, but another app or theme could
// use anything, including an inverted (dark-background) grid panel. Every check here is
// relative to a BACKGROUND COLOR estimated from the grid's own pixels (estimateBackgroundColor
// below), never a fixed RGB triple or "assume white paper" — the same principle that made
// inkThreshold/adaptiveBinarize robust to whatever a real screenshot's own palette turns out
// to be, applied to color instead of grayscale.

import { FILLED, EMPTY, UNKNOWN } from './model.js';

// ---- background color estimation -------------------------------------------------------

export function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Estimates the puzzle's own "blank cell" color from a pool of sampled pixels (see
// sampleCellInterior below for how callers gather that pool from real cell crops) — a color
// MODE, not a mean: a mean would drift toward whatever fraction of the pool happens to be
// fill/mark ink, exactly the failure inkThreshold's own comment (gridDetect.js) warns about
// for a naive global cutoff. Quantizing into coarse buckets before counting (rather than
// requiring exact-pixel matches) absorbs ordinary JPEG noise/anti-aliasing around an
// otherwise-uniform background tone, which would otherwise fragment one real background color
// into many near-miss buckets each too small to win.
const BUCKET_SIZE = 16;

export function estimateBackgroundColor(samples) {
  if (samples.length === 0) return [255, 255, 255];
  const buckets = new Map();
  for (const [r, g, b] of samples) {
    const key =
      Math.floor(r / BUCKET_SIZE) * 4096 + Math.floor(g / BUCKET_SIZE) * 64 + Math.floor(b / BUCKET_SIZE);
    const entry = buckets.get(key);
    if (entry) {
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  let best = null;
  for (const entry of buckets.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return [best.r / best.count, best.g / best.count, best.b / best.count];
}

// ---- per-cell classification -------------------------------------------------------------

// Excludes this fraction of the cell's own size from every edge before looking at its pixels
// — a cell crop sliced by even-subdivision (see gridDetect.js's sliceGridCells) always
// includes a sliver of the grid's own border/gridlines right at its edges, which would
// otherwise register as "ink" in every single cell regardless of its real fill state.
const DEFAULT_BORDER_MARGIN = 0.14;

// Euclidean RGB distance from the estimated background beyond which a pixel counts as "ink"
// (fill color or a mark stroke) rather than background. Not tied to brightness alone (unlike
// inkThreshold's grayscale margin) since a fill color and its background can be similarly
// bright but very differently colored (this project owner's own screenshot: white background,
// saturated green fill) — plain grayscale would badly undercount fill coverage there.
const DEFAULT_INK_COLOR_MARGIN = 40;

// Ink coverage at/above this fraction of the cell's (margin-excluded) interior reads as a
// solid fill — "a large block of non-background color", per the design sketch. Comfortably
// below 1.0 since a cell's fill color can itself carry rendering noise/anti-aliasing right at
// its own edges even after the border margin above.
const DEFAULT_FILLED_INK_FRACTION = 0.45;

// Below this ink fraction, a cell is blank regardless of pattern — not enough ink for an X's
// two strokes to plausibly explain, so any stray dark pixels are noise (anti-aliasing, JPEG
// artifacts at the excluded border) rather than a real mark.
const DEFAULT_BLANK_INK_FRACTION = 0.03;

// How close an ink pixel must sit to one of the cell's two diagonals (as a fraction of the
// cell's own width/height, measured perpendicular to that diagonal in normalized [0,1]
// coordinates) to count as "on" it, when deciding whether a cell's ink pattern is actually an
// X rather than some other partial-coverage shape.
const DEFAULT_DIAGONAL_BAND = 0.22;

// Fraction of a cell's ink pixels that must fall within the diagonal band above for the
// pattern to be called an X-mark rather than something else (a stray corner of bleed from a
// neighboring filled cell, say) that happens to have low-but-nonzero ink coverage.
const DEFAULT_DIAGONAL_MAJORITY = 0.5;

// Minimum fraction of the cell's own (border-margin-excluded) width AND height that ink
// pixels must span for a diagonal-band match to count as a real X, not just diagonalMajority
// alone. Needed because the diagonal band test above, on its own, doesn't actually require
// corner-to-corner coverage — a single straight line running through a cell's CENTER (not
// along either true diagonal) still spends much of its length close to one of the two
// diagonals purely by sitting near the middle, and can clear diagonalMajority despite being
// nothing like an X (confirmed directly: a real grid line accidentally left inside a cell
// crop, before this feature's centerRectOnBorders fix, cleared it — see
// test/cellStateDetect.test.js). A genuine X's ink spans nearly the full cell on BOTH axes
// (corner to corner); a straight vertical/horizontal line spans one axis fully but the other
// only as wide as its own stroke — this bounding-box check is what actually tells them apart.
const DEFAULT_DIAGONAL_SPAN = 0.55;

// Classifies one cell from its own cropped RGBA pixel array (as from CanvasRenderingContext2D
// .getImageData().data — 4 bytes/pixel, row-major) against an already-estimated background
// color. Returns { state, inkFraction, diagRatio } — inkFraction/diagRatio are exposed (not
// just the final state) so callers/tests can see WHY a borderline cell landed where it did,
// the same debugging affordance gridDetect.js's countGridLines gives via its round-by-round
// comments.
export function classifyCellPixels(pixels, width, height, backgroundColor, options = {}) {
  const {
    borderMargin = DEFAULT_BORDER_MARGIN,
    inkColorMargin = DEFAULT_INK_COLOR_MARGIN,
    filledInkFraction = DEFAULT_FILLED_INK_FRACTION,
    blankInkFraction = DEFAULT_BLANK_INK_FRACTION,
    diagonalBand = DEFAULT_DIAGONAL_BAND,
    diagonalMajority = DEFAULT_DIAGONAL_MAJORITY,
    diagonalSpan = DEFAULT_DIAGONAL_SPAN,
  } = options;

  const x0 = Math.round(width * borderMargin);
  const x1 = Math.round(width * (1 - borderMargin));
  const y0 = Math.round(height * borderMargin);
  const y1 = Math.round(height * (1 - borderMargin));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  let total = 0;
  let inkCount = 0;
  let onDiagonalCount = 0;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      total++;
      const d = colorDistance([pixels[i], pixels[i + 1], pixels[i + 2]], backgroundColor);
      if (d <= inkColorMargin) continue;
      inkCount++;
      const u = (x - x0) / w;
      const v = (y - y0) / h;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      // Perpendicular distance (normalized, /sqrt(2) so it's in the same [0,1]-ish units as
      // u/v) from this point to the main diagonal (u===v) and the anti-diagonal (u+v===1); a
      // real X's two strokes each sit close to one of the two.
      const distMain = Math.abs(u - v) / Math.SQRT2;
      const distAnti = Math.abs(u + v - 1) / Math.SQRT2;
      if (Math.min(distMain, distAnti) <= diagonalBand) onDiagonalCount++;
    }
  }

  const inkFraction = total > 0 ? inkCount / total : 0;
  if (inkFraction >= filledInkFraction) return { state: FILLED, inkFraction, diagRatio: null };

  if (inkCount > 0 && inkFraction > blankInkFraction) {
    const diagRatio = onDiagonalCount / inkCount;
    // Both the diagonal-band majority AND a wide ink bounding box on BOTH axes are required —
    // see DEFAULT_DIAGONAL_SPAN's own comment for why the band test alone isn't enough to
    // reject a straight line sitting near the cell's center.
    const spansBothAxes = maxU - minU >= diagonalSpan && maxV - minV >= diagonalSpan;
    if (diagRatio >= diagonalMajority && spansBothAxes) return { state: EMPTY, inkFraction, diagRatio };
    return { state: UNKNOWN, inkFraction, diagRatio };
  }

  return { state: UNKNOWN, inkFraction, diagRatio: inkCount > 0 ? onDiagonalCount / inkCount : null };
}

// Pulls the interior (border-margin-excluded, see classifyCellPixels) pixels of one cell crop
// out as plain [r,g,b] triples — the sample format estimateBackgroundColor consumes. Kept
// separate from classifyCellPixels so callers can pool interior samples across every cell in
// the grid (see classifyGridCells) before any single cell is classified, rather than each
// cell guessing its own local background from a handful of its own pixels — a mostly-filled
// or mostly-marked cell has too few (or zero) real background pixels of its own to estimate
// from reliably, but the grid as a whole almost always does.
export function sampleCellInterior(pixels, width, height, { borderMargin = DEFAULT_BORDER_MARGIN, stride = 3 } = {}) {
  const x0 = Math.round(width * borderMargin);
  const x1 = Math.round(width * (1 - borderMargin));
  const y0 = Math.round(height * borderMargin);
  const y1 = Math.round(height * (1 - borderMargin));
  const samples = [];
  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const i = (y * width + x) * 4;
      samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
  }
  return samples;
}

// Classifies every cell in a rows x cols grid of cell crops in one pass: pools interior
// samples from ALL cells to estimate one shared background color (see estimateBackgroundColor
// — a mode over the whole grid is far more reliable than any single cell's own few hundred
// pixels, especially for a mostly-blank cell where a per-cell estimate would be trivially
// correct anyway, and especially for a mostly-filled/marked cell where a per-cell estimate
// would have almost no real background pixels to work from at all), then classifies each cell
// against that shared estimate. `cells` is a rows x cols array of { pixels, width, height } —
// exactly what sliceGridCells' rectangles crop out via scanUI.js's canvas cropping.
// Known limitation, not yet hit in practice: since the background estimate is a MODE across
// every cell's interior pixels (see estimateBackgroundColor), it assumes blank cells are still
// the majority — true for this feature's actual target use case (a mid-solve scan, see
// TODO.md), but a puzzle scanned when it's almost entirely filled in could have the estimate
// drift toward the fill color instead. Not worth solving until it's a real reported problem —
// the wizard's click-to-correct step (src/scanUI.js) is exactly the safety net for whatever
// this misses, same as it already is for OCR misreads.
export function classifyGridCells(cells, options = {}) {
  const allSamples = [];
  for (const row of cells) {
    for (const cell of row) {
      allSamples.push(...sampleCellInterior(cell.pixels, cell.width, cell.height, options));
    }
  }
  const backgroundColor = estimateBackgroundColor(allSamples);

  const states = cells.map((row) =>
    row.map((cell) => classifyCellPixels(cell.pixels, cell.width, cell.height, backgroundColor, options))
  );
  return { backgroundColor, states };
}
