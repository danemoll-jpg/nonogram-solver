// DOM/canvas wiring for the "Scan a puzzle" wizard (item 10). This is the one module in the
// scan-existing-puzzle feature allowed to touch the DOM/canvas/Image — everything it calls
// out to (src/gridDetect.js, src/scanPuzzle.js, src/ocr.js) is plain data in/out and
// independently unit-tested. Kept out of app.js itself (already a large UI-dispatch file)
// per CLAUDE.md's "each module does one job"; app.js just calls initScanWizard() once at
// boot and wires one Help-menu button to open the modal.
//
// Wizard steps: upload a photo -> confirm the grid rectangle (auto-detected and highlighted
// on load with draggable corner/edge handles, falling back to manual drag-to-select only
// when auto-detection isn't confident — see gridDetect.js's findGridCandidates/
// detectBestGrid) -> OCR every row's and column's clue strip -> a correction pass (editable
// text next to a thumbnail of what was actually cropped) -> solve the confirmed clues into a
// real solution and hand the finished puzzle back to app.js via the onPuzzleReady callback.
//
// The grid step always has one clear, visible, enabled-when-ready button to move forward
// ("Looks good") regardless of whether the rectangle came from auto-detection or a manual
// drag — see TODO.md's "Current Objective" for the bug (no working way to proceed after a
// manual drag) this design replaces, not just patches.

import {
  rowProfile,
  colProfile,
  snapRectToBorder,
  centerRectOnBorders,
  countGridLines,
  computeClueBands,
  sliceHorizontal,
  sliceVertical,
  sliceGridCells,
  detectBestGrid,
} from './gridDetect.js';
import { parseClueText, buildScannedPuzzle } from './scanPuzzle.js';
import { recognizeClueStrip, terminateOcr } from './ocr.js';
import { findRuns, groupGlyphsIntoNumbers, filterNoiseLines } from './ocrSegment.js';
import { classifyGridCells } from './cellStateDetect.js';
import { isLineConsistent } from './lineSolver.js';
import { FILLED, EMPTY, UNKNOWN } from './model.js';

// Longest side, in pixels, for the canvas used for both on-screen dragging and grid-line
// analysis. Full sensor-resolution photos are unnecessary (and slow) for line detection;
// this just needs to be big enough that grid lines and the drag rectangle are comfortably
// visible/interactive.
const ANALYSIS_MAX_DIM = 800;
// Longest side, in pixels, for the higher-resolution canvas OCR crops are cut from — bigger
// than the analysis canvas since legible digits matter a lot more to OCR accuracy than to
// line detection, but still capped well below raw phone-camera resolution to keep memory
// and per-strip recognize() calls fast.
const FULL_MAX_DIM = 1600;
// Every OCR crop is upscaled to at least this tall (preserving aspect ratio) before
// recognition — a single grid row's worth of clue text can be a very short strip in pixels,
// and small text is where OCR accuracy falls off fastest.
const OCR_MIN_HEIGHT = 60;
// Smallest width/height (analysis-canvas px) a grid rectangle is allowed to shrink to via
// handle-dragging — well below any real puzzle grid, just prevents a handle drag from
// collapsing the box to nothing (which would leave no rectangle to snap/count lines from).
const MIN_RECT_SIZE = 20;

// Hardcoded mirror of styles.css's --gold — canvas 2D context fill/strokeStyle can't consume
// CSS custom properties directly.
const GOLD = '#e6b73f';

export function initScanWizard({ els, onPuzzleReady, onClose }) {
  const state = {
    analysisCanvas: null,
    analysisCtx: null,
    fullCanvas: null,
    scaleFullOverAnalysis: 1,
    // The one rectangle the grid step works with, analysis-canvas space — set either by
    // auto-detection on image load or by the user dragging one out by hand, then adjustable
    // via its corner/edge handles either way. Replaces the old separate roughRect/gridRect
    // split (roughRect while dragging, gridRect only once a since-removed "Detect grid"
    // button had run) with one rect that's always present and always editable, which is
    // what makes "Looks good" always a real, enabled action rather than something that only
    // appears after a click that may never have been wired up (see TODO.md's bug writeup).
    gridRect: null,
    autoDetected: false, // true if gridRect came from detectBestGrid rather than a hand-drawn box
    dragMode: null, // null | 'create' | 'move' | 'resize', while a pointer drag is in progress
    activeHandle: null, // the handle being resize-dragged, from getHandles()
    dragStart: null, // canvas-space point where the current drag began
    dragOrigRect: null, // gridRect snapshot at drag start, for 'move'/'resize' deltas
    rows: 0,
    cols: 0,
    rowClueInputs: [],
    colClueInputs: [],
    pendingPuzzle: null,
    // Detected fill/X state (Current Objective — see TODO.md), one FILLED/EMPTY/UNKNOWN per
    // cell, rows x cols. Computed once alongside the OCR pass (see scanBtnScanClues) since
    // both need the same confirmed grid rect; mutated in place by the fill-state review
    // step's click-to-correct handler (see renderFillStateGrid) before being handed off as
    // the puzzle's initialMarks.
    fillMarks: null,
    scanCount: 0, // used to mint a unique id per scanned puzzle this session
  };

  function showStep(name) {
    for (const el of [
      els.scanStepUpload,
      els.scanStepGrid,
      els.scanStepOcr,
      els.scanStepCorrect,
      els.scanStepFillstate,
      els.scanStepDone,
    ]) {
      el.classList.toggle('hidden', el.dataset.step !== name);
    }
  }

  function resetWizard() {
    state.analysisCanvas = null;
    state.analysisCtx = null;
    state.fullCanvas = null;
    state.gridRect = null;
    state.autoDetected = false;
    state.dragMode = null;
    state.activeHandle = null;
    state.dragStart = null;
    state.dragOrigRect = null;
    state.rowClueInputs = [];
    state.colClueInputs = [];
    state.pendingPuzzle = null;
    state.fillMarks = null;
    els.scanFileInput.value = '';
    els.scanGridHint.textContent = '';
    els.scanGridConfirm.classList.add('hidden');
    els.scanBtnConfirmGrid.disabled = true;
    els.scanRowClueList.innerHTML = '';
    els.scanColClueList.innerHTML = '';
    els.scanRecheckWarning.classList.add('hidden');
    els.scanBuildError.classList.add('hidden');
    els.scanFillstateGrid.innerHTML = '';
    showStep('upload');
  }

  // #scan-modal is a full-screen VIEW, not a floating modal (see its own comment in
  // index.html for the real-iOS scroll-bug history behind that) — opening it means hiding
  // the normal page content (#page-root, and the fixed-position #explain-panel, which would
  // otherwise float over this screen's own content) rather than layering on top of it.
  function openWizard() {
    resetWizard();
    els.pageRoot.classList.add('hidden');
    els.explainPanel.classList.add('hidden');
    els.scanModal.classList.remove('hidden');
    window.scrollTo(0, 0); // start at the top of the fresh screen, not wherever the page was scrolled to
  }

  function closeWizard() {
    els.scanModal.classList.add('hidden');
    els.pageRoot.classList.remove('hidden');
    els.explainPanel.classList.remove('hidden');
    terminateOcr().catch(() => {}); // free the OCR worker's wasm/network resources
    // Bug fix (Current Objective #2): the main board's --cell-size was last computed by
    // fitBoardToViewport whenever the board was rendered or the window resized/rotated —
    // neither of which fires just from unhiding #page-root again. Without this, the board
    // stays sized for whatever the viewport looked like before the wizard opened until the
    // player happens to trigger a resize (e.g. picking a puzzle re-renders it). onClose is
    // app.js's fitBoardToViewport, passed in at init since sizing logic lives there, not here.
    onClose?.();
  }

  // ---- step 1: load the photo onto both canvases ----

  function scaledSize(width, height, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }

  function drawImageToCanvas(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  async function loadImageFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read that image file.'));
        el.src = url;
      });

      const analysisSize = scaledSize(img.naturalWidth, img.naturalHeight, ANALYSIS_MAX_DIM);
      const fullSize = scaledSize(img.naturalWidth, img.naturalHeight, FULL_MAX_DIM);
      state.analysisCanvas = drawImageToCanvas(img, analysisSize.width, analysisSize.height);
      state.analysisCtx = state.analysisCanvas.getContext('2d');
      state.fullCanvas = drawImageToCanvas(img, fullSize.width, fullSize.height);
      state.scaleFullOverAnalysis = fullSize.width / analysisSize.width;

      els.scanCanvas.width = analysisSize.width;
      els.scanCanvas.height = analysisSize.height;
      runAutoDetect();
      redrawGridCanvas();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Runs on every fresh image load: searches the whole photo/screenshot for the puzzle grid
  // (see gridDetect.js's detectBestGrid for the false-positive guard against ordinary
  // rectangular UI chrome) and, if confident, pre-fills gridRect with it so the user lands
  // straight on a highlighted, adjustable box instead of an empty canvas requiring a manual
  // drag. Confirming (or redrawing) the box is still always required before OCR runs — this
  // only decides the box's *starting* position.
  function runAutoDetect() {
    const { width, height } = state.analysisCanvas;
    const gray = analysisGrayscale();
    const best = detectBestGrid(gray, width, height);
    if (best) {
      state.gridRect = { ...best.rect };
      state.autoDetected = true;
      els.scanGridHint.textContent =
        "Grid detected automatically — drag the gold handles to adjust it if it's not quite " +
        'right, or draw a new box yourself, then confirm below.';
    } else {
      state.gridRect = null;
      state.autoDetected = false;
      els.scanGridHint.textContent =
        "Couldn't auto-detect the grid — drag a box around just the puzzle's grid squares " +
        '(not the clue numbers around the edges), then confirm below.';
    }
    updateConfirmButtonState();
  }

  els.scanFileInput.addEventListener('change', async () => {
    const file = els.scanFileInput.files?.[0];
    if (!file) return;
    try {
      await loadImageFile(file);
      showStep('grid');
    } catch (err) {
      alert(err.message || 'Could not read that image file.'); // rare (corrupt file); a modal alert is fine for this one-off failure
    }
  });

  // ---- step 2: confirm the grid rectangle (auto-detected, or drag one out by hand) ----

  function toCanvasPoint(evt) {
    const rect = els.scanCanvas.getBoundingClientRect();
    const scaleX = els.scanCanvas.width / rect.width;
    const scaleY = els.scanCanvas.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  function normalizedRect(a, b) {
    return {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x),
      bottom: Math.max(a.y, b.y),
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // The 8 drag handles for the current gridRect: 4 corners (each moves two edges) + 4 edge
  // midpoints (each moves one edge). `x`/`y` are where the handle is drawn/hit-tested;
  // `edges` says which of the rect's edges a drag from this handle should move.
  function getHandles(rect) {
    const midX = (rect.left + rect.right) / 2;
    const midY = (rect.top + rect.bottom) / 2;
    return [
      { x: rect.left, y: rect.top, edges: ['left', 'top'] },
      { x: midX, y: rect.top, edges: ['top'] },
      { x: rect.right, y: rect.top, edges: ['right', 'top'] },
      { x: rect.right, y: midY, edges: ['right'] },
      { x: rect.right, y: rect.bottom, edges: ['right', 'bottom'] },
      { x: midX, y: rect.bottom, edges: ['bottom'] },
      { x: rect.left, y: rect.bottom, edges: ['left', 'bottom'] },
      { x: rect.left, y: midY, edges: ['left'] },
    ];
  }

  // Handle hit-test radius, canvas-space px — scales with image size so handles stay
  // comfortably tappable on a small screenshot without ballooning on a huge photo.
  function handleHitRadius() {
    const { width, height } = state.analysisCanvas;
    return Math.max(14, Math.round(Math.min(width, height) * 0.025));
  }

  function hitTestHandle(rect, p, radius) {
    let best = null;
    let bestDist = Infinity;
    for (const h of getHandles(rect)) {
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d <= radius && d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  function pointInRect(p, r) {
    return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  }

  function updateConfirmButtonState() {
    const r = state.gridRect;
    const hasSize = r && r.right - r.left > 10 && r.bottom - r.top > 10;
    els.scanBtnConfirmGrid.disabled = !hasSize;
  }

  function redrawGridCanvas() {
    if (!state.analysisCanvas) return;
    const ctx = els.scanCanvas.getContext('2d');
    ctx.drawImage(state.analysisCanvas, 0, 0);
    const rect = state.gridRect;
    if (!rect) return;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    if (rect.right - rect.left > 4 && rect.bottom - rect.top > 4) {
      const size = handleHitRadius() * 0.6; // drawn a bit smaller than the hit target, for a comfortably oversized tap area
      ctx.fillStyle = GOLD;
      for (const h of getHandles(rect)) {
        ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size);
      }
    }
  }

  // Unified pointer handling for the grid box, regardless of how it got there: pressing a
  // handle resizes from that edge/corner, pressing inside the box moves it, and pressing
  // outside it (or before any box exists) starts drawing a brand new one from scratch —
  // which doubles as the manual-selection fallback when auto-detection found nothing.
  els.scanCanvas.addEventListener('pointerdown', (e) => {
    if (!state.analysisCanvas) return;
    const p = toCanvasPoint(e);
    const radius = handleHitRadius();
    if (state.gridRect) {
      const handle = hitTestHandle(state.gridRect, p, radius);
      if (handle) {
        state.dragMode = 'resize';
        state.activeHandle = handle;
        state.dragStart = p;
        state.dragOrigRect = { ...state.gridRect };
        return;
      }
      if (pointInRect(p, state.gridRect)) {
        state.dragMode = 'move';
        state.dragStart = p;
        state.dragOrigRect = { ...state.gridRect };
        return;
      }
    }
    state.dragMode = 'create';
    state.autoDetected = false;
    state.dragStart = p;
    state.gridRect = { left: p.x, top: p.y, right: p.x, bottom: p.y };
    els.scanGridConfirm.classList.add('hidden');
  });

  els.scanCanvas.addEventListener('pointermove', (e) => {
    if (!state.dragMode) return;
    const p = toCanvasPoint(e);
    const { width, height } = state.analysisCanvas;
    if (state.dragMode === 'create') {
      state.gridRect = normalizedRect(state.dragStart, p);
    } else if (state.dragMode === 'move') {
      const o = state.dragOrigRect;
      const dx = clamp(p.x - state.dragStart.x, -o.left, width - o.right);
      const dy = clamp(p.y - state.dragStart.y, -o.top, height - o.bottom);
      state.gridRect = { left: o.left + dx, top: o.top + dy, right: o.right + dx, bottom: o.bottom + dy };
    } else if (state.dragMode === 'resize') {
      const o = state.dragOrigRect;
      const rect = { ...o };
      const edges = state.activeHandle.edges;
      if (edges.includes('left')) rect.left = clamp(p.x, 0, o.right - MIN_RECT_SIZE);
      if (edges.includes('right')) rect.right = clamp(p.x, o.left + MIN_RECT_SIZE, width);
      if (edges.includes('top')) rect.top = clamp(p.y, 0, o.bottom - MIN_RECT_SIZE);
      if (edges.includes('bottom')) rect.bottom = clamp(p.y, o.top + MIN_RECT_SIZE, height);
      state.gridRect = rect;
    }
    redrawGridCanvas();
  });

  window.addEventListener('pointerup', () => {
    if (!state.dragMode) return;
    state.dragMode = null;
    state.activeHandle = null;
    updateConfirmButtonState();
    redrawGridCanvas();
  });

  // Turns the analysis canvas into a flat grayscale array (0=black..255=white), the plain
  // format src/gridDetect.js's pure functions consume — see that module for why they take
  // arrays rather than a Canvas/ImageData directly.
  function analysisGrayscale() {
    const { width, height } = state.analysisCanvas;
    const { data } = state.analysisCtx.getImageData(0, 0, width, height);
    const gray = new Float64Array(width * height);
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4;
      gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    return gray;
  }

  // A SMALL search radius on purpose (was 4% of the image's shorter dimension, e.g. ~32px on
  // an 800px-wide analysis canvas) — confirmed against a real screenshot: this app draws each
  // clue number on its own near-black background chip right next to the grid's top/left
  // border, which is darker than the border itself. A generous search window reliably found
  // those chips instead, growing the confirmed box up past the top row and left past the
  // first column rather than the (already accurate — see TODO.md) auto-detected edge it
  // started from. This radius only smooths over a few px of natural imprecision
  // (auto-detection rounding, or a slightly-off manual drag/handle nudge); it's deliberately
  // too small to ever jump a whole cell into unrelated content. Shared by both the grid-confirm
  // handler below and detectFillState's centerRectOnBorders call, which needs the same
  // protection for the same reason (confirmed directly — see that function's own comment).
  function gridBorderSearchPx(width, height) {
    return Math.max(2, Math.round(Math.min(width, height) * 0.01));
  }

  // The one, always-available "proceed" action for the grid step — the fix for the bug this
  // redesign replaces (see the module-level comment). Works the same whether gridRect is
  // still exactly what auto-detection produced, or the user dragged/resized it: snaps it
  // onto the photo's actual printed border and suggests a row/col count either way, since
  // that refinement is just as valid a step after a nudge as after a fresh manual drag.
  els.scanBtnConfirmGrid.addEventListener('click', () => {
    if (!state.gridRect) return;
    const { width, height } = state.analysisCanvas;
    const gray = analysisGrayscale();
    const searchPx = gridBorderSearchPx(width, height);
    const snapped = snapRectToBorder(gray, width, height, state.gridRect, { searchPx });
    state.gridRect = snapped;
    redrawGridCanvas();

    // Row count comes from horizontal grid lines, found in the row profile (restricted to
    // the grid's own column span) across its vertical extent; column count is the mirror
    // image. See gridDetect.js's countGridLines: this suggests a count, it doesn't decide
    // one — the inputs below are always left editable.
    const rp = rowProfile(gray, width, height, { xStart: snapped.left, xEnd: snapped.right });
    const cp = colProfile(gray, width, height, { yStart: snapped.top, yEnd: snapped.bottom });
    // snapped.bottom/right are inclusive pixel positions (the darkest pixel found), but
    // countGridLines takes an exclusive end (it slices the profile) — without the +1 the
    // line sitting exactly on the far edge is cut off before being scanned, undercounting
    // by one line (one fewer row/col than the photo actually has).
    const lineCountRows = countGridLines(rp, snapped.top, snapped.bottom + 1);
    const lineCountCols = countGridLines(cp, snapped.left, snapped.right + 1);
    els.scanRowsInput.value = String(Math.max(1, lineCountRows - 1));
    els.scanColsInput.value = String(Math.max(1, lineCountCols - 1));
    els.scanGridConfirm.classList.remove('hidden');
  });

  // ---- step 3: slice + OCR every clue strip ----

  // Crops one analysis-space rect from the full-resolution canvas (scaling it up first),
  // upscaling further if it's still shorter than OCR_MIN_HEIGHT, and binarizes it (its own
  // Otsu threshold — see gridDetect.js) to flat black-on-white, a standard, meaningful
  // accuracy boost for OCR on printed text.
  function cropStripCanvas(rectAnalysis) {
    const s = state.scaleFullOverAnalysis;
    const sx = rectAnalysis.left * s;
    const sy = rectAnalysis.top * s;
    const sw = Math.max(1, (rectAnalysis.right - rectAnalysis.left) * s);
    const sh = Math.max(1, (rectAnalysis.bottom - rectAnalysis.top) * s);

    const upscale = Math.max(1, OCR_MIN_HEIGHT / sh);
    const destW = Math.max(1, Math.round(sw * upscale));
    const destH = Math.max(1, Math.round(sh * upscale));

    const canvas = document.createElement('canvas');
    canvas.width = destW;
    canvas.height = destH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(state.fullCanvas, sx, sy, sw, sh, 0, 0, destW, destH);

    const imageData = ctx.getImageData(0, 0, destW, destH);
    const { data } = imageData;
    const gray = new Array(destW * destH);
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4;
      gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    // Reuse the same Otsu thresholding gridDetect.js uses for grid lines — it's just as
    // applicable to "dark ink vs. light paper" at strip scale.
    const threshold = otsuThresholdLocal(gray);
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i] <= threshold ? 0 : 255;
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // Local copy of Otsu thresholding kept import-free here on purpose: gridDetect.js's
  // otsuThreshold works over a 0-255 profile already; re-importing it would work too, but
  // this keeps cropStripCanvas self-contained around the raw pixel array it just built.
  // (Same algorithm as gridDetect.js's otsuThreshold — see that module for the walkthrough.)
  function otsuThresholdLocal(values) {
    const hist = new Array(256).fill(0);
    for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
    const total = values.length;
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let sumB = 0, weightB = 0, maxVar = -1, threshold = 127;
    for (let t = 0; t < 256; t++) {
      weightB += hist[t];
      if (weightB === 0) continue;
      const weightF = total - weightB;
      if (weightF === 0) break;
      sumB += t * hist[t];
      const meanB = sumB / weightB;
      const meanF = (sumAll - sumB) / weightF;
      const variance = weightB * weightF * (meanB - meanF) ** 2;
      if (variance > maxVar) { maxVar = variance; threshold = t; }
    }
    return threshold;
  }

  // Padding (px, at the strip crop's own already-upscaled resolution) added around a crop on
  // every side before handing it to Tesseract. Not a minor cosmetic margin — confirmed
  // directly (see TODO.md) that Tesseract returns nothing at all (confidence 0, every page-
  // segmentation mode tried) for a glyph cropped tight to its own ink with only ~4px of
  // border, on an otherwise perfectly legible isolated digit; 8px was enough to reliably
  // recognize it. This is comfortably above that floor.
  const CROP_PADDING = 12;

  // Locates every text LINE and, within each line, every clue NUMBER (as a pixel x-range and
  // a digit count) in an already-binarized (pure black/white, see cropStripCanvas) strip
  // canvas — using real pixel geometry (src/ocrSegment.js), not Tesseract's own word-boundary
  // detection. Lines (top to bottom) exist because a clue margin can stack multiple rows of
  // numbers when a clue has more numbers than fit on one line (see computeClueBands's
  // column-clue case, which is the tall, narrow, multi-line kind).
  function findStripLines(canvas) {
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, width, height);

    // Ink is whichever color is the minority overall — this app's clue digits happen to
    // render lighter than their background, but working off "the less common of the two
    // binarized colors" instead of assuming a fixed polarity keeps this correct regardless.
    let whiteCount = 0;
    for (let i = 0; i < width * height; i++) if (data[i * 4] > 128) whiteCount++;
    const inkIsWhite = whiteCount < (width * height) / 2;
    const isInk = (x, y) => {
      const v = data[(y * width + x) * 4];
      return inkIsWhite ? v > 128 : v <= 128;
    };

    const hasInkRow = Array.from({ length: height }, (_, y) => {
      for (let x = 0; x < width; x++) if (isInk(x, y)) return true;
      return false;
    });

    const lineBands = filterNoiseLines(findRuns(hasInkRow));
    return lineBands.map(({ start: y0, end: y1 }) => {
      // Column ink is checked only within THIS line's own row-span — checking the whole
      // strip height would merge every line's glyphs into one meaningless column profile.
      const hasInkCol = Array.from({ length: width }, (_, x) => {
        for (let y = y0; y <= y1; y++) if (isInk(x, y)) return true;
        return false;
      });
      const numbers = groupGlyphsIntoNumbers(findRuns(hasInkCol));
      return { y0, y1, numbers };
    });
  }

  // Crops [x0,x1] x [y0,y1] out of `canvas` with CROP_PADDING added on every side (clamped to
  // the canvas bounds).
  function padCropCanvas(canvas, x0, x1, y0, y1) {
    const { width, height } = canvas;
    const px0 = Math.max(0, x0 - CROP_PADDING);
    const px1 = Math.min(width - 1, x1 + CROP_PADDING);
    const py0 = Math.max(0, y0 - CROP_PADDING);
    const py1 = Math.min(height - 1, y1 + CROP_PADDING);
    const cw = px1 - px0 + 1;
    const ch = py1 - py0 + 1;
    const sub = document.createElement('canvas');
    sub.width = cw;
    sub.height = ch;
    sub.getContext('2d').drawImage(canvas, px0, py0, cw, ch, 0, 0, cw, ch);
    return sub;
  }

  // OCRs an already-cropped strip, line by line, joining recognized numbers with a space
  // within a line and a newline between lines (parseClueText already treats space/comma/
  // newline as interchangeable separators). For each line, OCRs the WHOLE line in one call
  // rather than each number alone — recognizing a single isolated digit turns out to be
  // measurably LESS reliable than recognizing it in context: confirmed directly against a
  // real "4" glyph that Tesseract read correctly as part of a longer strip, but read as the
  // *letter* "A" (rejected outright once digit-whitelisted, i.e. returned nothing) once
  // cropped alone with no surrounding characters. What whole-line recognition can't be
  // trusted for is *spacing* — where Tesseract cannot reliably tell "1" then "1" apart from
  // "11" (see ocrSegment.js's own comment) — so this strips the line's OCR'd text down to
  // just its digits and re-splits that digit stream using the REAL per-number digit counts
  // already known from pixel geometry (`numbers[].glyphCount`, one blob per digit). That
  // only works if the digit COUNT Tesseract found matches what geometry expects; if it
  // doesn't (a misread that also drops or adds a digit, not just misplaces a space), this
  // falls back to OCRing that one line's numbers individually — worse per-glyph odds, but
  // only paid when the fast path is already known to be untrustworthy for that line.
  async function recognizeStripSegmented(canvas) {
    const lines = findStripLines(canvas);
    const lineTexts = [];
    for (const { y0, y1, numbers } of lines) {
      if (numbers.length === 0) continue;
      const lineCanvas = padCropCanvas(canvas, 0, canvas.width - 1, y0, y1);
      const rawText = await recognizeClueStrip(lineCanvas);
      const digits = rawText.replace(/\D/g, '');
      const expectedTotal = numbers.reduce((sum, n) => sum + n.glyphCount, 0);

      if (digits.length === expectedTotal) {
        let pos = 0;
        const numberTexts = numbers.map((n) => {
          const chunk = digits.slice(pos, pos + n.glyphCount);
          pos += n.glyphCount;
          return chunk;
        });
        lineTexts.push(numberTexts.join(' '));
      } else {
        const numberTexts = [];
        for (const n of numbers) {
          const numCanvas = padCropCanvas(canvas, n.start, n.end, y0, y1);
          const text = await recognizeClueStrip(numCanvas);
          numberTexts.push(text.trim());
        }
        lineTexts.push(numberTexts.join(' '));
      }
    }
    return lineTexts.join('\n');
  }

  // Current Objective #1's "reduce correction tedium" idea: cross-check each line's OCR'd
  // clue against the fill state cellStateDetect.js already detected for that same line
  // (`fillLine`, computed once in detectFillState() before OCR even runs) — reusing data
  // already being computed for a different purpose, not a new detection system, per the
  // TODO's own framing.
  //
  // isLineConsistent (lineSolver.js) is the exact right tool here, not a bespoke heuristic:
  // it already answers "does *some* completion of this line (treating UNKNOWN cells as still
  // free) match this clue?" — the same DP feasibility check normal play uses to redden a
  // clue number on a genuine contradiction. A scanned line is usually mid-solve (some cells
  // still correctly UNKNOWN — confirmed the actual core use case, see TODO.md), so a strict
  // "does the fill count/pattern exactly match" comparison would misfire constantly on
  // perfectly good partial progress; isLineConsistent already tolerates that by construction,
  // since it only fails when NO possible arrangement of the remaining unknowns could satisfy
  // the clue — i.e. only when the clue and the detected fills are provably incompatible,
  // which really is either a misread clue number or a fill-detection error, not just
  // "not finished yet".
  function lineLooksWrong(clue, fillLine) {
    return !isLineConsistent(fillLine, clue);
  }

  // A LOT of flagged lines (rather than one or two) is a different situation from a handful
  // of independent OCR misreads — it's the signature of a wrong row/column COUNT confirmed a
  // step earlier (every line downstream of the miscount ends up sliced against the wrong cell
  // width, so its detected fill pattern stops lining up with any correct clue at all). That's
  // confirmed directly against a real large puzzle screenshot with a one-off column-count
  // miscount — see TODO.md. Rather than leaving the player to notice the pattern themselves
  // and hand-fix a wall of red boxes, a high flagged fraction on either axis surfaces this
  // directly and points back at the step that actually needs revisiting.
  const RECHECK_WARN_FRACTION = 0.3;

  function updateRecheckWarning() {
    const flaggedFraction = (container) => {
      const rows = [...container.querySelectorAll('.scan-clue-row')];
      if (rows.length === 0) return 0;
      return rows.filter((r) => r.classList.contains('scan-clue-row--flagged')).length / rows.length;
    };
    const rowFrac = flaggedFraction(els.scanRowClueList);
    const colFrac = flaggedFraction(els.scanColClueList);
    if (rowFrac >= RECHECK_WARN_FRACTION || colFrac >= RECHECK_WARN_FRACTION) {
      const which = rowFrac >= RECHECK_WARN_FRACTION && colFrac >= RECHECK_WARN_FRACTION
        ? 'Rows and columns'
        : rowFrac >= RECHECK_WARN_FRACTION ? 'Rows' : 'Columns';
      els.scanRecheckWarning.textContent =
        `${which} look wrong across a lot of lines at once, not just one or two — that usually ` +
        'means the row/column count confirmed on the previous step was off by one, not that ' +
        'this many numbers were individually misread. Consider canceling and rescanning with a ' +
        'corrected count rather than fixing each line by hand.';
      els.scanRecheckWarning.classList.remove('hidden');
    } else {
      els.scanRecheckWarning.classList.add('hidden');
    }
  }

  function buildClueRow(container, labelText, canvas, prefillText, fillLine) {
    const row = document.createElement('div');
    row.className = 'scan-clue-row';
    const label = document.createElement('span');
    label.className = 'scan-clue-row__label';
    label.textContent = labelText;
    const img = document.createElement('img');
    img.className = 'scan-clue-row__thumb';
    img.src = canvas.toDataURL();
    img.alt = `Scanned clue strip: ${labelText}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'scan-clue-row__input';
    input.value = prefillText;
    input.setAttribute('aria-label', `${labelText} clue numbers`);
    row.append(label, img, input);
    container.appendChild(row);

    // Flag on build, and re-check live as the player edits — fixing a misread number should
    // clear the flag immediately (the same feedback loop the flag exists to speed up),
    // without waiting for a later re-render of the whole correction step.
    function refreshFlag() {
      row.classList.toggle('scan-clue-row--flagged', lineLooksWrong(parseClueText(input.value), fillLine));
      updateRecheckWarning();
    }
    input.addEventListener('input', refreshFlag);
    refreshFlag();

    return input;
  }

  // ---- fill-state detection (Current Objective — see TODO.md) ----
  //
  // Classifies every confirmed grid cell's fill/X/blank state from the analysis canvas — see
  // src/cellStateDetect.js for the actual per-cell classification. Runs on the ANALYSIS
  // canvas (not the higher-resolution full canvas OCR strip crops use, see FULL_MAX_DIM):
  // unlike OCR, this only needs to tell "a large block of non-background color" from "thin
  // diagonal strokes" apart, which the analysis canvas's own resolution is already comfortably
  // enough for — no need to pay for a second higher-res crop pass the way cropStripCanvas
  // does for legibility-sensitive clue digits.
  function detectFillState() {
    const { width, height } = state.analysisCanvas;
    const gray = analysisGrayscale();
    // Re-centers the confirmed grid rect on the true INNER edge of its own border stroke
    // before subdividing into cells — see gridDetect.js's centerRectOnBorders for why this
    // matters here specifically, unlike the clue-band slicing below (computeClueBands),
    // which only needs a rough margin and tolerates a few px of slop: a border noticeably
    // thicker than the grid's own internal lines would otherwise offset every even-subdivided
    // cell boundary, leaving real internal grid lines running through what should be blank
    // cell interiors (confirmed directly against this feature's real test screenshot — see
    // TODO.md). Same small searchPx as the grid-confirm handler below (gridBorderSearchPx) —
    // centerRectOnBorders' own default is far too generous (confirmed directly: it snapped
    // clean past the true border onto nearby clue-number text on a test image), for exactly
    // the reason that handler's own comment documents.
    const cellsRect = centerRectOnBorders(gray, width, height, state.gridRect, {
      searchPx: gridBorderSearchPx(width, height),
    });
    const cellRects = sliceGridCells(cellsRect, state.rows, state.cols);
    const cellData = cellRects.map((row) =>
      row.map((r) => {
        const cw = Math.max(1, Math.round(r.right - r.left));
        const ch = Math.max(1, Math.round(r.bottom - r.top));
        const { data } = state.analysisCtx.getImageData(Math.round(r.left), Math.round(r.top), cw, ch);
        return { pixels: data, width: cw, height: ch };
      })
    );
    const { states } = classifyGridCells(cellData);
    state.fillMarks = states.map((row) => row.map((s) => s.state));
  }

  // Cycles a fill-state review cell's mark on click, the same UNKNOWN -> FILLED -> EMPTY ->
  // UNKNOWN order a fresh cell goes through under normal play's fill mode (see app.js's
  // targetStateFor) — not a new interaction pattern, just applied to a detected starting
  // state instead of always starting from UNKNOWN.
  function nextFillMark(current) {
    if (current === UNKNOWN) return FILLED;
    if (current === FILLED) return EMPTY;
    return UNKNOWN;
  }

  // Renders state.fillMarks as a compact grid of clickable cells reusing the real play
  // board's own .nono-cell/.filled/.empty visuals (styles.css) for consistency — see
  // TODO.md's design sketch: "the correction UX should match how a player already marks
  // cells during normal play, not introduce a new interaction pattern." A click mutates
  // state.fillMarks directly and re-renders just that one cell's classes, not the whole grid.
  function renderFillStateGrid() {
    const container = els.scanFillstateGrid;
    container.innerHTML = '';
    container.style.setProperty('--scan-fillstate-cols', String(state.cols));
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'scan-fillstate-cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        applyFillMarkClass(cell, state.fillMarks[r][c]);
        cell.addEventListener('click', () => {
          const next = nextFillMark(state.fillMarks[r][c]);
          state.fillMarks[r][c] = next;
          applyFillMarkClass(cell, next);
        });
        container.appendChild(cell);
      }
    }
  }

  function applyFillMarkClass(cell, markState) {
    cell.classList.toggle('filled', markState === FILLED);
    cell.classList.toggle('empty', markState === EMPTY);
  }

  els.scanBtnScanClues.addEventListener('click', async () => {
    const rows = parseInt(els.scanRowsInput.value, 10);
    const cols = parseInt(els.scanColsInput.value, 10);
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
      els.scanRowsInput.reportValidity?.();
      return;
    }
    state.rows = rows;
    state.cols = cols;
    detectFillState();
    showStep('ocr');
    els.scanOcrStatus.textContent = 'Reading clue numbers…';

    const { width, height } = state.analysisCanvas;
    const fullRect = { left: 0, top: 0, right: width, bottom: height };
    const { rowBand, colBand } = computeClueBands(fullRect, state.gridRect);
    const rowStrips = sliceHorizontal(rowBand, rows);
    const colStrips = sliceVertical(colBand, cols);

    els.scanRowClueList.innerHTML = '';
    els.scanColClueList.innerHTML = '';
    state.rowClueInputs = [];
    state.colClueInputs = [];

    const total = rowStrips.length + colStrips.length;
    let done = 0;
    for (let i = 0; i < rowStrips.length; i++) {
      const canvas = cropStripCanvas(rowStrips[i]);
      const text = await recognizeStripSegmented(canvas);
      done++;
      els.scanOcrStatus.textContent = `Reading clue numbers… (${done} of ${total})`;
      const input = buildClueRow(
        els.scanRowClueList,
        `Row ${i + 1}`,
        canvas,
        parseClueText(text).join(', '),
        state.fillMarks[i]
      );
      state.rowClueInputs.push(input);
    }
    for (let i = 0; i < colStrips.length; i++) {
      const canvas = cropStripCanvas(colStrips[i]);
      const text = await recognizeStripSegmented(canvas);
      done++;
      els.scanOcrStatus.textContent = `Reading clue numbers… (${done} of ${total})`;
      const colFillLine = state.fillMarks.map((row) => row[i]);
      const input = buildClueRow(els.scanColClueList, `Col ${i + 1}`, canvas, parseClueText(text).join(', '), colFillLine);
      state.colClueInputs.push(input);
    }

    els.scanBuildError.classList.add('hidden');
    showStep('correct');
  });

  // ---- step 4: correct + build ----

  els.scanBtnBuild.addEventListener('click', () => {
    const rowClues = state.rowClueInputs.map((el) => parseClueText(el.value));
    const colClues = state.colClueInputs.map((el) => parseClueText(el.value));
    state.scanCount++;
    const result = buildScannedPuzzle({
      id: `scan-${Date.now()}-${state.scanCount}`,
      name: 'Scanned puzzle',
      rows: state.rows,
      cols: state.cols,
      rowClues,
      colClues,
    });
    if (!result.solved) {
      els.scanBuildError.textContent =
        "Couldn't find a valid solution from these clues — double-check the numbers above " +
        '(a common cause is one clue number misread) and try again.';
      els.scanBuildError.classList.remove('hidden');
      return;
    }
    els.scanBuildError.classList.add('hidden');
    state.pendingPuzzle = result.puzzle;
    renderFillStateGrid();
    showStep('fillstate');
  });

  // ---- step 5: confirm/correct detected fill state ----

  els.scanBtnConfirmState.addEventListener('click', () => {
    if (state.pendingPuzzle) {
      // A plain deep-enough copy (fillMarks is only ever mutated by replacing a string at
      // [r][c], never in place beyond that) — pendingPuzzle carries this forward as
      // initialMarks for Board.fromGrid (see app.js's startPuzzle) once the puzzle is played.
      state.pendingPuzzle = { ...state.pendingPuzzle, initialMarks: state.fillMarks.map((row) => row.slice()) };
    }
    showStep('done');
  });

  els.scanBtnPlay.addEventListener('click', () => {
    const p = state.pendingPuzzle;
    closeWizard();
    if (p) onPuzzleReady(p);
  });

  els.scanBtnCancel.addEventListener('click', () => closeWizard());

  return { open: openWizard };
}
