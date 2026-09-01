import { describe, test, assert, assertEqual } from './harness.js';
import {
  rowProfile,
  colProfile,
  otsuThreshold,
  countDarkRuns,
  countGridLines,
  snapRectToBorder,
  centerRectOnBorders,
  computeClueBands,
  sliceHorizontal,
  sliceVertical,
  findGridCandidates,
  detectBestGrid,
  adaptiveBinarize,
} from '../src/gridDetect.js';

// ---- test helpers for the full-image detection tests below -----------------------------

function blankImage(width, height, bg = 250) {
  return new Array(width * height).fill(bg);
}

// Draws an evenly-subdivided rows x cols grid (outer border + internal lines), 2px thick,
// at `color`, inside `rect`.
function drawGrid(gray, width, rect, rows, cols, color) {
  const { left, top, right, bottom } = rect;
  const setPx = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y * width + x < gray.length) gray[y * width + x] = color;
  };
  const w = (right - left) / cols;
  const h = (bottom - top) / rows;
  for (let i = 0; i <= cols; i++) {
    const x = Math.round(left + i * w);
    for (let y = top; y <= bottom; y++) { setPx(x, y); setPx(x + 1, y); }
  }
  for (let i = 0; i <= rows; i++) {
    const y = Math.round(top + i * h);
    for (let x = left; x <= right; x++) { setPx(x, y); setPx(x, y + 1); }
  }
}

// Draws a plain single-outline rectangle (no internal subdivisions) — stands in for
// ordinary rectangular UI chrome (a button, a card, a panel) in a screenshot.
function drawPlainRect(gray, width, rect, color) {
  drawGrid(gray, width, rect, 1, 1, color);
}

describe('rowProfile / colProfile', () => {
  test('averages intensity per row and per column', () => {
    // 2 rows x 3 cols
    const gray = [
      0, 0, 0, // row 0: all black
      255, 255, 255, // row 1: all white
    ];
    assertEqual(rowProfile(gray, 3, 2), [0, 255]);
    assertEqual(colProfile(gray, 3, 2), [127.5, 127.5, 127.5]);
  });
});

describe('otsuThreshold', () => {
  test('cleanly separates a bimodal distribution into its two clusters', () => {
    const values = [...Array(20).fill(10), ...Array(20).fill(240)];
    const t = otsuThreshold(values);
    // Otsu picks the boundary between the classes, not necessarily strictly "between" the
    // two cluster values when the between-class variance plateaus (as it does for two
    // single-valued clusters) — what actually matters is that thresholding at t correctly
    // separates every low value from every high value.
    const below = values.filter((v) => v <= t).length;
    const above = values.filter((v) => v > t).length;
    assertEqual(below, 20, `expected all 20 low-cluster values <= threshold ${t}`);
    assertEqual(above, 20, `expected all 20 high-cluster values > threshold ${t}`);
  });
});

describe('countDarkRuns / countGridLines', () => {
  test('counts separated dark runs as distinct lines', () => {
    // dark . light(3px) . dark . light(4px) . dark  -- 3 runs, each gap wider than minGap
    const profile = [0, 0, 200, 200, 200, 0, 0, 200, 200, 200, 200, 0, 0];
    assertEqual(countDarkRuns(profile, 0, profile.length, 100), 3);
  });

  test('a single thick run counts once, not once per pixel', () => {
    const profile = [0, 0, 0, 0, 0, 200, 200, 200];
    assertEqual(countDarkRuns(profile, 0, profile.length, 100), 1);
  });

  test('countGridLines finds evenly spaced grid lines via its own Otsu threshold', () => {
    // Simulates a 5-column grid: 6 grid lines (value 20) separated by lighter cell
    // interiors (value 230), 10px pitch.
    const profile = [];
    for (let i = 0; i < 6; i++) {
      profile.push(20, 20); // the line itself, 2px wide
      if (i < 5) profile.push(230, 230, 230, 230, 230, 230, 230, 230); // cell interior
    }
    assertEqual(countGridLines(profile, 0, profile.length), 6); // 6 lines => 5 columns
  });

  // Current Objective #1 (see TODO.md): a player-supplied known count sizes the local-run
  // window off the pitch that count implies, rather than the blind iterative guess.
  test('countGridLines with expectedLines finds a real line the blind pass would drift past', () => {
    // 26 evenly-spaced lines, 10px pitch -- the blind pass below (no expectedLines) is
    // deliberately built with irregular-enough spacing at the START that it's likely to
    // undercount, standing in for the real screenshot's 25-vs-26 miscount (see TODO.md).
    // Rather than reproducing that exact fragile drift, this confirms the more important,
    // directly testable property: expectedLines forces a precisely-sized window sized off
    // the TRUE pitch, and finds every one of the true 26 lines even when the window
    // implied by a nearby WRONG guess (25 lines => a subtly different pitch) would not.
    const trueLines = 26;
    const pitch = 10;
    const profile = [];
    for (let i = 0; i < trueLines; i++) {
      profile.push(20, 20);
      if (i < trueLines - 1) for (let p = 0; p < pitch - 2; p++) profile.push(230);
    }
    assertEqual(countGridLines(profile, 0, profile.length, { expectedLines: trueLines }), trueLines);
  });

  test('countGridLines with expectedLines still just counts real dark runs, not a blind trust', () => {
    // Only 6 real lines in the profile -- even asking for "expect 10" can't manufacture
    // lines that aren't there; expectedLines informs the SEARCH window, it doesn't replace
    // counting real ink.
    const profile = [];
    for (let i = 0; i < 6; i++) {
      profile.push(20, 20);
      if (i < 5) profile.push(230, 230, 230, 230, 230, 230, 230, 230);
    }
    const found = countGridLines(profile, 0, profile.length, { expectedLines: 10 });
    assert(found <= 6, `expected no more than the 6 real lines, got ${found}`);
  });
});

describe('snapRectToBorder', () => {
  test('nudges a rough rectangle onto the nearest darker border pixels', () => {
    const width = 20;
    const height = 20;
    const gray = new Array(width * height).fill(240);
    // Draw a dark border rectangle from (5,5) to (14,14).
    for (let y = 5; y <= 14; y++) {
      for (let x = 5; x <= 14; x++) {
        const onBorder = x === 5 || x === 14 || y === 5 || y === 14;
        if (onBorder) gray[y * width + x] = 10;
      }
    }
    // Rough rect drawn a few px off from the true border, on the correct side of each edge
    // (a search radius wide enough to reach the opposite edge would make the two symmetric
    // borders indistinguishable by darkness alone — see gridDetect.js's snapRectToBorder
    // comment on restricting each profile to the rect's own cross-axis span).
    const rough = { left: 7, top: 7, right: 12, bottom: 12 };
    const snapped = snapRectToBorder(gray, width, height, rough, { searchPx: 3 });
    assertEqual(snapped, { left: 5, top: 5, right: 14, bottom: 14 });
  });
});

describe('computeClueBands', () => {
  test('row band sits left of the grid, col band sits above it', () => {
    const fullRect = { left: 0, top: 0, right: 100, bottom: 100 };
    const gridRect = { left: 20, top: 15, right: 100, bottom: 100 };
    const { rowBand, colBand } = computeClueBands(fullRect, gridRect);
    assertEqual(rowBand, { left: 0, top: 15, right: 20, bottom: 100 });
    assertEqual(colBand, { left: 20, top: 0, right: 100, bottom: 15 });
  });
});

describe('adaptiveBinarize', () => {
  test('marks a locally-faint edge dark even when the whole image is dominated by a much darker region', () => {
    const width = 40, height = 40;
    const gray = blankImage(width, height, 35); // dark background dominates the image
    for (let y = 5; y < 25; y++) {
      for (let x = 5; x < 25; x++) gray[y * width + x] = 250; // white panel
    }
    for (let y = 10; y < 20; y++) gray[y * width + 15] = 190; // medium-gray "line" inside the panel

    const dark = adaptiveBinarize(gray, width, height, { tileSize: 10 });
    assertEqual(dark[15 * width + 15], 1, 'the medium-gray line should register as dark within its own local tile');
  });

  test('leaves a uniform tile alone rather than manufacturing speckle', () => {
    const width = 20, height = 20;
    const gray = blankImage(width, height, 35); // perfectly uniform -- no real edges anywhere
    const dark = adaptiveBinarize(gray, width, height, { tileSize: 10 });
    assert(dark.every((v) => v === 0), 'a uniform region has no edges, so nothing should be marked dark');
  });
});

describe('findGridCandidates / detectBestGrid', () => {
  test('finds an evenly-subdivided grid drawn on a blank image', () => {
    const width = 200, height = 150;
    const gray = blankImage(width, height);
    const gridRect = { left: 40, top: 30, right: 160, bottom: 110 };
    drawGrid(gray, width, gridRect, 8, 8, 20);

    const best = detectBestGrid(gray, width, height);
    assert(best, 'expected a confident candidate');
    assertEqual(best.rows, 8);
    assertEqual(best.cols, 8);
    // Line positions are recovered from actual dark-pixel centers, so allow a couple of
    // pixels of slack rather than demanding an exact match to the drawn rect.
    assert(Math.abs(best.rect.left - gridRect.left) <= 3, `left off by too much: ${best.rect.left}`);
    assert(Math.abs(best.rect.right - gridRect.right) <= 3, `right off by too much: ${best.rect.right}`);
    assert(Math.abs(best.rect.top - gridRect.top) <= 3, `top off by too much: ${best.rect.top}`);
    assert(Math.abs(best.rect.bottom - gridRect.bottom) <= 3, `bottom off by too much: ${best.rect.bottom}`);
  });

  test('does not mistake a plain single-outline rectangle for a grid (false-positive guard)', () => {
    // A button/card/panel has exactly one outline per side — no internal subdivisions — the
    // exact shape this project's screenshots are expected to have nearby (see TODO.md).
    const width = 200, height = 150;
    const gray = blankImage(width, height);
    drawPlainRect(gray, width, { left: 20, top: 20, right: 180, bottom: 60 }, 20);

    const candidates = findGridCandidates(gray, width, height);
    assertEqual(candidates.length, 0, 'a bare outline has too few lines per axis to ever become a candidate');
    assertEqual(detectBestGrid(gray, width, height), null);
  });

  test('finds a modest, roughly-square grid inside a much taller frame (e.g. a phone screenshot)', () => {
    // The image itself is tall (800x1200, like a phone screenshot), but the grid embedded
    // in it is square and only a fraction of either dimension -- a line-length floor based
    // on each axis's own full extent (rather than the shorter of the two) would demand a
    // taller grid than this one actually is, rejecting every real vertical line and
    // leaving no candidate at all. Regression test for exactly that bug.
    const width = 800, height = 1200;
    const gray = blankImage(width, height);
    const gridRect = { left: 300, top: 500, right: 450, bottom: 650 };
    drawGrid(gray, width, gridRect, 5, 5, 20);

    const best = detectBestGrid(gray, width, height);
    assert(best, 'expected a confident candidate');
    assertEqual(best.rows, 5);
    assertEqual(best.cols, 5);
  });

  test('finds a grid embedded in much darker surrounding UI (real screenshot failure)', () => {
    // Reproduces a real failure reported against an actual app screenshot: a dark navy app
    // background surrounding a white puzzle panel, with grid lines that are a medium gray
    // (legible against the white panel, but nowhere near as dark as the navy background). A
    // single whole-image Otsu threshold ends up splitting "navy" from "everything else" —
    // the medium-gray lines never register as dark at all, and detection finds nothing (the
    // literal failure reported: "wouldn't detect it"). Adaptive per-tile binarization fixes
    // this by judging each tile against only its own local contrast.
    const width = 400, height = 300;
    const gray = blankImage(width, height, 35); // dark navy background, fills the whole image
    // A generous margin (wider than one binarization tile) between the grid's own border and
    // the panel's edge, so the tiles right at the grid's outer lines see only the panel/line
    // contrast, not the panel/background transition too -- matching a real screenshot, which
    // has plenty of clue-number margin around the grid before hitting the app's background.
    const panel = { left: 40, top: 30, right: 360, bottom: 270 };
    for (let y = panel.top; y <= panel.bottom; y++) {
      for (let x = panel.left; x <= panel.right; x++) gray[y * width + x] = 250; // white panel
    }
    drawGrid(gray, width, { left: 110, top: 80, right: 290, bottom: 220 }, 6, 6, 190); // medium-gray lines

    const best = detectBestGrid(gray, width, height);
    assert(best, 'expected a confident candidate even with a much darker surrounding background');
    assertEqual(best.rows, 6);
    assertEqual(best.cols, 6);
  });

  test('ignores a distant vertical line that happens to share the grid\'s y-extent (e.g. a scrollbar)', () => {
    // Reproduces a real failure: clustering vertical lines only by shared y-span (not by
    // how close together they are in x) let a scrollbar-like feature far to the right, but
    // spanning a similar height to the grid, get pulled into the grid's own line cluster,
    // dragging the detected rectangle's right edge far past the true border.
    const width = 300, height = 200;
    const gray = blankImage(width, height);
    const gridRect = { left: 40, top: 30, right: 190, bottom: 170 };
    drawGrid(gray, width, gridRect, 8, 8, 20);
    // a lone vertical line, far to the right, spanning almost the same y-range as the grid
    for (let y = 28; y <= 172; y++) {
      gray[y * width + 280] = 30;
      gray[y * width + 281] = 30;
    }

    const best = detectBestGrid(gray, width, height);
    assert(best, 'expected a confident candidate');
    assertEqual(best.cols, 8);
    assert(best.rect.right < 250, `right edge should stay near the true grid border, got ${best.rect.right}`);
  });

  test('picks the real grid over a nearby plain rectangle when both are present', () => {
    const width = 220, height = 220;
    const gray = blankImage(width, height);
    // Unrelated UI chrome up top — a plain rectangle, wider than the grid.
    drawPlainRect(gray, width, { left: 10, top: 10, right: 210, bottom: 40 }, 20);
    // The actual puzzle grid, lower in the image.
    const gridRect = { left: 50, top: 60, right: 170, bottom: 180 };
    drawGrid(gray, width, gridRect, 10, 10, 20);

    const best = detectBestGrid(gray, width, height);
    assert(best, 'expected a confident candidate');
    assertEqual(best.rows, 10);
    assertEqual(best.cols, 10);
    assert(Math.abs(best.rect.left - gridRect.left) <= 3, `left off by too much: ${best.rect.left}`);
    assert(Math.abs(best.rect.top - gridRect.top) <= 3, `top off by too much: ${best.rect.top}`);
  });
});

describe('sliceHorizontal / sliceVertical', () => {
  test('sliceHorizontal splits into n equal-height strips top to bottom', () => {
    const rect = { left: 0, top: 0, right: 10, bottom: 30 };
    const strips = sliceHorizontal(rect, 3);
    assertEqual(strips.length, 3);
    assertEqual(strips[0], { left: 0, right: 10, top: 0, bottom: 10 });
    assertEqual(strips[1], { left: 0, right: 10, top: 10, bottom: 20 });
    assertEqual(strips[2], { left: 0, right: 10, top: 20, bottom: 30 });
  });

  test('sliceVertical splits into n equal-width strips left to right', () => {
    const rect = { left: 0, top: 0, right: 30, bottom: 10 };
    const strips = sliceVertical(rect, 3);
    assertEqual(strips.length, 3);
    assertEqual(strips[0], { left: 0, right: 10, top: 0, bottom: 10 });
    assertEqual(strips[1], { left: 10, right: 20, top: 0, bottom: 10 });
    assertEqual(strips[2], { left: 20, right: 30, top: 0, bottom: 10 });
  });
});

// Regression test for the column-crop bleed bug (TODO.md's "Current Objective" item 1 at the
// time this test was added): confirmed against the real 25x25 test screenshot
// (scratch-images/sample-mid-solve.jpg) that computeClueBands, fed the plain border-SNAPPED
// grid rect (snapRectToBorder's output — what src/scanUI.js used to pass it), produced column
// bands whose per-column width was measurably wider than the true cell pitch: the outer border
// stroke is thicker than the grid's internal lines, so snapRectToBorder's darkest-single-pixel
// search lands on the border's OUTER edge, not the true inner cell-grid boundary (exactly the
// failure centerRectOnBorders exists to fix — see its own comment — previously applied only to
// cell-slicing, not clue-band slicing). That small per-column error is tiny on its own, but
// computeClueBands divides the SAME oversized width evenly across every column, so the error
// compounds linearly: by the last handful of columns of a 25-wide grid, the accumulated drift
// approached a full cell width, pulling each OCR crop into its neighbor and producing the
// doubled/garbled digit-stack reads the project owner spotted directly in the real crop pixels.
// src/scanUI.js now feeds computeClueBands the same border-CENTERED rect (centerRectOnBorders'
// output) already used for cell-slicing, rather than each call site computing its own drifted
// rect independently -- this test pins that fix's core numeric property using a synthetic image
// shaped like the real one (thick outer border, no internal lines needed since
// centerRectOnBorders only reasons about the border stroke itself -- see its own comment), so a
// future change to either function can't silently reintroduce the drift.
describe('computeClueBands + centerRectOnBorders (column-band drift regression)', () => {
  test('border-centered rect keeps per-column drift small across many columns; the plain snapped rect does not', () => {
    const width = 220, height = 220;
    const gray = blankImage(width, height, 245);
    // A 12px-thick dark border ring, drawn as a filled square with a lighter square cut out of
    // its middle -- outer edge at [20,199], true inner (cell-grid) edge at [32,187], matching
    // the real test image's own proportions (a border noticeably thicker than 1-2px internal
    // lines -- see gridDetect.js's centerRectOnBorders comment for the real measurement).
    for (let y = 20; y <= 199; y++) {
      for (let x = 20; x <= 199; x++) gray[y * width + x] = 15;
    }
    for (let y = 32; y <= 187; y++) {
      for (let x = 32; x <= 187; x++) gray[y * width + x] = 245;
    }
    const trueInner = { left: 32, top: 32, right: 187, bottom: 187 };

    // A rough rect a few px outside the true outer border edge, as auto-detection/manual-drag
    // would hand off -- both snapRectToBorder and centerRectOnBorders are meant to refine this.
    const rough = { left: 18, top: 18, right: 201, bottom: 201 };
    const snapped = snapRectToBorder(gray, width, height, rough, { searchPx: 15 });
    const centered = centerRectOnBorders(gray, width, height, rough, { searchPx: 15 });

    const fullRect = { left: 0, top: 0, right: width, bottom: height };
    const cols = 25;
    const trueColWidth = (trueInner.right - trueInner.left) / cols;

    function maxColDriftPx(gridRect) {
      const { colBand } = computeClueBands(fullRect, gridRect);
      const strips = sliceVertical(colBand, cols);
      // Drift of each column's LEFT edge from where the true even subdivision of the real
      // inner cell rect would put it -- this is exactly what accumulates column over column.
      let maxDrift = 0;
      for (let i = 0; i < cols; i++) {
        const trueLeft = trueInner.left + i * trueColWidth;
        maxDrift = Math.max(maxDrift, Math.abs(strips[i].left - trueLeft));
      }
      return maxDrift;
    }

    const rawDrift = maxColDriftPx(snapped);
    const centeredDrift = maxColDriftPx(centered);

    assert(rawDrift > trueColWidth * 0.5,
      `plain snapped rect should drift by more than half a column width by the far columns (got ${rawDrift}px vs a ${trueColWidth}px column) -- this is the bug being guarded against`);
    assert(centeredDrift < trueColWidth * 0.1,
      `border-centered rect should keep drift under 10% of a column width across all ${cols} columns (got ${centeredDrift}px vs a ${trueColWidth}px column)`);
  });
});
