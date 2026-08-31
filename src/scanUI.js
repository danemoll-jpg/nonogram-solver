// DOM/canvas wiring for the "Scan a puzzle" wizard (item 10). This is the one module in the
// scan-existing-puzzle feature allowed to touch the DOM/canvas/Image — everything it calls
// out to (src/gridDetect.js, src/scanPuzzle.js, src/ocr.js) is plain data in/out and
// independently unit-tested. Kept out of app.js itself (already a large UI-dispatch file)
// per CLAUDE.md's "each module does one job"; app.js just calls initScanWizard() once at
// boot and wires one Help-menu button to open the modal.
//
// Wizard steps: upload a photo -> drag a box around just the grid squares (grid detection
// snaps it to the printed border and suggests a row/col count) -> OCR every row's and
// column's clue strip -> a correction pass (editable text next to a thumbnail of what was
// actually cropped) -> solve the confirmed clues into a real solution and hand the finished
// puzzle back to app.js via the onPuzzleReady callback.

import {
  rowProfile,
  colProfile,
  snapRectToBorder,
  countGridLines,
  computeClueBands,
  sliceHorizontal,
  sliceVertical,
} from './gridDetect.js';
import { parseClueText, buildScannedPuzzle } from './scanPuzzle.js';
import { recognizeClueStrip, terminateOcr } from './ocr.js';

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

// Hardcoded mirror of styles.css's --gold — canvas 2D context fill/strokeStyle can't consume
// CSS custom properties directly.
const GOLD = '#e6b73f';

export function initScanWizard({ els, onPuzzleReady }) {
  const state = {
    analysisCanvas: null,
    analysisCtx: null,
    fullCanvas: null,
    scaleFullOverAnalysis: 1,
    roughRect: null, // { left, top, right, bottom } in analysis-canvas space, while dragging
    gridRect: null, // snapped rect, analysis-canvas space, once "Detect grid" has run
    dragging: false,
    dragStart: null,
    rows: 0,
    cols: 0,
    rowClueInputs: [],
    colClueInputs: [],
    pendingPuzzle: null,
    scanCount: 0, // used to mint a unique id per scanned puzzle this session
  };

  function showStep(name) {
    for (const el of [els.scanStepUpload, els.scanStepGrid, els.scanStepOcr, els.scanStepCorrect, els.scanStepDone]) {
      el.classList.toggle('hidden', el.dataset.step !== name);
    }
  }

  function resetWizard() {
    state.analysisCanvas = null;
    state.analysisCtx = null;
    state.fullCanvas = null;
    state.roughRect = null;
    state.gridRect = null;
    state.dragging = false;
    state.rowClueInputs = [];
    state.colClueInputs = [];
    state.pendingPuzzle = null;
    els.scanFileInput.value = '';
    els.scanGridConfirm.classList.add('hidden');
    els.scanBtnDetect.disabled = true;
    els.scanRowClueList.innerHTML = '';
    els.scanColClueList.innerHTML = '';
    els.scanBuildError.classList.add('hidden');
    showStep('upload');
  }

  function openWizard() {
    resetWizard();
    els.scanModal.classList.remove('hidden');
  }

  function closeWizard() {
    els.scanModal.classList.add('hidden');
    terminateOcr().catch(() => {}); // free the OCR worker's wasm/network resources
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
      redrawGridCanvas();
    } finally {
      URL.revokeObjectURL(url);
    }
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

  // ---- step 2: drag a box around the grid, then detect ----

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

  function redrawGridCanvas() {
    if (!state.analysisCanvas) return;
    const ctx = els.scanCanvas.getContext('2d');
    ctx.drawImage(state.analysisCanvas, 0, 0);
    const rect = state.roughRect || state.gridRect;
    if (rect) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    }
  }

  els.scanCanvas.addEventListener('pointerdown', (e) => {
    if (!state.analysisCanvas) return;
    state.dragging = true;
    state.dragStart = toCanvasPoint(e);
    state.gridRect = null;
    els.scanGridConfirm.classList.add('hidden');
  });
  els.scanCanvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.roughRect = normalizedRect(state.dragStart, toCanvasPoint(e));
    redrawGridCanvas();
  });
  window.addEventListener('pointerup', () => {
    if (!state.dragging) return;
    state.dragging = false;
    const rect = state.roughRect;
    const hasSize = rect && rect.right - rect.left > 10 && rect.bottom - rect.top > 10;
    els.scanBtnDetect.disabled = !hasSize;
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

  els.scanBtnDetect.addEventListener('click', () => {
    if (!state.roughRect) return;
    const { width, height } = state.analysisCanvas;
    const gray = analysisGrayscale();
    const searchPx = Math.max(4, Math.round(Math.min(width, height) * 0.04));
    const snapped = snapRectToBorder(gray, width, height, state.roughRect, { searchPx });
    state.gridRect = snapped;
    state.roughRect = null;
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

  function buildClueRow(container, labelText, canvas, prefillText) {
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
    return input;
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
      const text = await recognizeClueStrip(canvas);
      done++;
      els.scanOcrStatus.textContent = `Reading clue numbers… (${done} of ${total})`;
      const input = buildClueRow(els.scanRowClueList, `Row ${i + 1}`, canvas, parseClueText(text).join(', '));
      state.rowClueInputs.push(input);
    }
    for (let i = 0; i < colStrips.length; i++) {
      const canvas = cropStripCanvas(colStrips[i]);
      const text = await recognizeClueStrip(canvas);
      done++;
      els.scanOcrStatus.textContent = `Reading clue numbers… (${done} of ${total})`;
      const input = buildClueRow(els.scanColClueList, `Col ${i + 1}`, canvas, parseClueText(text).join(', '));
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
