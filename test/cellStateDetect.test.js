import { describe, test, assert, assertEqual } from './harness.js';
import {
  colorDistance,
  estimateBackgroundColor,
  classifyCellPixels,
  sampleCellInterior,
  classifyGridCells,
} from '../src/cellStateDetect.js';
import { FILLED, EMPTY, UNKNOWN } from '../src/model.js';

// ---- test helpers -------------------------------------------------------------------------
//
// Reference colors below are the REAL measured pixel values from this feature's own real test
// screenshot (see TODO.md's Current Objective and CLAUDE.md's "prefer real image data" rule)
// — sampled directly from a solid-filled cell, a genuine X-marked cell's stroke, and a blank
// cell's background, via the project's real scan target app. Not guessed/synthetic palette
// values.
const BG = [255, 255, 255]; // blank cell background (white)
const FILL = [18, 158, 123]; // solid fill color (a saturated green)
const STROKE = [59, 59, 59]; // X-mark stroke color (near-black, NOT the same hue as fill)

// Builds a flat RGBA pixel array (row-major, 4 bytes/px) for one width x height cell crop,
// via a per-pixel color callback -- the same "plain array in" shape classifyCellPixels
// consumes (as from CanvasRenderingContext2D#getImageData().data), so these tests exercise
// the exact function scanUI.js calls, not a reimplementation of it.
function makeCell(width, height, colorAt) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function blankCell(width, height) {
  return makeCell(width, height, () => BG);
}

function filledCell(width, height) {
  return makeCell(width, height, () => FILL);
}

// Draws a background cell with an X: two ~strokeWidth-px-thick diagonal strokes from corner
// to corner, matching how this project's real target app renders an X-marked cell (a thin
// stroke crossing corner to corner, not a filled block) -- see CLAUDE.md's note that X-marks
// specifically need real stroke-geometry handling, unlike the "large block" fill case.
function xMarkedCell(width, height, strokeWidth = 3) {
  return makeCell(width, height, (x, y) => {
    const u = x / (width - 1);
    const v = y / (height - 1);
    const distMain = Math.abs(u - v) * Math.min(width, height);
    const distAnti = Math.abs(u + v - 1) * Math.min(width, height);
    if (Math.min(distMain, distAnti) <= strokeWidth / 2) return STROKE;
    return BG;
  });
}

// Wraps a plain pixel array as the {pixels, width, height} shape classifyGridCells expects.
function cellEntry(pixels, width, height) {
  return { pixels, width, height };
}

describe('colorDistance', () => {
  test('zero for identical colors', () => {
    assertEqual(colorDistance(BG, BG), 0);
  });
  test('large for very different colors (fill vs. background)', () => {
    assert(colorDistance(FILL, BG) > 100, 'expected fill/background distance to be large');
  });
});

describe('estimateBackgroundColor', () => {
  test('returns white default for no samples', () => {
    assertEqual(estimateBackgroundColor([]), [255, 255, 255]);
  });

  test('picks the majority color as background, ignoring a minority of fill/mark pixels', () => {
    const samples = [];
    for (let i = 0; i < 200; i++) samples.push(BG);
    for (let i = 0; i < 20; i++) samples.push(FILL); // a minority of "ink" pixels mixed in
    const bg = estimateBackgroundColor(samples);
    assert(colorDistance(bg, BG) < 5, `expected background near white, got ${bg}`);
  });

  test('is robust to which color happens to be brighter (not a brightness-only estimate)', () => {
    // A majority-dark "background" with a bright minority -- unlike inkThreshold's grayscale
    // percentile (which explicitly assumes background is the LIGHTER tail), this should still
    // just pick whichever color is the mode, regardless of which one is brighter.
    const DARK_BG = [20, 20, 20];
    const samples = [];
    for (let i = 0; i < 200; i++) samples.push(DARK_BG);
    for (let i = 0; i < 20; i++) samples.push(BG);
    const bg = estimateBackgroundColor(samples);
    assert(colorDistance(bg, DARK_BG) < 5, `expected background near dark majority, got ${bg}`);
  });
});

describe('classifyCellPixels', () => {
  const W = 37; // real measured cell size (px) from this feature's own test screenshot
  const H = 37;

  test('a solid fill reads as FILLED', () => {
    const result = classifyCellPixels(filledCell(W, H), W, H, BG);
    assertEqual(result.state, FILLED);
    assert(result.inkFraction > 0.9, `expected near-total ink coverage, got ${result.inkFraction}`);
  });

  test('a blank cell reads as UNKNOWN', () => {
    const result = classifyCellPixels(blankCell(W, H), W, H, BG);
    assertEqual(result.state, UNKNOWN);
    assertEqual(result.inkFraction, 0);
  });

  test('a genuine X-mark (two diagonal strokes) reads as EMPTY', () => {
    const result = classifyCellPixels(xMarkedCell(W, H), W, H, BG);
    assertEqual(result.state, EMPTY);
    assert(result.diagRatio > 0.5, `expected most ink on the diagonals, got ${result.diagRatio}`);
  });

  test('grid-line bleed right at the cell edge does not read as a mark (border margin excludes it)', () => {
    // A 2px-thick dark line hugging just the left edge of the crop -- the kind of bleed a
    // cell crop sliced by even-subdivision can carry at its own boundary (see
    // gridDetect.js's centerRectOnBorders comment for the real version of this problem).
    const pixels = makeCell(W, H, (x) => (x < 2 ? STROKE : BG));
    const result = classifyCellPixels(pixels, W, H, BG);
    assertEqual(result.state, UNKNOWN);
  });

  test('a real internal grid line crossing straight through the interior is NOT mistaken for an X', () => {
    // Reproduces the real bug this feature's cell-boundary fix (gridDetect.js's
    // centerRectOnBorders) was written to prevent: a single straight vertical (or horizontal)
    // line through the middle of a cell crop is geometrically close to BOTH diagonals only
    // very near the exact center, unlike a real X's two strokes which run corner-to-corner
    // along their full length -- so a real X should have far more of its ink sitting on the
    // diagonal band than a single straight line crossing through the middle does.
    const straightLine = makeCell(W, H, (x) => (Math.abs(x - W / 2) <= 1 ? STROKE : BG));
    const straightResult = classifyCellPixels(straightLine, W, H, BG);
    const xResult = classifyCellPixels(xMarkedCell(W, H), W, H, BG);
    assert(
      xResult.diagRatio > straightResult.diagRatio,
      `expected a real X (${xResult.diagRatio}) to score higher on-diagonal than a straight line (${straightResult.diagRatio})`
    );
    assertEqual(straightResult.state, UNKNOWN);
  });

  test('classifies correctly against the real measured X-mark stats (ink ~0.27, on-diagonal ~0.81)', () => {
    // Sanity-checks the DEFAULT thresholds directly against real numbers pulled from this
    // feature's own test screenshot (see TODO.md), not just synthetic shapes.
    const result = classifyCellPixels(xMarkedCell(W, H, 4), W, H, BG);
    assertEqual(result.state, EMPTY);
  });
});

describe('sampleCellInterior', () => {
  test('excludes the border margin from returned samples', () => {
    const W = 20, H = 20;
    const pixels = makeCell(W, H, (x, y) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? STROKE : BG));
    const samples = sampleCellInterior(pixels, W, H, { stride: 1 });
    for (const [r, g, b] of samples) {
      assertEqual([r, g, b], BG, 'expected only interior (background) pixels, no border stroke');
    }
  });
});

describe('classifyGridCells', () => {
  test('classifies a small mixed grid (blank/filled/X) and estimates the right background', () => {
    const W = 37, H = 37;
    const cells = [
      [cellEntry(blankCell(W, H), W, H), cellEntry(filledCell(W, H), W, H)],
      [cellEntry(xMarkedCell(W, H), W, H), cellEntry(blankCell(W, H), W, H)],
    ];
    const { backgroundColor, states } = classifyGridCells(cells);
    assert(colorDistance(backgroundColor, BG) < 5, `expected white background estimate, got ${backgroundColor}`);
    assertEqual(states[0][0].state, UNKNOWN);
    assertEqual(states[0][1].state, FILLED);
    assertEqual(states[1][0].state, EMPTY);
    assertEqual(states[1][1].state, UNKNOWN);
  });

  test('a mostly-blank grid finds the right background even for cells with almost no background pixels of their own', () => {
    // Mirrors the real design goal (see cellStateDetect.js's own file comment): a fully-
    // filled cell has NO real background pixels of its own to estimate from, so the
    // background estimate must be pooled across the WHOLE grid (where most cells, typical for
    // a mid-solve scan -- this feature's actual target use case, see TODO.md -- are still
    // blank), not guessed per-cell.
    const W = 37, H = 37;
    const cells = [];
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) {
        row.push(cellEntry(r === 0 && c === 0 ? filledCell(W, H) : blankCell(W, H), W, H));
      }
      cells.push(row);
    }
    const { states } = classifyGridCells(cells);
    assertEqual(states[0][0].state, FILLED);
    assertEqual(states[1][1].state, UNKNOWN);
  });
});
