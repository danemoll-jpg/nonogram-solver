// UI wiring for the full puzzle experience (build-order item 7). Plain ES modules, no
// bundler — matches the project's existing static-site pattern. All the actual logic
// (solving, hints, mistake-checking) lives in src/*; this file only renders the board and
// dispatches user actions to those modules.

import { Board, UNKNOWN, FILLED, EMPTY, isLineSatisfied } from './src/model.js';
import { getNextHint, applyDeduction } from './src/solver.js';
import { findContradictionHint } from './src/contradiction.js';
import { phraseDeduction } from './src/hintPhrasing.js';
import { autoCheckMark, checkForMistakes, removeBadMarks } from './src/mistakes.js';
import { SAMPLE_PUZZLES } from './src/puzzles.js';

let puzzle = null;
let board = null;
let autoCheckEnabled = false;
let highlightedCells = []; // { row, col, kind: 'reasoning' | 'result' }

const cellEls = new Map(); // "r,c" -> element
const rowClueEls = [];
const colClueEls = [];

const els = {
  puzzleSelect: document.getElementById('puzzle-select'),
  boardRoot: document.getElementById('board-root'),
  statusLine: document.getElementById('status-line'),
  btnNew: document.getElementById('btn-new'),
  toggleAutocheck: document.getElementById('toggle-autocheck'),
  btnHint: document.getElementById('btn-hint'),
  hintText: document.getElementById('hint-text'),
  btnContradiction: document.getElementById('btn-contradiction'),
  btnCheck: document.getElementById('btn-check'),
  btnRemoveBad: document.getElementById('btn-remove-bad'),
  mistakeText: document.getElementById('mistake-text'),
};

// ---- puzzle lifecycle ----

function populatePuzzleSelect() {
  els.puzzleSelect.innerHTML = '';
  for (const p of SAMPLE_PUZZLES) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.rows}x${p.cols}`;
    els.puzzleSelect.appendChild(opt);
  }
}

function loadPuzzle(id) {
  puzzle = SAMPLE_PUZZLES.find((p) => p.id === id) ?? SAMPLE_PUZZLES[0];
  els.puzzleSelect.value = puzzle.id;
  board = new Board(puzzle.rows, puzzle.cols);
  highlightedCells = [];
  els.hintText.textContent = '';
  els.mistakeText.textContent = '';
  els.btnContradiction.classList.add('hidden');
  renderBoard();
  updateStatus('');
}

// ---- rendering ----

function renderBoard() {
  cellEls.clear();
  rowClueEls.length = 0;
  colClueEls.length = 0;
  els.boardRoot.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'nono-grid';
  const maxRowClueLen = Math.max(1, ...puzzle.rowClues.map((c) => c.length));
  const maxColClueLen = Math.max(1, ...puzzle.colClues.map((c) => c.length));
  grid.style.gridTemplateColumns = `${maxRowClueLen * 1.1 + 0.3}rem repeat(${puzzle.cols}, 1.9rem)`;
  grid.style.gridTemplateRows = `${maxColClueLen * 1.1 + 0.3}rem repeat(${puzzle.rows}, 1.9rem)`;

  const corner = document.createElement('div');
  corner.className = 'nono-corner';
  grid.appendChild(corner);

  for (let c = 0; c < puzzle.cols; c++) {
    const el = document.createElement('div');
    el.className = 'nono-clue nono-clue--col';
    el.innerHTML = clueHtml(puzzle.colClues[c]);
    grid.appendChild(el);
    colClueEls.push(el);
  }

  for (let r = 0; r < puzzle.rows; r++) {
    const rc = document.createElement('div');
    rc.className = 'nono-clue nono-clue--row';
    rc.innerHTML = clueHtml(puzzle.rowClues[r]);
    grid.appendChild(rc);
    rowClueEls.push(rc);

    for (let c = 0; c < puzzle.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'nono-cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      grid.appendChild(cell);
      cellEls.set(`${r},${c}`, cell);
    }
  }

  els.boardRoot.appendChild(grid);
  attachPointerHandlers(grid);
  syncAllCellVisuals();
}

function clueHtml(clue) {
  const nums = clue.length ? clue : [0];
  return nums.map((n) => `<span>${n}</span>`).join('');
}

function syncAllCellVisuals() {
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      const el = cellEls.get(`${r},${c}`);
      const state = board.get(r, c);
      el.classList.toggle('filled', state === FILLED);
      el.classList.toggle('empty', state === EMPTY);
    }
  }
  for (let r = 0; r < puzzle.rows; r++) {
    rowClueEls[r].classList.toggle('satisfied', isLineSatisfied(board.getRow(r), puzzle.rowClues[r]));
  }
  for (let c = 0; c < puzzle.cols; c++) {
    colClueEls[c].classList.toggle('satisfied', isLineSatisfied(board.getCol(c), puzzle.colClues[c]));
  }
  applyHighlightClasses();

  if (board.isComplete()) {
    updateStatus(boardMatchesSolution() ? '🎉 Solved!' : "All cells are marked, but something's off — try Check my work.");
  } else {
    updateStatus('');
  }
}

function boardMatchesSolution() {
  if (!puzzle.solution) return true;
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      if ((board.get(r, c) === FILLED) !== puzzle.solution[r][c]) return false;
    }
  }
  return true;
}

function applyHighlightClasses() {
  for (const el of cellEls.values()) el.classList.remove('reasoning', 'result');
  for (const { row, col, kind } of highlightedCells) {
    cellEls.get(`${row},${col}`)?.classList.add(kind);
  }
}

function highlightDeduction(deduction) {
  highlightedCells = [
    ...deduction.reasoningCells.map((c) => ({ ...c, kind: 'reasoning' })),
    ...deduction.resultCells.map((c) => ({ ...c, kind: 'result' })),
  ];
  applyHighlightClasses();
}

function clearHighlights() {
  highlightedCells = [];
  applyHighlightClasses();
}

function updateStatus(msg) {
  els.statusLine.textContent = msg;
}

// ---- pointer interaction: click to fill, right-click/long-press for "empty", drag-paint ----

function attachPointerHandlers(grid) {
  let dragging = null; // { mode, paintState, touched: Set<string> }
  let longPressTimer = null;

  grid.addEventListener('contextmenu', (e) => e.preventDefault());

  function toggleState(current, mode) {
    if (mode === 'filled') return current === FILLED ? UNKNOWN : FILLED;
    return current === EMPTY ? UNKNOWN : EMPTY;
  }

  function paintCell(el, state) {
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const changed = board.set(r, c, state);
    if (!changed) return;
    el.classList.toggle('filled', state === FILLED);
    el.classList.toggle('empty', state === EMPTY);
    onCellChanged(r, c);
  }

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.classList && el.classList.contains('nono-cell') ? el : null;
  }

  grid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.nono-cell');
    if (!el) return;
    e.preventDefault();
    clearHighlights();
    els.hintText.textContent = '';
    els.mistakeText.textContent = '';

    const mode = e.pointerType === 'mouse' && e.button === 2 ? 'empty' : 'filled';
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const newState = toggleState(board.get(r, c), mode);
    dragging = { mode, paintState: newState, touched: new Set([`${r},${c}`]) };
    paintCell(el, newState);
    syncAllCellVisuals();

    // Touch/pen: a long-press switches this stroke to the "empty" mark instead of "fill".
    if (e.pointerType !== 'mouse') {
      longPressTimer = setTimeout(() => {
        if (!dragging) return;
        paintCell(el, UNKNOWN); // undo the initial fill guess
        const emptyState = toggleState(UNKNOWN, 'empty');
        dragging.mode = 'empty';
        dragging.paintState = emptyState;
        paintCell(el, emptyState);
        syncAllCellVisuals();
      }, 480);
    }
  });

  grid.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const el = cellAt(e.clientX, e.clientY);
    if (!el) return;
    const key = `${el.dataset.row},${el.dataset.col}`;
    if (dragging.touched.has(key)) return;
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    dragging.touched.add(key);
    paintCell(el, dragging.paintState);
    syncAllCellVisuals();
  });

  function endDrag() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    dragging = null;
  }
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
}

function onCellChanged(r, c) {
  if (autoCheckEnabled && puzzle.solution) {
    const mistake = autoCheckMark(board, puzzle.solution, r, c);
    if (mistake) {
      highlightDeduction(mistake);
      phraseDeduction(mistake).then((text) => { els.mistakeText.textContent = text; });
    }
  }
}

// ---- hint / help controls ----

els.btnHint.addEventListener('click', async () => {
  clearHighlights();
  els.btnContradiction.classList.add('hidden');
  const hint = getNextHint(board, puzzle);
  if (!hint) {
    els.hintText.textContent =
      "No forced move right now — from logic alone, more than one possibility remains for every open cell. " +
      "Keep solving by trial, or dig deeper for a slower, contradiction-based deduction.";
    els.btnContradiction.classList.remove('hidden');
    return;
  }
  applyDeduction(board, hint);
  highlightDeduction(hint);
  syncAllCellVisuals();
  els.hintText.textContent = await phraseDeduction(hint);
});

els.btnContradiction.addEventListener('click', async () => {
  els.hintText.textContent = 'Searching…';
  await new Promise((resolve) => setTimeout(resolve, 0)); // let "Searching…" paint first
  const hint = findContradictionHint(board, puzzle);
  if (!hint) {
    els.hintText.textContent =
      "Even a deeper search can't find a forced move from here — this may need an outright guess.";
    return;
  }
  applyDeduction(board, hint);
  highlightDeduction(hint);
  syncAllCellVisuals();
  els.hintText.textContent = await phraseDeduction(hint);
  els.btnContradiction.classList.add('hidden');
});

// ---- mistake-handling controls ----

els.btnCheck.addEventListener('click', () => {
  els.mistakeText.innerHTML = '';
  if (!puzzle.solution) {
    els.mistakeText.textContent = "This puzzle has no known solution to check against yet.";
    return;
  }
  if (autoCheckEnabled) {
    els.mistakeText.textContent = 'Auto-check is on — mistakes are flagged the moment you make them.';
    return;
  }

  const result = checkForMistakes(board, puzzle.solution);
  if (result.origin === 'history') {
    if (result.moveIndex === null) {
      els.mistakeText.textContent = 'No mistakes found in your moves so far.';
      return;
    }
    els.mistakeText.textContent =
      `Move #${result.moveIndex + 1} (row ${result.cell.row + 1}, col ${result.cell.col + 1}) ` +
      `was marked ${result.markedAs}, but should be ${result.shouldBe}.`;
    highlightedCells = [{ ...result.cell, kind: 'result' }];
    applyHighlightClasses();
    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn--ghost';
    undoBtn.type = 'button';
    undoBtn.textContent = `Back up to before move #${result.moveIndex + 1}`;
    undoBtn.addEventListener('click', () => {
      board.undoToMove(result.moveIndex);
      clearHighlights();
      els.mistakeText.textContent = '';
      syncAllCellVisuals();
    });
    els.mistakeText.appendChild(document.createElement('br'));
    els.mistakeText.appendChild(undoBtn);
  } else {
    if (result.wrongCells.length === 0) {
      els.mistakeText.textContent = 'No mistakes found.';
      return;
    }
    els.mistakeText.textContent =
      `${result.wrongCells.length} cell(s) don't match the puzzle — highlighted on the board. ` +
      `This puzzle came from a scan with no move history, so there's no single point to undo to.`;
    highlightedCells = result.wrongCells.map((c) => ({ ...c, kind: 'result' }));
    applyHighlightClasses();
  }
});

els.btnRemoveBad.addEventListener('click', () => {
  if (!puzzle.solution) return;
  removeBadMarks(board, puzzle.solution);
  clearHighlights();
  els.mistakeText.textContent = '';
  syncAllCellVisuals();
});

// ---- toolbar ----

els.btnNew.addEventListener('click', () => loadPuzzle(puzzle.id));
els.puzzleSelect.addEventListener('change', (e) => loadPuzzle(e.target.value));
els.toggleAutocheck.addEventListener('change', (e) => {
  autoCheckEnabled = e.target.checked;
});

// ---- boot ----

populatePuzzleSelect();
loadPuzzle(SAMPLE_PUZZLES[0].id);
