import { describe, test, assert, assertEqual } from './harness.js';
import {
  rowProfile,
  colProfile,
  otsuThreshold,
  countDarkRuns,
  countGridLines,
  snapRectToBorder,
  computeClueBands,
  sliceHorizontal,
  sliceVertical,
} from '../src/gridDetect.js';

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
