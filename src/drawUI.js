// DOM wiring for the "draw a puzzle" wizard (TODO.md's Current Objective — "draw a puzzle"
// feature): a blank grid the player fills in by hand, with the app deriving clues and
// validating uniqueness (src/drawPuzzle.js) before it can be played/published. Kept out of
// app.js itself, same "each module does one job" split scanUI.js already established for the
// scan wizard — this is that module's closest sibling: same publish-a-picture-as-a-real-
// puzzle shape, an authored drawing here instead of an OCR'd photo, and correspondingly much
// simpler (no canvas/image/OCR pipeline at all, just a plain click/drag-to-toggle grid).
//
// Wizard steps: pick a grid size -> draw the picture on a blank grid (click/tap/drag toggles
// a cell filled; live row/col clue numbers update as you go, for free from
// model.js's cluesFromLine — no solving logic involved yet) -> "Done drawing" derives clues
// and validates they have exactly one solution (src/drawPuzzle.js's buildDrawnPuzzle); if not,
// an inline message explains why and the player keeps editing -> name the puzzle and "Play it"
// publishes to the public shared library (the same auto-publish pipeline the scan wizard's
// "Play it" already uses — see src/scanUI.js's scanBtnPlay handler, minus the naming step:
// a scan recreates someone else's already-existing puzzle under a generic placeholder title,
// but a drawing is the player's own original creation, so this wizard asks for a real name at
// save time instead) and hands the puzzle back to app.js via onPuzzleReady, starting BLANK
// (unlike a scan's initialMarks, which seeds the board with already-observed progress) — the
// whole point is that solving it from scratch is what reveals the picture just drawn.

import { buildDrawnPuzzle } from './drawPuzzle.js';
import { savePuzzleToLibrary } from './puzzleLibrary.js';
import { cluesFromLine } from './model.js';
import { cellsOnLine } from './geometry.js';

const MIN_SIZE = 2;
const MAX_SIZE = 30;
const DEFAULT_SIZE = 10;

export function initDrawWizard({ els, onPuzzleReady, onClose, onOpen }) {
  const state = {
    rows: DEFAULT_SIZE,
    cols: DEFAULT_SIZE,
    grid: null, // rows x cols of boolean — true means "part of the picture", rebuilt blank every "Start drawing"
    cellEls: new Map(), // "r,c" -> element, rebuilt by renderDrawGrid
    rowClueEls: [],
    colClueEls: [],
    pendingPuzzle: null,
    drawCount: 0, // mints a unique id per drawn puzzle this session, same convention scanUI.js's scanCount uses
    dragging: null, // { paintValue: boolean, touched: Set, lastRow, lastCol } | null
  };

  function showStep(name) {
    for (const el of [els.drawStepSize, els.drawStepDraw, els.drawStepDone]) {
      el.classList.toggle('hidden', el.dataset.step !== name);
    }
  }

  function resetWizard() {
    state.grid = null;
    state.pendingPuzzle = null;
    state.dragging = null;
    els.drawRowsInput.value = String(DEFAULT_SIZE);
    els.drawColsInput.value = String(DEFAULT_SIZE);
    els.drawSizeError.classList.add('hidden');
    els.drawBuildError.classList.add('hidden');
    els.drawGrid.innerHTML = '';
    els.drawNameInput.value = '';
    els.drawNameError.classList.add('hidden');
    els.drawBtnPlay.disabled = false;
    els.drawPlayStatus.textContent = '';
    showStep('size');
  }

  // Full-screen VIEW, not a floating modal — same reasoning (and the same real-iOS-scroll-bug
  // history) as #scan-modal; see its own comment in index.html and styles.css's .scan-screen
  // comment for the long version. Reuses that exact class rather than inventing a second
  // near-identical pattern.
  function openWizard() {
    resetWizard();
    els.pageRoot.classList.add('hidden');
    els.explainPanel.classList.add('hidden');
    els.drawModal.classList.remove('hidden');
    els.drawModal.scrollTop = 0;
    onOpen?.();
  }

  function closeWizard() {
    els.drawModal.classList.add('hidden');
    els.pageRoot.classList.remove('hidden');
    els.explainPanel.classList.remove('hidden');
    onClose?.();
  }

  // ---- step 1: pick a size ----

  function parseSize(inputEl) {
    const n = parseInt(inputEl.value, 10);
    return Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : null;
  }

  els.drawBtnStart.addEventListener('click', () => {
    const rows = parseSize(els.drawRowsInput);
    const cols = parseSize(els.drawColsInput);
    if (!rows || !cols) {
      els.drawSizeError.textContent = `Enter a size between ${MIN_SIZE} and ${MAX_SIZE} for both rows and columns.`;
      els.drawSizeError.classList.remove('hidden');
      return;
    }
    els.drawSizeError.classList.add('hidden');
    state.rows = rows;
    state.cols = cols;
    state.grid = Array.from({ length: rows }, () => Array(cols).fill(false));
    renderDrawGrid();
    showStep('draw');
  });

  // ---- step 2: draw the picture ----

  function clueText(clue) {
    return clue.length ? clue.join(' ') : '';
  }

  // Recomputed from scratch on every change rather than incrementally — cheap even at the
  // 30x30 max size (cluesFromLine is a single pass per line), and correct by construction
  // regardless of how many cells a drag just touched.
  function refreshClueLabels() {
    for (let r = 0; r < state.rows; r++) {
      state.rowClueEls[r].textContent = clueText(cluesFromLine(state.grid[r]));
    }
    for (let c = 0; c < state.cols; c++) {
      const col = state.grid.map((row) => row[c]);
      // Stacked vertically (one number per line) to stay narrow — same reason the real
      // board's own column clues (.nono-clue--col) stack instead of running inline.
      state.colClueEls[c].textContent = clueText(cluesFromLine(col)).split(' ').join('\n');
    }
  }

  function renderDrawGrid() {
    const container = els.drawGrid;
    container.innerHTML = '';
    container.style.setProperty('--draw-grid-cols', String(state.cols));
    state.cellEls.clear();
    state.rowClueEls = [];
    state.colClueEls = [];

    const corner = document.createElement('div');
    corner.className = 'draw-grid__corner';
    container.appendChild(corner);

    for (let c = 0; c < state.cols; c++) {
      const clueEl = document.createElement('div');
      clueEl.className = 'draw-grid__col-clue';
      container.appendChild(clueEl);
      state.colClueEls.push(clueEl);
    }

    for (let r = 0; r < state.rows; r++) {
      const rowClueEl = document.createElement('div');
      rowClueEl.className = 'draw-grid__row-clue';
      container.appendChild(rowClueEl);
      state.rowClueEls.push(rowClueEl);

      for (let c = 0; c < state.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'draw-cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        container.appendChild(cell);
        state.cellEls.set(`${r},${c}`, cell);
      }
    }

    refreshClueLabels();
  }

  function setCell(r, c, value) {
    if (state.grid[r][c] === value) return false;
    state.grid[r][c] = value;
    state.cellEls.get(`${r},${c}`)?.classList.toggle('filled', value);
    return true;
  }

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.classList && el.classList.contains('draw-cell') ? el : null;
  }

  // Same click-toggles/drag-paints-one-value pattern as the real board's own Fill mode (see
  // app.js's targetStateFor/attachPointerHandlers): the first cell in a drag decides whether
  // the whole stroke is filling or clearing, so a drag never "flickers" cell-by-cell. Handlers
  // are attached once here (not per-render) since #draw-grid itself persists across renders —
  // only its children are rebuilt (renderDrawGrid/els.drawBtnClear) — event delegation off the
  // container plus one shared `state.dragging` still works correctly after a rebuild.
  els.drawGrid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.draw-cell');
    if (!el) return;
    e.preventDefault();
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const paintValue = !state.grid[r][c];
    state.dragging = { paintValue, touched: new Set([`${r},${c}`]), lastRow: r, lastCol: c };
    setCell(r, c, paintValue);
    refreshClueLabels();
  });

  els.drawGrid.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const el = cellAt(e.clientX, e.clientY);
    if (!el) return;
    const r1 = Number(el.dataset.row);
    const c1 = Number(el.dataset.col);
    // Same Bresenham drag-fill-gap fix as the real board (see geometry.js's cellsOnLine) —
    // this grid can shrink to the same small per-cell size on a large puzzle and is just as
    // exposed to a fast swipe skipping a sampled point.
    let changed = false;
    for (const [r, c] of cellsOnLine(state.dragging.lastRow, state.dragging.lastCol, r1, c1)) {
      const key = `${r},${c}`;
      if (state.dragging.touched.has(key)) continue;
      state.dragging.touched.add(key);
      if (setCell(r, c, state.dragging.paintValue)) changed = true;
    }
    state.dragging.lastRow = r1;
    state.dragging.lastCol = c1;
    if (changed) refreshClueLabels();
  });

  function endDrag() {
    state.dragging = null;
  }
  window.addEventListener('pointerup', endDrag);
  els.drawGrid.addEventListener('pointercancel', endDrag);

  els.drawBtnClear.addEventListener('click', () => {
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) setCell(r, c, false);
    }
    refreshClueLabels();
    els.drawBuildError.classList.add('hidden');
  });

  els.drawBtnDone.addEventListener('click', () => {
    state.drawCount++;
    const result = buildDrawnPuzzle({
      id: `draw-${Date.now()}-${state.drawCount}`,
      name: 'Drawn puzzle',
      grid: state.grid,
    });
    if (!result.solved) {
      els.drawBuildError.textContent =
        result.reason === 'empty'
          ? "Draw something first — an empty grid isn't a puzzle yet."
          : "This drawing doesn't have a single logical solution — some other arrangement of " +
            'filled cells would also match the same row/column counts. Try adding more detail ' +
            '(breaking up large blank or filled areas) so your picture is the only arrangement ' +
            'that fits, then try again.';
      els.drawBuildError.classList.remove('hidden');
      return;
    }
    els.drawBuildError.classList.add('hidden');
    state.pendingPuzzle = result.puzzle;
    showStep('done');
  });

  // ---- step 3: name + publish + play ----

  // Current Objective (see TODO.md): unlike a scan (which auto-publishes under a generic
  // placeholder title — it's recreating someone else's already-existing puzzle, so naming it
  // doesn't carry much meaning), a drawn puzzle is the player's own original creation, and the
  // project owner asked specifically for a name prompt here at save time. The library's
  // browse-list placeholder ("Puzzle N — RxC") still hides it from OTHER players until solved,
  // same as every library puzzle — this name is just chosen by the creator up front instead of
  // being a generic "Drawn puzzle" string with no real content.
  //
  // If the publish fails (offline, not deployed yet), the player can still play — falls back to
  // source:'drawn' (model.js's hasUnstableId), which still gets working post-import Undo but no
  // stable id to save progress or stats against, same fallback shape scanUI.js's 'scan' case
  // already has.
  els.drawBtnPlay.addEventListener('click', async () => {
    const p = state.pendingPuzzle;
    if (!p) return;
    const title = els.drawNameInput.value.trim();
    if (!title) {
      els.drawNameError.textContent = 'Give your puzzle a name before playing it.';
      els.drawNameError.classList.remove('hidden');
      return;
    }
    els.drawNameError.classList.add('hidden');
    els.drawBtnPlay.disabled = true;
    els.drawPlayStatus.textContent = 'Adding to the puzzle library…';
    try {
      const libraryId = await savePuzzleToLibrary({
        rows: p.rows,
        cols: p.cols,
        rowClues: p.rowClues,
        colClues: p.colClues,
        title,
      });
      p.id = libraryId;
      p.source = 'authored';
      // buildDrawnPuzzle (see els.drawBtnDone above) stamped a placeholder `name` before the
      // player had chosen a real title — without this, the completion modal on THIS very
      // play-through would reveal the placeholder instead of what was just entered (a later
      // loadLibraryPuzzle re-fetch always gets this right via Firestore's own `title` field —
      // only this first, same-session play needed the local object patched to match).
      p.name = title;
    } catch (err) {
      console.warn('savePuzzleToLibrary failed — playing locally without save/stats support', err);
    }
    els.drawBtnPlay.disabled = false;
    els.drawPlayStatus.textContent = '';
    closeWizard();
    onPuzzleReady(p);
  });

  els.drawBtnCancel.addEventListener('click', () => closeWizard());

  return { open: openWizard };
}
