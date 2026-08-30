// UI wiring for the full puzzle experience (build-order item 7). Plain ES modules, no
// bundler — matches the project's existing static-site pattern. All the actual logic
// (solving, hints, mistake-checking) lives in src/*; this file only renders the board and
// dispatches user actions to those modules.

import { Board, UNKNOWN, FILLED, EMPTY, isLineSatisfied } from './src/model.js';
import { getNextHint } from './src/solver.js';
import { findContradictionHint } from './src/contradiction.js';
import { phraseDeduction } from './src/hintPhrasing.js';
import { autoCheckMark, checkForMistakes, removeBadMarks } from './src/mistakes.js';
import { SAMPLE_PUZZLES } from './src/puzzles.js';

let puzzle = null;
let board = null;
let autoCheckEnabled = false;
let activeMode = 'fill'; // 'fill' | 'x' — which mark a click/drag applies (item 7.1)
let highlightedCells = []; // { row, col, kind: 'reasoning' | 'result' }
let puzzleStartTime = 0;
let puzzleCompleteShown = false;

const cellEls = new Map(); // "r,c" -> element
const rowClueEls = [];
const colClueEls = [];

const els = {
  puzzleSelect: document.getElementById('puzzle-select'),
  boardRoot: document.getElementById('board-root'),
  statusLine: document.getElementById('status-line'),
  modeFill: document.getElementById('mode-fill'),
  modeX: document.getElementById('mode-x'),
  toggleAutocheck: document.getElementById('toggle-autocheck'),
  helpMenuBtn: document.getElementById('help-menu-btn'),
  helpMenuList: document.getElementById('help-menu-list'),
  menuHowToPlay: document.getElementById('menu-how-to-play'),
  menuHint: document.getElementById('menu-hint'),
  menuCheck: document.getElementById('menu-check'),
  menuRemoveBad: document.getElementById('menu-remove-bad'),
  menuClearAll: document.getElementById('menu-clear-all'),
  explainBody: document.getElementById('explain-panel-body'),
  btnContradiction: document.getElementById('btn-contradiction'),
  mistakePopup: document.getElementById('mistake-popup'),
  mistakePopupText: document.getElementById('mistake-popup-text'),
  mistakePopupDismiss: document.getElementById('mistake-popup-dismiss'),
  mistakePopupLearn: document.getElementById('mistake-popup-learn'),
  howToPlayModal: document.getElementById('howtoplay-modal'),
  btnHowToPlayClose: document.getElementById('btn-howtoplay-close'),
  completeModal: document.getElementById('complete-modal'),
  btnCompleteClose: document.getElementById('btn-complete-close'),
  statTime: document.getElementById('stat-time'),
  statHints: document.getElementById('stat-hints'),
  statMistakes: document.getElementById('stat-mistakes'),
};

const EXPLAIN_IDLE_HTML =
  '<p class="explain-panel__idle">Use the <strong>Help</strong> menu above to get a hint or check your work — the explanation shows up here.</p>';

function setExplain(content) {
  els.explainBody.innerHTML = '';
  if (content == null || content === '') {
    els.explainBody.innerHTML = EXPLAIN_IDLE_HTML;
  } else if (typeof content === 'string') {
    els.explainBody.textContent = content;
  } else {
    els.explainBody.appendChild(content);
  }
}

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
  puzzleStartTime = Date.now();
  puzzleCompleteShown = false;
  setExplain(null);
  els.btnContradiction.classList.add('hidden');
  hideMistakePopup();
  els.completeModal.classList.add('hidden');
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
      // 5x5 chunk guides — a thicker border every 5 rows/cols, computed from the actual
      // row/col index (see styles.css: nth-child can't be used here because the grid's DOM
      // children also include clue cells, so child position doesn't track column index).
      if ((c + 1) % 5 === 0) cell.classList.add('chunk-col-end');
      if ((r + 1) % 5 === 0) cell.classList.add('chunk-row-end');
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
    if (boardMatchesSolution()) {
      updateStatus('🎉 Solved!');
      maybeShowCompletion();
    } else {
      updateStatus("All cells are marked, but something's off — try Check my work.");
    }
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

// ---- puzzle-complete notification (item 7.5) ----

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Hints-used and mistakes-made are both derived from move history rather than tracked with
// separate live counters — applyHintDeduction tags hint-originated moves with source:'hint',
// and any cell ever written to a state that disagrees with the solution counts as a caught
// mistake, whether or not the player ever ran Check my work.
function computeCompletionStats() {
  let hintsUsed = 0;
  let mistakes = 0;
  for (const move of board.history) {
    if (move.source === 'hint') hintsUsed++;
    for (const cell of move.cells) {
      const correct = puzzle.solution[cell.row][cell.col] ? FILLED : EMPTY;
      if (cell.next !== correct) mistakes++;
    }
  }
  return { hintsUsed, mistakes };
}

function maybeShowCompletion() {
  if (puzzleCompleteShown || !puzzle.solution) return;
  puzzleCompleteShown = true;
  const { hintsUsed, mistakes } = computeCompletionStats();
  els.statTime.textContent = formatDuration(Date.now() - puzzleStartTime);
  els.statHints.textContent = String(hintsUsed);
  els.statMistakes.textContent = String(mistakes);
  els.completeModal.classList.remove('hidden');
}

els.btnCompleteClose.addEventListener('click', () => {
  els.completeModal.classList.add('hidden');
});

// ---- mistake pop-up (item 7.4) ----

function hideMistakePopup() {
  els.mistakePopup.classList.add('hidden');
}

async function showMistakePopup(mistake) {
  els.mistakePopupText.textContent = await phraseDeduction(mistake);
  els.mistakePopup.classList.remove('hidden');
}

els.mistakePopupDismiss.addEventListener('click', () => {
  hideMistakePopup(); // mark is left as-is — dismiss doesn't touch the board
});

els.mistakePopupLearn.addEventListener('click', () => {
  hideMistakePopup();
  runOnDemandCheck({ fromPopup: true });
});

// ---- pointer interaction: a mode toggle picks Fill or Mark-empty, click applies it,
// clicking an already-marked cell in that state clears it, drag paints a stroke using
// whichever action the first cell in the drag performed (item 7.1). ----

function setMode(mode) {
  activeMode = mode;
  els.modeFill.setAttribute('aria-pressed', String(mode === 'fill'));
  els.modeX.setAttribute('aria-pressed', String(mode === 'x'));
}

els.modeFill.addEventListener('click', () => setMode('fill'));
els.modeX.addEventListener('click', () => setMode('x'));

function targetStateFor(current) {
  if (activeMode === 'fill') return current === FILLED ? UNKNOWN : FILLED;
  return current === EMPTY ? UNKNOWN : EMPTY;
}

// If a pending batch of changes would leave some row or column's placed fills exactly
// matching its clue, every other still-unknown cell in that line can never be filled
// without breaking the clue — so it's forced empty. Uses isLineSatisfied's proper run
// comparison (not a plain fill-count check), because a count-only check would wrongly
// trigger on an arrangement that happens to have the right number of filled cells but the
// wrong run pattern (see model.js). Only FILLED placements can newly satisfy a line — an
// EMPTY/UNKNOWN placement never adds a fill, so it can't complete one.
//
// Takes the pending (not-yet-applied) changes so it works for both a single manual mark
// (paintCell) and a multi-cell hint deduction (applyHintDeduction) — a hint can fill
// several cells across several columns in one go, so every touched row/col is checked, not
// just one. Returns `changes` plus any triggered auto-X cells, ready for one Board.setBatch
// call — batching them together is what makes undo-to-point remove a move's auto-X marks
// along with it (see model.js's Board.setBatch doc). Fixes the bug where a hint that
// completes a line didn't auto-X, because the hint path used to skip this check entirely.
function withAutoX(changes) {
  const touchedRows = new Set();
  const touchedCols = new Set();
  for (const { row, col, state } of changes) {
    if (state !== FILLED) continue;
    touchedRows.add(row);
    touchedCols.add(col);
  }
  if (touchedRows.size === 0 && touchedCols.size === 0) return changes;

  const pending = new Map();
  for (const { row, col, state } of changes) pending.set(`${row},${col}`, state);
  const valueAt = (r, c) => (pending.has(`${r},${c}`) ? pending.get(`${r},${c}`) : board.get(r, c));

  const extra = [];
  for (const r of touchedRows) {
    const row = Array.from({ length: puzzle.cols }, (_, c) => valueAt(r, c));
    if (isLineSatisfied(row, puzzle.rowClues[r])) {
      for (let c = 0; c < puzzle.cols; c++) {
        if (row[c] === UNKNOWN) extra.push({ row: r, col: c, state: EMPTY });
      }
    }
  }
  for (const c of touchedCols) {
    const col = Array.from({ length: puzzle.rows }, (_, r) => valueAt(r, c));
    if (isLineSatisfied(col, puzzle.colClues[c])) {
      for (let r = 0; r < puzzle.rows; r++) {
        if (col[r] === UNKNOWN) extra.push({ row: r, col: c, state: EMPTY });
      }
    }
  }
  return [...changes, ...extra];
}

// Apply a deduction's result cells to the board, run through the same auto-X check as
// manual marking (see withAutoX) — this is what item 7's hint path was missing.
function applyHintDeduction(deduction, opts) {
  if (!deduction || deduction.resultState == null) return;
  const changes = deduction.resultCells.map(({ row, col }) => ({ row, col, state: deduction.resultState }));
  board.setBatch(withAutoX(changes), opts);
}

function attachPointerHandlers(grid) {
  let dragging = null; // { paintState, touched: Set<string> }

  grid.addEventListener('contextmenu', (e) => e.preventDefault());

  // One user press/drag-step is one move: the pressed cell's mark plus any auto-X cells it
  // triggers are batched into a single history entry (see Board.setBatch) so undo-to-point
  // never leaves a line half-auto-marked.
  function paintCell(el, state) {
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    if (board.get(r, c) === state) return;
    const applied = board.setBatch(withAutoX([{ row: r, col: c, state }]));
    if (applied.length === 0) return;
    for (const cell of applied) {
      const cellEl = cellEls.get(`${cell.row},${cell.col}`);
      cellEl.classList.toggle('filled', cell.next === FILLED);
      cellEl.classList.toggle('empty', cell.next === EMPTY);
    }
    for (const cell of applied) onCellChanged(cell.row, cell.col);
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
    setExplain(null);
    hideMistakePopup();

    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const newState = targetStateFor(board.get(r, c));
    dragging = { paintState: newState, touched: new Set([`${r},${c}`]) };
    paintCell(el, newState);
    syncAllCellVisuals();
  });

  grid.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const el = cellAt(e.clientX, e.clientY);
    if (!el) return;
    const key = `${el.dataset.row},${el.dataset.col}`;
    if (dragging.touched.has(key)) return;
    dragging.touched.add(key);
    paintCell(el, dragging.paintState);
    syncAllCellVisuals();
  });

  function endDrag() {
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
      showMistakePopup(mistake);
    }
  }
}

// ---- hint / help controls ----

async function runGetHint() {
  clearHighlights();
  els.btnContradiction.classList.add('hidden');
  const hint = getNextHint(board, puzzle);
  if (!hint) {
    setExplain(
      "No forced move right now — from logic alone, more than one possibility remains for every open cell. " +
      "Keep solving by trial, or dig deeper for a slower, contradiction-based deduction."
    );
    els.btnContradiction.classList.remove('hidden');
    return;
  }
  applyHintDeduction(hint, { source: 'hint' });
  highlightDeduction(hint);
  syncAllCellVisuals();
  setExplain(await phraseDeduction(hint));
}

els.menuHint.addEventListener('click', () => {
  closeHelpMenu();
  runGetHint();
});

els.btnContradiction.addEventListener('click', async () => {
  setExplain('Searching…');
  await new Promise((resolve) => setTimeout(resolve, 0)); // let "Searching…" paint first
  const hint = findContradictionHint(board, puzzle);
  if (!hint) {
    setExplain("Even a deeper search can't find a forced move from here — this may need an outright guess.");
    return;
  }
  applyHintDeduction(hint, { source: 'hint' });
  highlightDeduction(hint);
  syncAllCellVisuals();
  setExplain(await phraseDeduction(hint));
  els.btnContradiction.classList.add('hidden');
});

// ---- mistake-handling controls ----

// Shared by the "Check my work" menu item and the mistake pop-up's "Learn more" — reuses
// mistakes.js's on-demand check rather than a separate explanation path (item 7.4).
// fromPopup:true skips the "auto-check is on" short-circuit, since Learn More should always
// produce the real explanation even when auto-check is what surfaced the mistake.
function runOnDemandCheck({ fromPopup = false } = {}) {
  if (!puzzle.solution) {
    setExplain('This puzzle has no known solution to check against yet.');
    return;
  }
  if (autoCheckEnabled && !fromPopup) {
    setExplain('Auto-check is on — mistakes are flagged the moment you make them.');
    return;
  }

  const result = checkForMistakes(board, puzzle.solution);
  if (result.origin === 'history') {
    if (result.moveIndex === null) {
      setExplain('No mistakes found in your moves so far.');
      return;
    }
    const container = document.createElement('div');
    const text = document.createElement('p');
    text.style.margin = '0';
    text.textContent =
      `Move #${result.moveIndex + 1} (row ${result.cell.row + 1}, col ${result.cell.col + 1}) ` +
      `was marked ${result.markedAs}, but should be ${result.shouldBe}.`;
    container.appendChild(text);
    highlightedCells = [{ ...result.cell, kind: 'result' }];
    applyHighlightClasses();
    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn--ghost';
    undoBtn.type = 'button';
    undoBtn.textContent = `Back up to before move #${result.moveIndex + 1}`;
    undoBtn.addEventListener('click', () => {
      board.undoToMove(result.moveIndex);
      clearHighlights();
      setExplain(null);
      syncAllCellVisuals();
    });
    container.appendChild(undoBtn);
    setExplain(container);
  } else {
    if (result.wrongCells.length === 0) {
      setExplain('No mistakes found.');
      return;
    }
    setExplain(
      `${result.wrongCells.length} cell(s) don't match the puzzle — highlighted on the board. ` +
      `This puzzle came from a scan with no move history, so there's no single point to undo to.`
    );
    highlightedCells = result.wrongCells.map((c) => ({ ...c, kind: 'result' }));
    applyHighlightClasses();
  }
}

els.menuCheck.addEventListener('click', () => {
  closeHelpMenu();
  runOnDemandCheck();
});

els.menuRemoveBad.addEventListener('click', () => {
  closeHelpMenu();
  if (!puzzle.solution) return;
  removeBadMarks(board, puzzle.solution);
  clearHighlights();
  setExplain(null);
  syncAllCellVisuals();
});

// "Clear all" is the old always-visible Reset button, relocated into the Help menu — since
// it wipes the board and move history with no undo, it asks for confirmation first.
els.menuClearAll.addEventListener('click', () => {
  closeHelpMenu();
  if (!window.confirm("Clear this puzzle and start over? This can't be undone.")) return;
  loadPuzzle(puzzle.id);
});

// ---- Help dropdown (item: UI consolidation pass) ----

function closeHelpMenu() {
  els.helpMenuList.classList.add('hidden');
  els.helpMenuBtn.setAttribute('aria-expanded', 'false');
}

function openHelpMenu() {
  els.helpMenuList.classList.remove('hidden');
  els.helpMenuBtn.setAttribute('aria-expanded', 'true');
}

els.helpMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (els.helpMenuList.classList.contains('hidden')) openHelpMenu();
  else closeHelpMenu();
});

document.addEventListener('click', (e) => {
  if (els.helpMenuList.classList.contains('hidden')) return;
  if (e.target === els.helpMenuBtn || els.helpMenuList.contains(e.target)) return;
  closeHelpMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeHelpMenu();
});

els.menuHowToPlay.addEventListener('click', () => {
  closeHelpMenu();
  els.howToPlayModal.classList.remove('hidden');
});

els.btnHowToPlayClose.addEventListener('click', () => {
  els.howToPlayModal.classList.add('hidden');
});

// ---- toolbar ----

els.puzzleSelect.addEventListener('change', (e) => loadPuzzle(e.target.value));
els.toggleAutocheck.addEventListener('change', (e) => {
  autoCheckEnabled = e.target.checked;
});

// ---- boot ----

setMode('fill');
populatePuzzleSelect();
loadPuzzle(SAMPLE_PUZZLES[0].id);
