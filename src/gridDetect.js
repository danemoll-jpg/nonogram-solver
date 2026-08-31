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

// ---- full-image auto grid detection ---------------------------------------
//
// Everything above this point either refines a rectangle the user already drew
// (snapRectToBorder) or slices one the user already confirmed (computeClueBands/
// sliceHorizontal/sliceVertical). The functions below instead search the *whole* image for
// the puzzle grid, so the scan wizard can highlight a candidate immediately on image load
// instead of making manual drag-to-select the only way in (see TODO.md's "Current
// Objective" for the bug this replaces).
//
// Design tradeoff, same spirit as the rest of this file: rather than a general-purpose
// rectangle detector, this looks specifically for what a nonogram grid looks like as pixels
// — a rectangle subdivided by *multiple, evenly-spaced* internal lines on both axes. That
// last part is the deliberate false-positive guard the project owner's screenshots need:
// ordinary rectangular UI chrome (a button, a card, a panel) has exactly one outline on each
// side — 2 horizontal lines + 2 vertical lines — and is rejected by `minLines` before it
// even becomes a candidate, regardless of how large or prominent it is. Only a genuinely
// subdivided grid (>= minLines per axis, i.e. several cells) is scored at all, and among
// scored candidates, regularity of line spacing and rectangle area break further ties toward
// the real grid over some other incidentally-regular UI element.

// Finds maximal horizontal runs of "dark" (<= threshold) pixels at least `minLen` long, one
// row at a time. Segments, not a whole-row average (contrast with rowProfile): a puzzle
// grid line usually spans only part of the image's width (the grid itself), not edge to
// edge, so averaging the full row would dilute a real line's darkness with unrelated light
// background on either side — exactly the failure mode this function avoids by tracking
// each dark run's own extent instead.
function horizontalSegments(gray, width, height, threshold, minLen) {
  const segs = [];
  for (let y = 0; y < height; y++) {
    const base = y * width;
    let runStart = -1;
    for (let x = 0; x <= width; x++) {
      const dark = x < width && gray[base + x] <= threshold;
      if (dark && runStart === -1) {
        runStart = x;
      } else if (!dark && runStart !== -1) {
        if (x - runStart >= minLen) segs.push({ y, xStart: runStart, xEnd: x - 1 });
        runStart = -1;
      }
    }
  }
  return segs;
}

// Mirror of horizontalSegments along the vertical axis, for vertical grid lines.
function verticalSegments(gray, width, height, threshold, minLen) {
  const segs = [];
  for (let x = 0; x < width; x++) {
    let runStart = -1;
    for (let y = 0; y <= height; y++) {
      const dark = y < height && gray[y * width + x] <= threshold;
      if (dark && runStart === -1) {
        runStart = y;
      } else if (!dark && runStart !== -1) {
        if (y - runStart >= minLen) segs.push({ x, yStart: runStart, yEnd: y - 1 });
        runStart = -1;
      }
    }
  }
  return segs;
}

// A printed line a few pixels thick produces one raw segment per row (or column) it
// occupies. Merges those into one band per actual line: consecutive rows/cols (within
// `maxGap`) whose spans overlap substantially are treated as the same line, and the band's
// span widens to their union (a later row's segment may reveal the line's true extent better
// than the first, e.g. if anti-aliasing shortened it). `posKey` is the axis the bands are
// merged along ('y' for horizontal segments, 'x' for vertical); `startKey`/`endKey` name the
// segment's cross-axis span ('xStart'/'xEnd' or 'yStart'/'yEnd').
function mergeSegmentBands(segs, posKey, startKey, endKey, { maxGap = 2, minOverlap = 0.6 } = {}) {
  const sorted = [...segs].sort((a, b) => a[posKey] - b[posKey]);
  const bands = [];
  for (const seg of sorted) {
    const band = bands.find((b) => {
      if (seg[posKey] - b.lastPos > maxGap) return false;
      const overlap = Math.min(seg[endKey], b[endKey]) - Math.max(seg[startKey], b[startKey]);
      const shorter = Math.min(seg[endKey] - seg[startKey], b[endKey] - b[startKey]) || 1;
      return overlap / shorter >= minOverlap;
    });
    if (band) {
      band.lastPos = seg[posKey];
      band.posSum += seg[posKey];
      band.count++;
      band[startKey] = Math.min(band[startKey], seg[startKey]);
      band[endKey] = Math.max(band[endKey], seg[endKey]);
    } else {
      bands.push({
        lastPos: seg[posKey],
        posSum: seg[posKey],
        count: 1,
        [startKey]: seg[startKey],
        [endKey]: seg[endKey],
      });
    }
  }
  return bands.map((b) => ({ pos: b.posSum / b.count, [startKey]: b[startKey], [endKey]: b[endKey] }));
}

// Intersection-over-union of two [start,end] spans: 0 when they don't overlap, 1 when they
// coincide exactly. Deliberately IoU rather than "overlap / shorter span" — the latter
// would call a long unrelated line (e.g. a wide banner spanning most of a screenshot) a
// match for a much shorter grid line just because the grid line's span sits entirely inside
// the long one, silently inflating a cluster's line count with lines that aren't part of
// the grid at all (caught by this file's own tests — see gridDetect.test.js's "picks the
// real grid over a nearby plain rectangle" case). IoU instead requires both spans to be
// close to the same size, not just overlapping.
function spanOverlapRatio(a, b, startKey, endKey) {
  const overlap = Math.min(a[endKey], b[endKey]) - Math.max(a[startKey], b[startKey]);
  if (overlap <= 0) return 0;
  const union = Math.max(a[endKey], b[endKey]) - Math.min(a[startKey], b[startKey]);
  return union > 0 ? overlap / union : 0;
}

// Groups line bands into clusters that share roughly the same cross-axis span — i.e. lines
// belonging to the same grid, as opposed to unrelated lines elsewhere in the image with a
// different extent (a table off to one side, a divider under a header, ...).
function clusterLinesBySpan(bands, startKey, endKey, minOverlapRatio) {
  const clusters = [];
  for (const band of bands) {
    const cluster = clusters.find((c) => spanOverlapRatio(band, c.span, startKey, endKey) >= minOverlapRatio);
    if (cluster) {
      cluster.lines.push(band);
      cluster.span[startKey] = Math.min(cluster.span[startKey], band[startKey]);
      cluster.span[endKey] = Math.max(cluster.span[endKey], band[endKey]);
    } else {
      clusters.push({ span: { [startKey]: band[startKey], [endKey]: band[endKey] }, lines: [band] });
    }
  }
  return clusters;
}

// How evenly spaced a sorted set of line positions is, as a score in (0, 1] (1 = perfectly
// even). A real grid's lines sit at a constant pitch; unrelated dark runs that happened to
// cluster together by cross-axis span usually don't.
function gapRegularity(positions) {
  const sorted = [...positions].sort((a, b) => a - b);
  if (sorted.length < 2) return 0;
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return 0;
  const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
  const coeffVariation = Math.sqrt(variance) / mean;
  return 1 / (1 + coeffVariation * 4);
}

// Searches the whole image for candidate grid rectangles and returns them sorted best-first.
// A candidate needs a cluster of >= `minLines` horizontal lines sharing one x-span, and a
// cluster of >= `minLines` vertical lines sharing one y-span, that mutually bound the same
// box (each cluster's line positions must line up with the *other* cluster's shared span,
// within `minBoxOverlap`) — see the file-level comment for why `minLines` alone already
// rejects plain single-outline UI rectangles. rows/cols come directly from the line counts
// (n lines bound n-1 cells), no separate line-counting pass needed for the auto path.
//
// `minLineOverlap` is deliberately stricter than `minBoxOverlap`: it decides whether two
// lines belong to the *same* line family (e.g. two of the grid's own row-dividers, which
// should have nearly identical x-spans), where a loose threshold would let one long
// unrelated line (a banner spanning much of the screenshot) absorb a shorter grid line into
// its cluster just because the grid line's span sits inside it. `minBoxOverlap` instead
// checks whether an already-formed horizontal-line cluster and vertical-line cluster
// describe the same box — true grid corners line up almost exactly, but a little more
// slack here is fine since it's comparing two independently-derived estimates of the same
// edges rather than deciding cluster membership.
export function findGridCandidates(gray, width, height, options = {}) {
  const { minLineLenRatio = 0.15, minLines = 4, minLineOverlap = 0.75, minBoxOverlap = 0.5 } = options;

  const threshold = otsuThreshold(gray);
  // Both floors are the same fraction of the SHORTER image dimension, not "this axis's own
  // dimension" — a nonogram grid is roughly square, but the photo/screenshot it's embedded
  // in usually isn't (a tall phone screenshot, say). Using each axis's own full extent as
  // its own threshold would demand a taller grid than actually exists just because the
  // image itself is tall, silently rejecting every real vertical line and leaving zero
  // candidates — caught by this file's own tests (see gridDetect.test.js's "small grid
  // inside a much taller frame" case).
  const minLen = Math.max(1, Math.round(Math.min(width, height) * minLineLenRatio));
  const minLenH = minLen;
  const minLenV = minLen;

  const hBands = mergeSegmentBands(horizontalSegments(gray, width, height, threshold, minLenH), 'y', 'xStart', 'xEnd');
  const vBands = mergeSegmentBands(verticalSegments(gray, width, height, threshold, minLenV), 'x', 'yStart', 'yEnd');

  const hClusters = clusterLinesBySpan(hBands, 'xStart', 'xEnd', minLineOverlap).filter((c) => c.lines.length >= minLines);
  const vClusters = clusterLinesBySpan(vBands, 'yStart', 'yEnd', minLineOverlap).filter((c) => c.lines.length >= minLines);

  const candidates = [];
  for (const hc of hClusters) {
    const hTop = Math.min(...hc.lines.map((l) => l.pos));
    const hBottom = Math.max(...hc.lines.map((l) => l.pos));
    for (const vc of vClusters) {
      const vLeft = Math.min(...vc.lines.map((l) => l.pos));
      const vRight = Math.max(...vc.lines.map((l) => l.pos));
      // The horizontal lines' shared x-span and the vertical lines' own x-positions must
      // describe the same box (and vice versa on the other axis) for these two clusters to
      // be the two axes of one grid, rather than unrelated structure that happened to
      // cluster on its own axis.
      const xMatch = spanOverlapRatio(hc.span, { xStart: vLeft, xEnd: vRight }, 'xStart', 'xEnd');
      const yMatch = spanOverlapRatio(vc.span, { yStart: hTop, yEnd: hBottom }, 'yStart', 'yEnd');
      if (xMatch < minBoxOverlap || yMatch < minBoxOverlap) continue;

      const rect = { left: vLeft, top: hTop, right: vRight, bottom: hBottom };
      const area = Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
      const sizeFactor = Math.min(1, area / (width * height * 0.05));
      const regH = gapRegularity(hc.lines.map((l) => l.pos));
      const regV = gapRegularity(vc.lines.map((l) => l.pos));
      const score = hc.lines.length * vc.lines.length * regH * regV * sizeFactor;

      candidates.push({ rect, rows: hc.lines.length - 1, cols: vc.lines.length - 1, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// Default confidence floor for accepting an auto-detected candidate without asking the user
// to draw one by hand. Chosen so a small, clean, evenly-spaced grid clears it comfortably
// (e.g. a 5x5 grid — 6 lines each axis, good regularity — scores well above this) while a
// borderline/noisy candidate that barely met `minLines` falls back to manual selection
// instead of confidently highlighting the wrong thing.
const DEFAULT_MIN_CONFIDENT_SCORE = 6;

// Convenience wrapper around findGridCandidates for the common case: the single best
// candidate if it's confident enough, otherwise null (the wizard falls back to manual
// drag-to-select when this returns null).
export function detectBestGrid(gray, width, height, options = {}) {
  const candidates = findGridCandidates(gray, width, height, options);
  if (!candidates.length) return null;
  const best = candidates[0];
  const minScore = options.minConfidentScore ?? DEFAULT_MIN_CONFIDENT_SCORE;
  return best.score >= minScore ? best : null;
}
