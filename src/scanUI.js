// DOM/canvas wiring for the "Scan a puzzle" wizard (item 10). This is the one module in the
// scan-existing-puzzle feature allowed to touch the DOM/canvas/Image — everything it calls
// out to (src/gridDetect.js, src/scanPuzzle.js, src/ocr.js) is plain data in/out and
// independently unit-tested. Kept out of app.js itself (already a large UI-dispatch file)
// per CLAUDE.md's "each module does one job"; app.js just calls initScanWizard() once at
// boot and wires one Help-menu button to open the modal.
//
// Wizard steps: enter the puzzle's size -> upload a photo -> confirm the grid rectangle
// (auto-detected and highlighted on load with draggable corner/edge handles, falling back to
// manual drag-to-select only when auto-detection isn't confident — see gridDetect.js's
// findGridCandidates/detectBestGrid) -> OCR every row's and column's clue strip -> a
// correction pass (editable text next to a thumbnail of what was actually cropped) -> solve
// the confirmed clues into a real solution and hand the finished puzzle back to app.js via the
// onPuzzleReady callback.
//
// The grid step always has one clear, visible, enabled-when-ready button to move forward
// ("Looks good") regardless of whether the rectangle came from auto-detection or a manual
// drag — see TODO.md's "Current Objective" for the bug (no working way to proceed after a
// manual drag) this design replaces, not just patches.
//
// Size-first restructure (TODO.md's Current Objective — "stop chasing our tails on this
// stupid bug"): dimension entry moved to its own screen shown FIRST, before the photo/grid
// step, matching the draw-a-puzzle wizard's own screen exactly rather than living inside a
// more complex step alongside grid detection — a player scanning an existing puzzle already
// knows its size before taking the photo, so asking up front matches how they actually think
// about the task. This sidesteps the app-wide iOS scroll bug's most common trigger (a text
// field focused mid-wizard, layered into a more complex screen) for this specific
// interaction, without claiming to fix the underlying bug everywhere — see TODO.md. The old
// second dimension-confirmation step (re-displaying/re-editing a suggested row/col count
// AFTER grid detection) is gone entirely: once the player has given the real dimensions up
// front, there's no reason to show them again — the grid step now only locates the grid's
// POSITION on the photo and uses the given counts directly.

import {
  snapRectToBorder,
  centerRectOnBorders,
  computeClueBands,
  sliceHorizontal,
  sliceVertical,
  sliceGridCells,
  detectBestGrid,
} from './gridDetect.js';
import { parseClueText, buildScannedPuzzle } from './scanPuzzle.js';
import { savePuzzleToLibrary } from './puzzleLibrary.js';
import { recognizeClueStrip, terminateOcr } from './ocr.js';
import { findRuns, groupGlyphsIntoNumbers, filterNoiseLines, findRepeatedDigitOutlier, findOversizedClue } from './ocrSegment.js';
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

// Bounds for the size step's row/col inputs. Wider than draw-a-puzzle's MIN_SIZE/MAX_SIZE
// (drawUI.js, 2-30) on both ends: a real printed puzzle being scanned can be smaller than any
// picture worth hand-drawing (min 1) and larger than what's practical to draw by hand (the
// project's own 25x25 ground-truth test puzzle is already most of the way to this cap).
const MIN_SIZE = 1;
const MAX_SIZE = 60;

export function initScanWizard({ els, onPuzzleReady, onClose, onOpen }) {
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
    rows: 0, // set from the size step (Current Objective — see TODO.md), before any photo/grid work
    cols: 0,
    rowClueInputs: [],
    colClueInputs: [],
    pendingPuzzle: null,
    // Detected fill/X state (Current Objective — see TODO.md), one FILLED/EMPTY/UNKNOWN per
    // cell, rows x cols. Computed once alongside the OCR pass (see the scanBtnConfirmGrid
    // handler) since both need the same confirmed grid rect; mutated in place by the
    // fill-state review step's click-to-correct handler (see renderFillStateGrid) before
    // being handed off as the puzzle's initialMarks.
    fillMarks: null,
    scanCount: 0, // used to mint a unique id per scanned puzzle this session
  };

  function showStep(name) {
    for (const el of [
      els.scanStepSize,
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
    state.rows = 0;
    state.cols = 0;
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
    els.scanRowsInput.value = '10';
    els.scanColsInput.value = '10';
    els.scanSizeError.classList.add('hidden');
    els.scanFileInput.value = '';
    els.scanBtnPlay.disabled = false;
    els.scanPlayStatus.textContent = '';
    els.scanGridHint.textContent = '';
    els.scanBtnConfirmGrid.disabled = true;
    els.scanRowClueList.innerHTML = '';
    els.scanColClueList.innerHTML = '';
    els.scanRecheckWarning.classList.add('hidden');
    els.scanBuildError.classList.add('hidden');
    els.scanFillstateGrid.innerHTML = '';
    showStep('size');
  }

  // ---- step 1: enter the puzzle's size (Current Objective — see TODO.md) ----
  //
  // Shown before any photo/grid work, matching draw-a-puzzle's own size-first screen exactly.
  // The player already knows the real puzzle's dimensions from looking at it, so this is the
  // one and only place they're asked — the grid step below no longer re-suggests or
  // re-confirms a count of its own.

  function parseSize(inputEl) {
    const n = parseInt(inputEl.value, 10);
    return Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : null;
  }

  els.scanBtnSizeContinue.addEventListener('click', () => {
    const rows = parseSize(els.scanRowsInput);
    const cols = parseSize(els.scanColsInput);
    if (!rows || !cols) {
      els.scanSizeError.textContent = `Enter a size between ${MIN_SIZE} and ${MAX_SIZE} for both rows and columns.`;
      els.scanSizeError.classList.remove('hidden');
      return;
    }
    els.scanSizeError.classList.add('hidden');
    state.rows = rows;
    state.cols = cols;
    showStep('upload');
  });

  // #scan-modal is a full-screen VIEW, not a floating modal (see its own comment in
  // index.html for the real-iOS scroll-bug history behind that) — opening it means hiding
  // the normal page content (#page-root, and the fixed-position #explain-panel, which would
  // otherwise float over this screen's own content) rather than layering on top of it.
  function openWizard() {
    resetWizard();
    els.pageRoot.classList.add('hidden');
    els.explainPanel.classList.add('hidden');
    els.scanModal.classList.remove('hidden');
    // Current Objective (app-wide scroll bug, round 2 — see TODO.md/styles.css's html/body
    // comment): .scan-modal (.scan-screen) is now its own overflow-y:auto region rather than
    // scrolling via the document, so resetting to "the top of the fresh screen" means resetting
    // THIS element's own scrollTop, not window.scrollTo — the document itself no longer scrolls
    // at all, so window.scrollTo(0, 0) would be a silent no-op here now.
    els.scanModal.scrollTop = 0;
    // iOS scroll regression fix (see TODO.md): body's padding-bottom now tracks the explain
    // panel's REAL height via app.js's syncExplainPanelSpace (--explain-panel-space), rather
    // than a static reservation — hiding the panel here needs that recalculated too (down to
    // 0), or the scan screen would keep reserving space for a panel that isn't there.
    onOpen?.();
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

  // ---- step 2: load the photo onto both canvases ----

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

  // ---- step 3: confirm the grid rectangle (auto-detected, or drag one out by hand) ----

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
  // onto the photo's actual printed border, then goes straight into slicing + OCR using the
  // row/col counts already given on the size step — this step's only remaining job is
  // locating the grid's POSITION on the photo, not re-deriving or re-confirming its
  // row/column COUNT (the old second dimension-confirmation step this replaces did both;
  // see the module-level comment and TODO.md's Current Objective).
  els.scanBtnConfirmGrid.addEventListener('click', async () => {
    if (!state.gridRect) return;
    const { width, height } = state.analysisCanvas;
    const gray = analysisGrayscale();
    const searchPx = gridBorderSearchPx(width, height);
    const snapped = snapRectToBorder(gray, width, height, state.gridRect, { searchPx });
    state.gridRect = snapped;
    redrawGridCanvas();

    // One shared border-centered rect for both the fill-state cell grid and the clue-band
    // slicing below (see computeCellsRect's own comment for why using two different rects
    // here was the root cause of a column-crop bleed bug).
    const cellsRect = computeCellsRect();
    detectFillState(cellsRect);
    showStep('ocr');
    els.scanOcrStatus.textContent = 'Reading clue numbers…';

    const fullRect = { left: 0, top: 0, right: width, bottom: height };
    const { rowBand, colBand } = computeClueBands(fullRect, cellsRect);
    const rowStrips = sliceHorizontal(rowBand, state.rows);
    const colStrips = sliceVertical(colBand, state.cols);

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

  // ---- step 4: slice + OCR every clue strip ----

  // A few source-canvas px of real image margin added around every strip crop, on all four
  // sides, before anything else touches it. Confirmed necessary against the real 25x25
  // screenshot (see TODO.md): this app draws clue-number text close enough to its own
  // row/column slice's edge that ink can end EXACTLY at pixel 0 or the last pixel of an
  // otherwise perfectly-correct crop, with zero rendering margin of its own. Without this,
  // recognizeStripSegmented's own per-line padCropCanvas call clamps its padding to the
  // strip canvas's bounds — so a line already touching that edge gets NO real padding at
  // all on that side, reproducing the exact "Tesseract returns nothing for a glyph cropped
  // tight to its own ink" failure CROP_PADDING exists to prevent elsewhere (confirmed
  // directly: this crop-margin fix took a real misread line, see TODO.md's Current
  // Objective, from an empty OCR result to a correct one). A small, fixed amount (not a
  // percentage of the strip's own size) — big enough to give Tesseract real breathing room,
  // small enough that any neighboring line's content it happens to pull in stays exactly
  // the kind of small bleed sliver findStripLines' filterNoiseLines call already exists to
  // discard, rather than reintroducing the digit-merging problem ocrSegment.js was built to
  // solve. Also, as a side benefit, makes findStripLines' own crossesEdge truncation signal
  // more meaningful: genuine zero-margin (but otherwise correct) rendering no longer trips
  // it just from lack of padding, so a line still touching this WIDER edge is a stronger
  // signal that something (not just typography) is really being cut off.
  const STRIP_MARGIN_PX = 4;

  // Crops one analysis-space rect from the full-resolution canvas (scaling it up first),
  // upscaling further if it's still shorter than OCR_MIN_HEIGHT, and binarizes it (its own
  // Otsu threshold — see gridDetect.js) to flat black-on-white, a standard, meaningful
  // accuracy boost for OCR on printed text.
  function cropStripCanvas(rectAnalysis) {
    const s = state.scaleFullOverAnalysis;
    const { width: fullW, height: fullH } = state.fullCanvas;
    // Extend by STRIP_MARGIN_PX on every side, then clamp to the full canvas's own bounds
    // (drawImage would otherwise happily read negative/out-of-bounds source coordinates as
    // transparent black, corrupting the binarization step's own light/dark read).
    const sx = Math.max(0, rectAnalysis.left * s - STRIP_MARGIN_PX);
    const sy = Math.max(0, rectAnalysis.top * s - STRIP_MARGIN_PX);
    const sxEnd = Math.min(fullW, rectAnalysis.right * s + STRIP_MARGIN_PX);
    const syEnd = Math.min(fullH, rectAnalysis.bottom * s + STRIP_MARGIN_PX);
    const sw = Math.max(1, sxEnd - sx);
    const sh = Math.max(1, syEnd - sy);

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
  // Current Objective #1's second idea (see TODO.md) was a per-line "does a clue-number
  // glyph touch its own crop's edge" truncation signal, on the theory that a misplaced
  // row/column slice boundary would show up as a glyph cut off at the crop edge. Built and
  // unit-tested (ocrSegment.js's crossesEdge — still there, still correct as a pure
  // primitive), then verified against the real 25x25 screenshot per this feature's own
  // practice — and DROPPED after that verification, not shipped: this app renders row-clue
  // text top-anchored within its row-height slice (confirmed directly: essentially every
  // row strip's ink touches the crop's top edge, correctly-sliced ones included), so
  // "touches its own crop edge" fires near-universally regardless of whether the slice
  // boundary is actually right. A signal that flags nearly everything isn't localized or
  // actionable — it's just noise on top of the real --flagged indicator. The one genuinely
  // useful thing this investigation surfaced — zero-margin crops starving Tesseract of the
  // padding it needs (see CROP_PADDING's own comment) — is still fixed below, via
  // STRIP_MARGIN_PX on the strip crop itself.
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

  // Crops [x0,x1] x [y0,y1] out of `canvas`, with independent left/right/vertical padding
  // (each clamped to the canvas bounds) — the general form padCropCanvas below (symmetric
  // CROP_PADDING on every side, the normal case) and the per-glyph fallback's clamped side
  // padding (see glyphSidePadding) both build on.
  function padCropCanvasAsym(canvas, x0, x1, y0, y1, padLeft, padRight, padY) {
    const { width, height } = canvas;
    const px0 = Math.max(0, x0 - padLeft);
    const px1 = Math.min(width - 1, x1 + padRight);
    const py0 = Math.max(0, y0 - padY);
    const py1 = Math.min(height - 1, y1 + padY);
    const cw = px1 - px0 + 1;
    const ch = py1 - py0 + 1;
    const sub = document.createElement('canvas');
    sub.width = cw;
    sub.height = ch;
    sub.getContext('2d').drawImage(canvas, px0, py0, cw, ch, 0, 0, cw, ch);
    return sub;
  }

  // Crops [x0,x1] x [y0,y1] out of `canvas` with CROP_PADDING added on every side (clamped to
  // the canvas bounds).
  function padCropCanvas(canvas, x0, x1, y0, y1) {
    return padCropCanvasAsym(canvas, x0, x1, y0, y1, CROP_PADDING, CROP_PADDING, CROP_PADDING);
  }

  // Current Objective #1 (see TODO.md — "11 misreads as 1"): how much horizontal padding an
  // individual glyph's per-glyph fallback crop (see recognizeStripSegmented below) can safely
  // use on one side. A glyph WITHIN a multi-digit number can sit closer to its neighbor than
  // CROP_PADDING itself — that's the entire point of groupGlyphsIntoNumbers' own gap
  // threshold, same-number gaps are deliberately allowed to be small (10-12px measured, see
  // that function's own comment) — so padding a single glyph's crop by the normal CROP_PADDING
  // (12px) on the side facing a same-number neighbor can pull that neighbor right back into
  // frame, silently reproducing the exact merge this fallback exists to undo (confirmed
  // directly: see TODO.md's own investigation, where an isolated "1" crop padded this way came
  // back "11" again from Tesseract — the SAME misread, just shifted to the wrong glyph). Full
  // CROP_PADDING is still used on the side facing away from a same-number neighbor (the line's
  // own edge, or a genuinely different number — see groupGlyphsIntoNumbers, those gaps are
  // always well past this threshold by construction).
  function glyphSidePadding(glyphs, i, side) {
    const neighbor = side === 'left' ? glyphs[i - 1] : glyphs[i + 1];
    if (!neighbor) return CROP_PADDING;
    const gap = side === 'left' ? glyphs[i].start - neighbor.end - 1 : neighbor.start - glyphs[i].end - 1;
    return Math.max(1, Math.min(CROP_PADDING, Math.floor(gap / 2)));
  }

  // Current Objective #1 (see TODO.md): OCRs one multi-digit number's glyphs INDIVIDUALLY —
  // the last-resort fallback below this, used only once both the whole-line AND whole-number
  // attempts have already failed to produce `n.glyphCount` digits for this specific number.
  // Root-caused directly against the real 25x25 test screenshot (see TODO.md): a tightly-
  // kerned repeated digit — "11" specifically, confirmed with columns 17-20's real `_,_,11`
  // clues — reads back as a single "1" from Tesseract at EVERY page-segmentation mode tried,
  // even when already cropped to just that one number with nothing else in frame (so this
  // isn't the same "OCR can't tell spacing" issue ocrSegment.js's own comment already
  // documents and recognizeStripSegmented's digit-count re-split already handles — Tesseract
  // is glyph-count-blind here even given an unambiguous crop). Isolating each glyph on its
  // own is the one thing that was confirmed, directly against this exact image, to actually
  // fix it — at the cost of the same "isolated single digit is less reliable than digit-in-
  // context" risk recognizeStripSegmented's own top comment already accepts elsewhere, which
  // is exactly why this is the LAST resort, not the first.
  async function recognizeGlyphsIndividually(canvas, n, y0, y1) {
    const glyphTexts = [];
    for (let gi = 0; gi < n.glyphs.length; gi++) {
      const g = n.glyphs[gi];
      const padLeft = glyphSidePadding(n.glyphs, gi, 'left');
      const padRight = glyphSidePadding(n.glyphs, gi, 'right');
      const glyphCanvas = padCropCanvasAsym(canvas, g.start, g.end, y0, y1, padLeft, padRight, CROP_PADDING);
      const text = await recognizeClueStrip(glyphCanvas);
      const glyphDigit = text.replace(/\D/g, '');
      // A single glyph should read as exactly one digit; if Tesseract still returns something
      // else (empty, or more than one character) there's nothing more localized left to try —
      // '?' surfaces plainly in the correction step's text box rather than silently guessing,
      // matching this feature's practice of flagging uncertainty for the player to resolve
      // rather than picking a number that might be wrong.
      glyphTexts.push(glyphDigit.length === 1 ? glyphDigit : '?');
    }
    return glyphTexts.join('');
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
  // only paid when the fast path is already known to be untrustworthy for that line. And if
  // THAT still doesn't produce the right digit count for a specific multi-digit number (see
  // recognizeGlyphsIndividually above), one more fallback level OCRs that number's own glyphs
  // one at a time.
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
          const numDigits = text.replace(/\D/g, '');
          if (n.glyphCount > 1 && numDigits.length !== n.glyphCount) {
            numberTexts.push(await recognizeGlyphsIndividually(canvas, n, y0, y1));
          } else {
            numberTexts.push(text.trim());
          }
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

  // Current Objective #3's repeated-digit consistency check (see ocrSegment.js's
  // findRepeatedDigitOutlier for the detection logic and why its default threshold is 5, not
  // 4 — tightened after real-image testing on this exact puzzle found 4 misfired on a genuine
  // confirmed-correct clue). Deliberately a SEPARATE, distinctly-styled signal from
  // lineLooksWrong above rather than folded into the same red flag: this one is a plausibility
  // guess ("this looks like it could be a misread"), not a proof of contradiction the way
  // isLineConsistent's feasibility check is — conflating the two would misrepresent this
  // signal's confidence level to the player.
  function repeatedDigitSuspect(clue) {
    return findRepeatedDigitOutlier(clue);
  }

  // New: the oversized-clue-number check (see ocrSegment.js's findOversizedClue for why a
  // structural certainty is deliberately surfaced through this same amber mechanism instead of
  // the red one — isLineConsistent below already flags the line red on its own, this exists to
  // name the specific impossible number). Checked ahead of the repeated-digit guess in
  // refreshFlag below: when both could apply, the certain diagnosis is the more useful one to
  // show.
  function oversizedClueSuspect(clue, lineLength) {
    return findOversizedClue(clue, lineLength);
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
    // A plain `type="text"` field with no hint always opens on the default alphabetic
    // keyboard on iOS/Android, with no memory of "the last field was numeric" carried over
    // between different input elements — so correcting a run of clue fields meant re-tapping
    // "123" on every single one (a real complaint, not a guess). `inputmode="decimal"` keeps
    // the numeric keypad up on every focus instead. A plain numeric pad (inputmode="numeric")
    // would do that too but has no way to type the space/comma this field's own instructions
    // ask for between numbers ("4 13"); the decimal pad's "." key fills that role instead —
    // parseClueText (see scanPuzzle.js) already extracts digit runs via `\d+`, ignoring
    // whatever separator sits between them, so "4.13" parses identically to "4 13" or "4,13"
    // with no parsing change needed here.
    input.inputMode = 'decimal';
    input.className = 'scan-clue-row__input';
    input.value = prefillText;
    input.setAttribute('aria-label', `${labelText} clue numbers`);
    row.append(label, img, input);
    container.appendChild(row);

    // Flag on build, and re-check live as the player edits — fixing a misread number should
    // clear the flag immediately (the same feedback loop the flag exists to speed up),
    // without waiting for a later re-render of the whole correction step.
    function refreshFlag() {
      const clue = parseClueText(input.value);
      row.classList.toggle('scan-clue-row--flagged', lineLooksWrong(clue, fillLine));
      const oversized = oversizedClueSuspect(clue, fillLine.length);
      const repeated = oversized ? null : repeatedDigitSuspect(clue);
      row.classList.toggle('scan-clue-row--suspect', oversized !== null || repeated !== null);
      row.title = oversized
        ? `"${oversized.value}" is larger than this line itself (${oversized.lineLength} cells) — a single run can never be longer than its own line, so this is almost certainly two numbers merged together (e.g. "10, 11" misread as "1011"). Split it back into two numbers.`
        : repeated
          ? `This might have a misread digit: most numbers here read ${repeated.expectedValue}, but one reads ${repeated.suspectedValue}.`
          : '';
      updateRecheckWarning();
    }
    input.addEventListener('input', refreshFlag);
    refreshFlag();

    return input;
  }

  // ---- fill-state detection (Current Objective — see TODO.md) ----

  // Re-centers the confirmed grid rect on the true INNER edge of its own border stroke — see
  // gridDetect.js's centerRectOnBorders for why this matters: a border noticeably thicker than
  // the grid's own internal lines makes the plain border-SNAPPED state.gridRect land several px
  // outside where the grid's actual cell area begins (confirmed directly against this feature's
  // real test screenshot — see TODO.md). Used for BOTH even-subdivisions built on the confirmed
  // grid rect: cell-slicing below (sliceGridCells) AND clue-band slicing (computeClueBands, see
  // the scan-clues handler) — both were originally believed to tolerate the plain snapped rect's
  // few px of slop, but real-crop verification (see TODO.md's Current Objective item 1) found
  // that assumption wrong for clue bands specifically: the snapped rect's left/right error is
  // asymmetric (a thick border catches snapRectToBorder's darkest-pixel search unevenly), so
  // dividing its width evenly by column count bakes a small per-column pitch error that COMPOUNDS
  // linearly across the strip — a few px off column 1 becomes most of a cell's width off by
  // column 20+, pulling each OCR crop into its neighbor and producing exactly the doubled/
  // garbled digit-stack reads the project owner spotted. Sharing this one centered rect between
  // both call sites (rather than each computing its own) fixes both at once and keeps them from
  // silently drifting apart again. Same small searchPx as the grid-confirm handler below
  // (gridBorderSearchPx) — centerRectOnBorders' own default is far too generous (confirmed
  // directly: it snapped clean past the true border onto nearby clue-number text on a test
  // image), for exactly the reason that handler's own comment documents.
  function computeCellsRect() {
    const { width, height } = state.analysisCanvas;
    const gray = analysisGrayscale();
    return centerRectOnBorders(gray, width, height, state.gridRect, {
      searchPx: gridBorderSearchPx(width, height),
    });
  }

  // Classifies every confirmed grid cell's fill/X/blank state from the analysis canvas — see
  // src/cellStateDetect.js for the actual per-cell classification. Runs on the ANALYSIS
  // canvas (not the higher-resolution full canvas OCR strip crops use, see FULL_MAX_DIM):
  // unlike OCR, this only needs to tell "a large block of non-background color" from "thin
  // diagonal strokes" apart, which the analysis canvas's own resolution is already comfortably
  // enough for — no need to pay for a second higher-res crop pass the way cropStripCanvas
  // does for legibility-sensitive clue digits. Takes the border-centered cells rect (see
  // computeCellsRect) rather than computing its own, so it stays in exact agreement with the
  // clue-band geometry the scan-clues handler slices from the same rect.
  function detectFillState(cellsRect) {
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

  // ---- step 5: correct + build ----

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

  // ---- step 6: confirm/correct detected fill state ----

  els.scanBtnConfirmState.addEventListener('click', () => {
    if (state.pendingPuzzle) {
      // A plain deep-enough copy (fillMarks is only ever mutated by replacing a string at
      // [r][c], never in place beyond that) — pendingPuzzle carries this forward as
      // initialMarks for Board.fromGrid (see app.js's startPuzzle) once the puzzle is played.
      state.pendingPuzzle = { ...state.pendingPuzzle, initialMarks: state.fillMarks.map((row) => row.slice()) };
    }
    showStep('done');
  });

  // Current Objective (see TODO.md): every scanned puzzle that's actually played now
  // auto-publishes to the public shared library first — the same write the old, separate
  // "Save to library" step used to make optional (savePuzzleToLibrary, unchanged) — then
  // plays as a completely normal authored/library puzzle from that point on: real move
  // history, the repeatable Undo button, Save progress, and stats all "just work" with no
  // scan-specific gating left anywhere in app.js. The blank grid + clues are what's published
  // (never state.fillMarks — same "always a blank-puzzle snapshot of the definition" rule the
  // old manual save used), with a generic placeholder title — every library puzzle's real
  // name stays hidden until solved anyway (see app.js's renderLibraryList), and the creator
  // can rename it afterward via the library's existing rename affordance.
  //
  // If the publish fails (offline, not deployed yet), the player can still play — falls back
  // to the original ephemeral scan-<timestamp> id / source:'scan' behavior, which still gets
  // working post-import Undo (board.hasHistory is unconditionally true now — see app.js's
  // startPuzzle) but no stable id to save progress or stats against, same as before this
  // round for that one edge case.
  els.scanBtnPlay.addEventListener('click', async () => {
    const p = state.pendingPuzzle;
    if (!p) return;
    els.scanBtnPlay.disabled = true;
    els.scanPlayStatus.textContent = 'Adding to the puzzle library…';
    try {
      // Bug fix (real-device regression — see TODO.md): `p.id` must be the bare Firestore doc
      // id, matching loadLibraryPuzzle's own convention exactly (see its comment) — a `lib-`
      // prefix here was the actual cause of "Save progress claims success but nothing shows
      // up," since it silently mismatched the unprefixed id the library browse list looks
      // in-progress/solved state up by.
      const libraryId = await savePuzzleToLibrary({
        rows: p.rows,
        cols: p.cols,
        rowClues: p.rowClues,
        colClues: p.colClues,
        title: 'Scanned puzzle',
      });
      p.id = libraryId;
      p.source = 'authored';
    } catch (err) {
      console.warn('savePuzzleToLibrary failed — playing locally without save/stats support', err);
    }
    els.scanBtnPlay.disabled = false;
    els.scanPlayStatus.textContent = '';
    closeWizard();
    onPuzzleReady(p);
  });

  els.scanBtnCancel.addEventListener('click', () => closeWizard());

  return { open: openWizard };
}
