// Pure grid-geometry helpers for the scan-existing-puzzle flow (item 10): grid-line
// counting, border-snapping, and clue-band slicing. All functions here take plain numeric
// arrays/rectangles, never a Canvas/ImageData/DOM node, so they run — and are tested —
// under plain Node (see test/gridDetect.test.js), matching this project's no-framework test
// setup. Turning a photo into the grayscale array these functions consume, and turning
// their output rectangles into actual OCR crops, is src/scanUI.js's job (the one module in
// this feature allowed to touch the DOM/canvas).
//
// Design tradeoff (documented per CLAUDE.md's "explain design tradeoffs" convention): rather
// than pinpointing every individual internal grid line from the image — fragile against a
// real photo's noise, uneven lighting, and slight skew — cell/clue boundaries are computed
// as an EVEN subdivision of one detected outer rectangle (see sliceHorizontal/
// sliceVertical). The pixel analysis here is used for two narrower, more forgiving jobs
// instead: snapping a rough user-drawn rectangle onto the puzzle's actual bordered edge
// (snapRectToBorder), and counting how many grid lines are present to suggest a row/col
// count that the user still confirms before OCR runs (countGridLines). If per-line
// detection ever proves necessary (e.g. for skewed photos), it belongs here as an addition,
// not a replacement — the even-subdivision path should stay as the reliable fallback.

// ---- profiles ---------------------------------------------------------------

// Average pixel intensity (0 = black .. 255 = white) per row / per column of a grayscale
// image region. Grid lines and printed digits both show up as local dips — darker than the
// paper they're printed on.
// The optional {xStart, xEnd} / {yStart, yEnd} restrict which columns/rows are averaged
// over — used by snapRectToBorder to localize each profile to the rectangle's own span on
// the cross axis, rather than the whole image (which can carry unrelated dark content, like
// clue-margin text, outside the rectangle being snapped).
export function rowProfile(gray, width, height, { xStart = 0, xEnd = width } = {}) {
  const out = new Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width;
    for (let x = xStart; x < xEnd; x++) sum += gray[base + x];
    out[y] = sum / (xEnd - xStart);
  }
  return out;
}

export function colProfile(gray, width, height, { yStart = 0, yEnd = height } = {}) {
  const out = new Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = yStart; y < yEnd; y++) sum += gray[y * width + x];
    out[x] = sum / (yEnd - yStart);
  }
  return out;
}

// ---- thresholding ---------------------------------------------------------

// Otsu's method: picks the intensity threshold that best splits a bimodal set of values
// (here, "grid line / ink" pixels vs. "paper background" pixels) into two classes by
// maximizing between-class variance. Standard, deterministic, no tuning knobs — adapts to
// each photo's own lighting instead of relying on one fixed brightness cutoff.
export function otsuThreshold(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) {
    const bin = Math.max(0, Math.min(255, Math.round(v)));
    hist[bin]++;
  }
  const total = values.length;
  if (total === 0) return 127;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

// ---- grid line counting ---------------------------------------------------

// Counts contiguous "dark" runs in a 1D profile over [start, end) — each run is one grid
// line. Adjacent dark samples merge into a single run (a printed line is usually a few
// pixels wide); `minGap` filters out runs that immediately follow another, which would
// otherwise double-count one thick line as two.
export function countDarkRuns(profile, start, end, threshold, { minGap = 2 } = {}) {
  let count = 0;
  let lastRunEnd = -Infinity;
  let inRun = false;
  for (let i = start; i < end; i++) {
    const dark = profile[i] <= threshold;
    if (dark && !inRun) {
      if (i - lastRunEnd > minGap) count++;
      inRun = true;
    } else if (!dark && inRun) {
      inRun = false;
      lastRunEnd = i;
    }
  }
  return count;
}

// Suggests how many grid lines (not cells — cells = lines - 1) are present along one axis
// of a rectangle, thresholding via Otsu on that rectangle's own slice of the profile so it
// adapts to the photo's actual lighting rather than a fixed brightness cutoff. This is a
// suggestion the scan wizard pre-fills for the user to confirm or correct, never applied
// blind — a noisy photo can over/under-count.
export function countGridLines(profile, start, end) {
  const slice = profile.slice(start, end);
  const threshold = otsuThreshold(slice);
  return countDarkRuns(profile, start, end, threshold);
}

// ---- border snapping ---------------------------------------------------

// Nudges one edge coordinate to the darkest nearby position in `profile` (the row/col
// average-intensity array for the axis that edge lies on), searching up to `searchPx` in
// either direction. Used to snap a rough user-drawn rectangle edge onto the puzzle's actual
// printed border, so the crop the user drags doesn't need to be pixel-perfect by hand.
function snapEdge(profile, roughPos, searchPx) {
  const clamped = Math.max(0, Math.min(profile.length - 1, Math.round(roughPos)));
  const lo = Math.max(0, clamped - searchPx);
  const hi = Math.min(profile.length - 1, clamped + searchPx);
  let best = clamped;
  let bestVal = profile[clamped];
  for (let i = lo; i <= hi; i++) {
    if (profile[i] < bestVal) {
      bestVal = profile[i];
      best = i;
    }
  }
  return best;
}

export function snapRectToBorder(gray, width, height, rect, { searchPx = 15 } = {}) {
  // Restrict each profile to the rect's own span on the cross axis (see rowProfile/
  // colProfile), so a left/right edge is judged only by darkness within this rectangle's
  // rows, and a top/bottom edge only by darkness within its columns — not polluted by
  // unrelated dark content elsewhere in the photo.
  const xStart = Math.max(0, Math.round(rect.left));
  const xEnd = Math.min(width, Math.round(rect.right));
  const yStart = Math.max(0, Math.round(rect.top));
  const yEnd = Math.min(height, Math.round(rect.bottom));
  const rp = rowProfile(gray, width, height, { xStart, xEnd });
  const cp = colProfile(gray, width, height, { yStart, yEnd });
  return {
    left: snapEdge(cp, rect.left, searchPx),
    top: snapEdge(rp, rect.top, searchPx),
    right: snapEdge(cp, rect.right, searchPx),
    bottom: snapEdge(rp, rect.bottom, searchPx),
  };
}

// ---- clue-band geometry ---------------------------------------------------

// Given the full puzzle crop (grid + both clue margins) and the detected cell-grid
// rectangle nested inside it, the row-clue margin is everything left of the grid at the
// grid's own row span, and the column-clue margin is everything above the grid at the
// grid's own column span — a printed nonogram's clue numbers always line up cell-for-cell
// with the grid line they describe, so no separate detection pass is needed for the
// margins themselves, just this geometry.
export function computeClueBands(fullRect, gridRect) {
  return {
    rowBand: { left: fullRect.left, top: gridRect.top, right: gridRect.left, bottom: gridRect.bottom },
    colBand: { left: gridRect.left, top: fullRect.top, right: gridRect.right, bottom: gridRect.top },
  };
}

function rectWidth(r) { return r.right - r.left; }
function rectHeight(r) { return r.bottom - r.top; }

// Slices a rectangle into `n` equal-width vertical strips, left to right — one per grid
// column, for the column-clue band.
export function sliceVertical(rect, n) {
  const w = rectWidth(rect) / n;
  return Array.from({ length: n }, (_, i) => ({
    left: rect.left + i * w,
    right: rect.left + (i + 1) * w,
    top: rect.top,
    bottom: rect.bottom,
  }));
}

// Slices a rectangle into `n` equal-height horizontal strips, top to bottom — one per grid
// row, for the row-clue band.
export function sliceHorizontal(rect, n) {
  const h = rectHeight(rect) / n;
  return Array.from({ length: n }, (_, i) => ({
    left: rect.left,
    right: rect.right,
    top: rect.top + i * h,
    bottom: rect.top + (i + 1) * h,
  }));
}
