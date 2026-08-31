// UI wiring for the full puzzle experience (build-order item 7). Plain ES modules, no
// bundler — matches the project's existing static-site pattern. All the actual logic
// (solving, hints, mistake-checking) lives in src/*; this file only renders the board and
// dispatches user actions to those modules.

import { Board, UNKNOWN, FILLED, EMPTY, isLineSatisfied, isLineLocked } from './src/model.js';
import { getNextHint } from './src/solver.js';
import { findContradictionHint } from './src/contradiction.js';
import { isLineConsistent } from './src/lineSolver.js';
import { phraseDeduction } from './src/hintPhrasing.js';
import { autoCheckMark, checkForMistakes, removeBadMarks } from './src/mistakes.js';
import { SAMPLE_PUZZLES } from './src/puzzles.js';
import { playSound, isMuted, toggleMuted, onDragSweepCell, startDragSweep, stopDragSweep } from './src/sounds.js';
import { recordCompletion, fetchAllStats, generatePairingCode, redeemPairingCode } from './src/stats.js';
import { initScanWizard } from './src/scanUI.js';

let puzzle = null;
let board = null;
let autoCheckEnabled = false;
let activeMode = 'fill'; // 'fill' | 'x' — which mark a click/drag applies (item 7.1)
let highlightedCells = []; // { row, col, kind: 'reasoning' | 'result' }
let puzzleStartTime = 0;
let puzzleCompleteShown = false;

// Cells currently EMPTY *because* auto-X put them there when their line completed — as
// opposed to a cell the player deliberately marked empty themselves. Line-locking needs
// this distinction: unfilling a cell that un-satisfies a line should only revert that
// line's auto-X'd cells back to UNKNOWN (they were only ever valid while the line read as
// complete), not any manual "Mark empty" marks the player made along the way. Keyed by
// "row,col"; kept in app.js rather than on Board since it's UI-only bookkeeping, not part
// of the solver-facing data model (see withAutoXTracked / revertUnsatisfiedLines below).
let autoXCells = new Set();

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
  muteToggle: document.getElementById('mute-toggle'),
  helpMenuBtn: document.getElementById('help-menu-btn'),
  helpMenuList: document.getElementById('help-menu-list'),
  menuHowToPlay: document.getElementById('menu-how-to-play'),
  menuHint: document.getElementById('menu-hint'),
  menuCheck: document.getElementById('menu-check'),
  menuRemoveBad: document.getElementById('menu-remove-bad'),
  menuScan: document.getElementById('menu-scan'),
  menuStats: document.getElementById('menu-stats'),
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
  statName: document.getElementById('stat-name'),
  statTime: document.getElementById('stat-time'),
  statHints: document.getElementById('stat-hints'),
  statMistakes: document.getElementById('stat-mistakes'),
  confirmModal: document.getElementById('confirm-modal'),
  confirmMessage: document.getElementById('confirm-message'),
  btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
  btnConfirmOk: document.getElementById('btn-confirm-ok'),
  statsModal: document.getElementById('stats-modal'),
  statsStatus: document.getElementById('stats-status'),
  statsTable: document.getElementById('stats-table'),
  statsTableBody: document.getElementById('stats-table-body'),
  btnGenerateCode: document.getElementById('btn-generate-code'),
  pairingCodeDisplay: document.getElementById('pairing-code-display'),
  pairingCodeInput: document.getElementById('pairing-code-input'),
  btnRedeemCode: document.getElementById('btn-redeem-code'),
  pairingStatus: document.getElementById('pairing-status'),
  btnStatsClose: document.getElementById('btn-stats-close'),
  scanModal: document.getElementById('scan-modal'),
  scanStepUpload: document.getElementById('scan-step-upload'),
  scanStepGrid: document.getElementById('scan-step-grid'),
  scanStepOcr: document.getElementById('scan-step-ocr'),
  scanStepCorrect: document.getElementById('scan-step-correct'),
  scanStepFillstate: document.getElementById('scan-step-fillstate'),
  scanStepDone: document.getElementById('scan-step-done'),
  scanFileInput: document.getElementById('scan-file-input'),
  scanCanvas: document.getElementById('scan-canvas'),
  scanGridHint: document.getElementById('scan-grid-hint'),
  scanBtnConfirmGrid: document.getElementById('scan-btn-confirm-grid'),
  scanGridConfirm: document.getElementById('scan-grid-confirm'),
  scanRowsInput: document.getElementById('scan-rows-input'),
  scanColsInput: document.getElementById('scan-cols-input'),
  scanBtnScanClues: document.getElementById('scan-btn-scan-clues'),
  scanOcrStatus: document.getElementById('scan-ocr-status'),
  scanRowClueList: document.getElementById('scan-row-clue-list'),
  scanColClueList: document.getElementById('scan-col-clue-list'),
  scanBuildError: document.getElementById('scan-build-error'),
  scanBtnBuild: document.getElementById('scan-btn-build'),
  scanFillstateGrid: document.getElementById('scan-fillstate-grid'),
  scanBtnConfirmState: document.getElementById('scan-btn-confirm-state'),
  scanBtnPlay: document.getElementById('scan-btn-play'),
  scanBtnCancel: document.getElementById('scan-btn-cancel'),
};

// ---- background-scroll lock while any full-screen modal is open ----
//
// Real iOS bug report: opening the scan wizard (or any .modal-overlay) and trying to scroll
// its content instead scrolled the PAGE BEHIND it. None of this app's modals ever locked
// background scroll — .modal-overlay is `position: fixed` and covers the viewport, but a
// fixed overlay with no scrollable content of its own doesn't stop iOS Safari from walking
// up to the next scrollable ancestor (the page body) for a touch-drag that starts on it, so
// the visible page kept scrolling underneath the modal. Desktop never showed this because a
// mouse wheel only scrolls whatever's directly under the cursor, not "the nearest scrollable
// ancestor" the way an iOS touch-pan gesture does — hence "works fine on PC".
//
// Fixed generically for every .modal-overlay (confirm/complete/how-to-play/stats/scan) via
// one MutationObserver watching all of them, rather than hand-wiring a lock/unlock call into
// each modal's own scattered show/hide call sites — safer against a future modal forgetting
// to wire it in, and there's nothing modal-specific about the fix itself.
//
// `position: fixed` on <body> (not just `overflow: hidden`) is the more robust of the two
// common approaches: plain `overflow: hidden` alone is known to still let iOS Safari
// rubber-band-scroll the body in some versions, where actually removing it from the normal
// scroll flow doesn't. Saves/restores the real scroll position across lock/unlock so closing
// a modal doesn't jump the page back to the top.
let bodyScrollLocked = false;
let savedBodyScrollY = 0;

function lockBodyScroll() {
  savedBodyScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedBodyScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  window.scrollTo(0, savedBodyScrollY);
}

function anyModalOpen() {
  return [...document.querySelectorAll('.modal-overlay')].some((el) => !el.classList.contains('hidden'));
}

function syncBodyScrollLock() {
  const shouldLock = anyModalOpen();
  if (shouldLock && !bodyScrollLocked) {
    lockBodyScroll();
    bodyScrollLocked = true;
  } else if (!shouldLock && bodyScrollLocked) {
    unlockBodyScroll();
    bodyScrollLocked = false;
  }
}

const modalOverlayEls = document.querySelectorAll('.modal-overlay');
const modalVisibilityObserver = new MutationObserver(syncBodyScrollLock);
modalOverlayEls.forEach((el) => modalVisibilityObserver.observe(el, { attributes: true, attributeFilter: ['class'] }));
syncBodyScrollLock(); // covers the (currently theoretical) case one starts already visible

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
  // The explain panel's height can change with its content (e.g. a "Back up to..." button
  // appearing) — re-fit the board since that panel eats into fitBoardToViewport's available
  // height budget.
  fitBoardToViewport();
}

// ---- puzzle lifecycle ----

// Puzzle names are hidden until completion (item: hide the puzzle's name until completion)
// so picking a puzzle doesn't already give away what image it is — the picker shows a
// generic "Puzzle N — RxC" label instead of puzzle.name. The real name is revealed in the
// completion modal (see maybeShowCompletion) once there's no picture left to spoil.
function populatePuzzleSelect() {
  els.puzzleSelect.innerHTML = '';
  SAMPLE_PUZZLES.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `Puzzle ${i + 1} — ${p.rows}x${p.cols}`;
    els.puzzleSelect.appendChild(opt);
  });
}

// The most recently scanned puzzle this session (item 10), if any — kept separately from
// SAMPLE_PUZZLES since a scanned puzzle isn't part of the curated library (item 9's
// shared-library work is what would give it a permanent home; until then it only lives for
// this session). Re-selecting its entry in the puzzle picker routes back through here.
let scannedPuzzle = null;

function loadPuzzle(id) {
  const p =
    scannedPuzzle && scannedPuzzle.id === id
      ? scannedPuzzle
      : SAMPLE_PUZZLES.find((p) => p.id === id) ?? SAMPLE_PUZZLES[0];
  startPuzzle(p);
}

// Shared init for any puzzle, however it was loaded — normal picker selection or a freshly
// scanned one (see startScannedPuzzle). A scan-origin puzzle gets no move history (see
// model.js's Board class comment and mistakes.js's snapshot-origin mistake-checking) — the
// "no move history" and "never counts toward stats" behavior both fall out of that one
// puzzle.source check (recordCompletion skips it separately — see src/stats.js).
//
// `puzzle.initialMarks`, when present (a scanned puzzle whose fill/X state was detected and
// confirmed — see src/scanUI.js's fill-state review step and TODO.md's Current Objective),
// seeds the board from that snapshot via Board.fromGrid instead of starting blank — this is
// the whole point of capturing fill state at all: it lets a mid-solve scan land the player
// straight back where their photo already was, with the existing mistake-checking tools
// (autoCheckMark/checkForMistakes) immediately able to point at whatever's wrong, rather than
// silently discarding real progress the way scanning used to (see TODO.md's history).
function startPuzzle(p) {
  puzzle = p;
  els.puzzleSelect.value = puzzle.id;
  board = puzzle.initialMarks ? Board.fromGrid(puzzle.initialMarks) : new Board(puzzle.rows, puzzle.cols);
  board.hasHistory = puzzle.source !== 'scan';
  highlightedCells = [];
  autoXCells = new Set();
  puzzleStartTime = Date.now();
  puzzleCompleteShown = false;
  setExplain(null);
  els.btnContradiction.classList.add('hidden');
  hideMistakePopup();
  els.completeModal.classList.add('hidden');
  renderBoard();
  updateStatus('');
}

// Called by the scan wizard (src/scanUI.js) once it has a solved, playable puzzle. Adds (or
// reuses) one picker entry for it so switching back to it later in the session works the
// same way picking any other puzzle does.
function startScannedPuzzle(p) {
  scannedPuzzle = p;
  let opt = els.puzzleSelect.querySelector('option[data-scan]');
  if (!opt) {
    opt = document.createElement('option');
    opt.dataset.scan = 'true';
    els.puzzleSelect.insertBefore(opt, els.puzzleSelect.firstChild);
  }
  opt.value = p.id;
  opt.textContent = `Scanned puzzle — ${p.rows}x${p.cols}`;
  startPuzzle(p);
}

// ---- rendering ----

function renderBoard() {
  cellEls.clear();
  rowClueEls.length = 0;
  colClueEls.length = 0;
  els.boardRoot.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'nono-grid';
  // Sizing itself (gridTemplateColumns/Rows, --cell-size) happens in fitBoardToViewport
  // once this grid is attached below — see that function for why it needs live layout
  // rather than fixed rem units.

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
  fitBoardToViewport();
  attachPointerHandlers(grid);
  syncAllCellVisuals();
}

function clueHtml(clue) {
  const nums = clue.length ? clue : [0];
  return nums.map((n) => `<span>${n}</span>`).join('');
}

// ---- responsive board sizing (item: grid should scale to fill available screen space) ----
//
// Cell size is computed from live layout rather than fixed breakpoints: it measures the
// actual space available around the board (accounting for the header/toolbar above and the
// fixed-position bottom explain panel, whatever their current heights happen to be) and
// picks the largest square cell size that fits both dimensions of the puzzle's grid — so it
// keeps working if either surrounding area's height ever changes, in portrait or landscape,
// without needing separate hardcoded cases for either. See --cell-size in styles.css for
// where the result actually gets applied (grid template sizing here, cell/clue/mark sizing
// there, all driven off the one CSS variable).
const MIN_CELL_PX = 18; // below this, clue numbers and the ✕ mark stop being legible
const MAX_CELL_PX = 64; // caps how large cells get on a big screen with a tiny puzzle
// Clue-column-width-to-cell-size ratio, carried over from the original fixed sizing
// (maxClueLen * 1.1rem + 0.3rem against a fixed 1.9rem cell) so clue legibility is unchanged.
const CLUE_PER_DIGIT = 1.1 / 1.9;
const CLUE_BASE = 0.3 / 1.9;

function fitBoardToViewport() {
  if (!puzzle) return;
  const grid = els.boardRoot.querySelector('.nono-grid');
  if (!grid) return;

  const maxRowClueLen = Math.max(1, ...puzzle.rowClues.map((c) => c.length));
  const maxColClueLen = Math.max(1, ...puzzle.colClues.map((c) => c.length));
  const widthUnits = puzzle.cols + maxRowClueLen * CLUE_PER_DIGIT + CLUE_BASE;
  const heightUnits = puzzle.rows + maxColClueLen * CLUE_PER_DIGIT + CLUE_BASE;

  const rootRect = els.boardRoot.getBoundingClientRect();
  const rootStyle = getComputedStyle(els.boardRoot);
  const availableWidth = rootRect.width - parseFloat(rootStyle.paddingLeft) - parseFloat(rootStyle.paddingRight);

  // Available height = viewport space below the board-root's own top (which already
  // reflects everything stacked above it — page padding, header, toolbar, board-panel
  // padding) minus everything stacked below it (status line, board-panel's bottom
  // padding/border) minus the fixed explain panel's actual current height, minus a small
  // buffer so the board never visually touches either edge.
  const boardPanel = els.boardRoot.closest('.board-panel');
  const panelStyle = getComputedStyle(boardPanel);
  const statusLineRect = els.statusLine.getBoundingClientRect();
  const statusLineStyle = getComputedStyle(els.statusLine);
  const belowBoardRoot =
    statusLineRect.height +
    parseFloat(statusLineStyle.marginTop) +
    parseFloat(panelStyle.paddingBottom) +
    parseFloat(panelStyle.borderBottomWidth);
  const explainPanelHeight = document.getElementById('explain-panel').offsetHeight;
  const BUFFER_PX = 16;
  const availableHeight = window.innerHeight - rootRect.top - belowBoardRoot - explainPanelHeight - BUFFER_PX;

  const cellPx = Math.max(
    MIN_CELL_PX,
    Math.min(MAX_CELL_PX, Math.floor(Math.min(availableWidth / widthUnits, availableHeight / heightUnits)))
  );

  document.documentElement.style.setProperty('--cell-size', `${cellPx}px`);
  const clueColWidth = (maxRowClueLen * CLUE_PER_DIGIT + CLUE_BASE) * cellPx;
  const clueRowHeight = (maxColClueLen * CLUE_PER_DIGIT + CLUE_BASE) * cellPx;
  grid.style.gridTemplateColumns = `${clueColWidth}px repeat(${puzzle.cols}, ${cellPx}px)`;
  grid.style.gridTemplateRows = `${clueRowHeight}px repeat(${puzzle.rows}, ${cellPx}px)`;
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Locked/contradiction status is derived live from the board every render, same as
// isLineSatisfied already was for clue-graying — no separate flag to keep in sync. See
// isLineLocked's doc (model.js) for why "satisfied" alone isn't the lock condition, and
// isLineConsistent (lineSolver.js) for the contradiction check (a real DP-based
// satisfiability test, not the overlap-technique hint logic).
function rowLockedNow(r) {
  return isLineLocked(board.getRow(r), puzzle.rowClues[r]);
}
function colLockedNow(c) {
  return isLineLocked(board.getCol(c), puzzle.colClues[c]);
}

function syncAllCellVisuals() {
  const rowLocked = Array.from({ length: puzzle.rows }, (_, r) => rowLockedNow(r));
  const colLocked = Array.from({ length: puzzle.cols }, (_, c) => colLockedNow(c));

  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      const el = cellEls.get(`${r},${c}`);
      const state = board.get(r, c);
      el.classList.toggle('filled', state === FILLED);
      el.classList.toggle('empty', state === EMPTY);
      el.classList.toggle('locked', rowLocked[r] || colLocked[c]);
    }
  }
  for (let r = 0; r < puzzle.rows; r++) {
    const row = board.getRow(r);
    rowClueEls[r].classList.toggle('satisfied', isLineSatisfied(row, puzzle.rowClues[r]));
    rowClueEls[r].classList.toggle('contradiction', !isLineConsistent(row, puzzle.rowClues[r]));
  }
  for (let c = 0; c < puzzle.cols; c++) {
    const col = board.getCol(c);
    colClueEls[c].classList.toggle('satisfied', isLineSatisfied(col, puzzle.colClues[c]));
    colClueEls[c].classList.toggle('contradiction', !isLineConsistent(col, puzzle.colClues[c]));
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
  playSound('completeFanfare');
  const timeMs = Date.now() - puzzleStartTime;
  const { hintsUsed, mistakes } = computeCompletionStats();
  els.statName.textContent = puzzle.name; // reveal — see populatePuzzleSelect's comment
  els.statTime.textContent = formatDuration(timeMs);
  els.statHints.textContent = String(hintsUsed);
  els.statMistakes.textContent = String(mistakes);
  els.completeModal.classList.remove('hidden');
  // Fire-and-forget: a stats-write failure (offline, not deployed yet) must never affect the
  // completion UI the player already sees. recordCompletion itself skips scan-origin puzzles.
  recordCompletion(puzzle, { timeMs, hintsUsed, mistakes }).catch(() => {});
}

els.btnCompleteClose.addEventListener('click', () => {
  els.completeModal.classList.add('hidden');
});

// ---- confirm dialog (item: fix "Clear all" doing nothing) ----
//
// window.confirm() looks like the obvious fit for a destructive-action guard, but several
// real browser contexts auto-dismiss it — returning false with no dialog ever shown to the
// player — rather than throwing or warning: repeat calls in the same page load (Chrome's
// "prevent this page from creating additional dialogs"), most in-app/embedded webviews, and
// automated browser tooling (which is how this was caught) all do this. A confirm() guard
// that can silently return false makes the action it's guarding look broken, not merely
// "not yet confirmed" — which was exactly the "Clear all does nothing" symptom. This
// in-page dialog replaces it so the guard is never silently unreliable.
let confirmResolve = null;

function showConfirm(message) {
  els.confirmMessage.textContent = message;
  els.confirmModal.classList.remove('hidden');
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function resolveConfirm(result) {
  els.confirmModal.classList.add('hidden');
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve?.(result);
}

els.btnConfirmCancel.addEventListener('click', () => resolveConfirm(false));
els.btnConfirmOk.addEventListener('click', () => resolveConfirm(true));

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
// just one. Returns just the extra auto-X cells (not `changes` itself) so callers can tell
// them apart from the direct changes — applyWithAutoX below uses that split to keep
// autoXCells (see top of file) accurate.
function computeAutoXExtras(changes) {
  const touchedRows = new Set();
  const touchedCols = new Set();
  for (const { row, col, state } of changes) {
    if (state !== FILLED) continue;
    touchedRows.add(row);
    touchedCols.add(col);
  }
  if (touchedRows.size === 0 && touchedCols.size === 0) return [];

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
  return extra;
}

// Applies `changes` plus whatever auto-X they trigger (see computeAutoXExtras) as one
// batched move — batching is what makes undo-to-point remove a move's auto-X marks along
// with it (see model.js's Board.setBatch doc). Also keeps autoXCells in sync: a cell added
// by auto-X is recorded as such; a cell this batch sets to FILLED or back to UNKNOWN can no
// longer be "auto-X empty" (whether or not it was previously tracked), so it's dropped.
// Used by both paintCell and applyHintDeduction — fixes the old bug where a hint that
// completed a line didn't auto-X, because the hint path used to skip this check entirely.
function applyWithAutoX(changes, opts) {
  const extra = computeAutoXExtras(changes);
  const autoXKeys = new Set(extra.map((e) => `${e.row},${e.col}`));
  const applied = board.setBatch([...changes, ...extra], opts);
  for (const cell of applied) {
    const key = `${cell.row},${cell.col}`;
    if (autoXKeys.has(key)) autoXCells.add(key);
    else if (cell.next !== EMPTY) autoXCells.delete(key);
  }
  return applied;
}

// Apply a deduction's result cells to the board, run through the same auto-X check as
// manual marking (see applyWithAutoX) and the same move-sound logic (see
// applyMoveWithSound) — a multi-cell hint gets batch-complete-chime same as a multi-cell
// auto-X, and a hint that completes a line gets 'lock' same as a manual move would.
function applyHintDeduction(deduction, opts) {
  if (!deduction || deduction.resultState == null) return;
  const changes = deduction.resultCells.map(({ row, col }) => ({ row, col, state: deduction.resultState }));
  applyMoveWithSound(changes, opts);
}

// Clearing a FILLED cell back to UNKNOWN is the one move a locked line still allows (see
// isLineLocked in model.js and the .locked CSS rule). If that removal drops the cell's row
// or column out of satisfaction, that line's auto-X'd cells are no longer valid — they were
// only ever forced by the line reading as complete — so they revert to UNKNOWN too, batched
// into the same move as the primary cell. Deliberate manual "Mark empty" marks in that line
// are untouched, since only cells tracked in autoXCells (see top of file) are reverted.
function computeUnfillChanges(r, c) {
  const changes = [{ row: r, col: c, state: UNKNOWN }];

  const row = board.getRow(r);
  const wasRowSatisfied = isLineSatisfied(row, puzzle.rowClues[r]);
  row[c] = UNKNOWN;
  if (wasRowSatisfied && !isLineSatisfied(row, puzzle.rowClues[r])) {
    for (let cc = 0; cc < puzzle.cols; cc++) {
      if (autoXCells.has(`${r},${cc}`)) changes.push({ row: r, col: cc, state: UNKNOWN });
    }
  }

  const col = board.getCol(c);
  const wasColSatisfied = isLineSatisfied(col, puzzle.colClues[c]);
  col[r] = UNKNOWN;
  if (wasColSatisfied && !isLineSatisfied(col, puzzle.colClues[c])) {
    for (let rr = 0; rr < puzzle.rows; rr++) {
      if (autoXCells.has(`${rr},${c}`)) changes.push({ row: rr, col: c, state: UNKNOWN });
    }
  }

  return changes;
}

function applyUnfill(r, c, opts) {
  const applied = board.setBatch(computeUnfillChanges(r, c), opts);
  for (const cell of applied) autoXCells.delete(`${cell.row},${cell.col}`);
  return applied;
}

// ---- move sound effects (item 3) ----
//
// Lock/unlock and contradiction are emergent line-level properties, not something the
// change list itself says directly — so they're detected by snapshotting every row/col's
// locked/contradiction state immediately before and after applying a move, rather than
// threaded through as extra bookkeeping in computeAutoXExtras etc. Cheap at these puzzle
// sizes (a handful of isLineLocked/isLineConsistent calls per move) and keeps the sound
// logic entirely separate from the solver-facing mutation logic above.
function allLockedSnapshot() {
  return {
    rows: Array.from({ length: puzzle.rows }, (_, r) => rowLockedNow(r)),
    cols: Array.from({ length: puzzle.cols }, (_, c) => colLockedNow(c)),
  };
}

function allContradictionSnapshot() {
  return {
    rows: Array.from({ length: puzzle.rows }, (_, r) => !isLineConsistent(board.getRow(r), puzzle.rowClues[r])),
    cols: Array.from({ length: puzzle.cols }, (_, c) => !isLineConsistent(board.getCol(c), puzzle.colClues[c])),
  };
}

function anyNewlyTrue(before, after) {
  return (
    before.rows.some((v, i) => !v && after.rows[i]) || before.cols.some((v, i) => !v && after.cols[i])
  );
}

function anyNewlyFalse(before, after) {
  return (
    before.rows.some((v, i) => v && !after.rows[i]) || before.cols.some((v, i) => v && !after.cols[i])
  );
}

// Applies a fill/empty batch (manual mark or hint deduction) and plays exactly one sound for
// it, in priority order:
//   1. a line newly locking — 'lock' (this always also covers auto-X completing a line,
//      since isLineLocked = isLineSatisfied + fully marked, which is exactly what
//      computeAutoXExtras produces — see TODO.md's note on not stacking lock + chime)
//   2. more than one cell changed without locking anything (a multi-cell hint, or the
//      auto-X-without-locking case kept as a literal fallback even though 1) subsumes it in
//      practice) — 'batchCompleteChime'
//   3. mid-drag (dragStep:true), a single swept cell — drag-sweep, not fill/x-click
//   4. a single cell changed — 'fillClick' or 'xClick' depending on its new state
// A newly-contradictory line plays 'error' independently of the above (it's feedback about
// the board, not about what kind of move just happened, so it can layer with any of them).
function applyMoveWithSound(changes, opts, { dragStep = false } = {}) {
  const lockedBefore = allLockedSnapshot();
  const contradictionBefore = allContradictionSnapshot();
  const applied = applyWithAutoX(changes, opts);
  if (applied.length === 0) return applied;

  if (anyNewlyTrue(lockedBefore, allLockedSnapshot())) {
    playSound('lock');
  } else if (applied.length > 1) {
    playSound('batchCompleteChime');
  } else if (dragStep) {
    onDragSweepCell();
  } else {
    playSound(applied[0].next === FILLED ? 'fillClick' : 'xClick');
  }

  if (anyNewlyTrue(contradictionBefore, allContradictionSnapshot())) playSound('error');
  return applied;
}

// Same idea as applyMoveWithSound, for the one move type that can *un*lock a line.
function applyUnfillWithSound(r, c, opts, { dragStep = false } = {}) {
  const lockedBefore = allLockedSnapshot();
  const applied = applyUnfill(r, c, opts);
  if (applied.length === 0) return applied;

  if (anyNewlyFalse(lockedBefore, allLockedSnapshot())) playSound('unlock');
  else if (dragStep) onDragSweepCell();

  return applied;
}

function attachPointerHandlers(grid) {
  let dragging = null; // { paintState, touched: Set<string> }

  grid.addEventListener('contextmenu', (e) => e.preventDefault());

  // One user press/drag-step is one move: the pressed cell's mark plus any auto-X cells it
  // triggers are batched into a single history entry (see Board.setBatch) so undo-to-point
  // never leaves a line half-auto-marked.
  //
  // Line locking (item: line locking on top of auto-X): once a row or column is locked
  // (isLineLocked — fully marked and satisfied), no new mark is accepted anywhere in it,
  // with one exception — clearing an existing FILLED cell back to UNKNOWN. That's always
  // let through, since it's the only way a locked line becomes editable again (see
  // computeUnfillChanges).
  // dragStep distinguishes the drag's first cell (a click — fill-click/x-click) from cells
  // it sweeps across afterward (drag-sweep — see src/sounds.js) for sound purposes only;
  // it doesn't change what mark gets applied.
  function paintCell(el, state, { dragStep = false } = {}) {
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const current = board.get(r, c);
    if (current === state) return;

    const isUnfill = current === FILLED && state === UNKNOWN;
    if (!isUnfill && (rowLockedNow(r) || colLockedNow(c))) return;

    const applied = isUnfill
      ? applyUnfillWithSound(r, c, undefined, { dragStep })
      : applyMoveWithSound([{ row: r, col: c, state }], undefined, { dragStep });
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
    startDragSweep(); // no-op unless the 'stretch' drag-sweep prototype mode is active
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
    paintCell(el, dragging.paintState, { dragStep: true });
    syncAllCellVisuals();
  });

  function endDrag() {
    dragging = null;
    stopDragSweep();
  }
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
}

function onCellChanged(r, c) {
  if (autoCheckEnabled && puzzle.solution) {
    const mistake = autoCheckMark(board, puzzle.solution, r, c);
    if (mistake) {
      playSound('error'); // shared with the contradiction (red clue) trigger — see syncAllCellVisuals
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

const scanWizard = initScanWizard({ els, onPuzzleReady: startScannedPuzzle });
els.menuScan.addEventListener('click', () => {
  closeHelpMenu();
  scanWizard.open();
});

// "Clear all" is the old always-visible Reset button, relocated into the Help menu — since
// it wipes the board and move history with no undo, it asks for confirmation first (via
// showConfirm, not window.confirm — see that function's comment for why).
els.menuClearAll.addEventListener('click', async () => {
  closeHelpMenu();
  if (!(await showConfirm("Clear this puzzle and start over? This can't be undone."))) return;
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

// ---- persistent mute toggle (item 3) ----

function syncMuteButton() {
  const muted = isMuted();
  els.muteToggle.textContent = muted ? '🔇' : '🔊';
  els.muteToggle.setAttribute('aria-pressed', String(muted));
  els.muteToggle.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

els.muteToggle.addEventListener('click', () => {
  toggleMuted();
  syncMuteButton();
});

// ---- stats & pairing (item 4) ----

function formatAvgDuration(ms) {
  return formatDuration(ms);
}

async function refreshStatsTable() {
  els.statsStatus.textContent = 'Loading…';
  els.statsTable.classList.add('hidden');
  try {
    const rows = await fetchAllStats();
    if (rows.length === 0) {
      els.statsStatus.textContent = "No completed puzzles yet — solve one to start tracking stats.";
      return;
    }
    els.statsTableBody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${row.size}</td><td>${row.puzzlesSolved}</td>` +
        `<td>${formatAvgDuration(row.avgTimeMs)}</td><td>${row.avgHints.toFixed(1)}</td>`;
      els.statsTableBody.appendChild(tr);
    }
    els.statsStatus.textContent = '';
    els.statsTable.classList.remove('hidden');
  } catch (err) {
    console.warn('fetchAllStats failed:', err);
    els.statsStatus.textContent =
      "Couldn't load stats — this needs the stats Cloud Functions/Firestore rules deployed " +
      "(see functions/README.md) and a network connection.";
  }
}

els.menuStats.addEventListener('click', () => {
  closeHelpMenu();
  els.pairingCodeDisplay.classList.add('hidden');
  els.pairingCodeInput.value = '';
  els.pairingStatus.textContent = '';
  els.statsModal.classList.remove('hidden');
  refreshStatsTable();
});

els.btnStatsClose.addEventListener('click', () => {
  els.statsModal.classList.add('hidden');
});

els.btnGenerateCode.addEventListener('click', async () => {
  els.pairingCodeDisplay.classList.add('hidden');
  els.pairingStatus.textContent = 'Generating…';
  try {
    const { code, expiresInSeconds } = await generatePairingCode();
    els.pairingCodeDisplay.textContent = code;
    els.pairingCodeDisplay.classList.remove('hidden');
    const minutes = Math.round(expiresInSeconds / 60);
    els.pairingStatus.textContent = `Enter this on your other device within ${minutes} minutes.`;
  } catch (err) {
    console.warn('generatePairingCode failed:', err);
    els.pairingStatus.textContent =
      "Couldn't generate a code — this needs the pairing Cloud Functions deployed (see functions/README.md).";
  }
});

els.btnRedeemCode.addEventListener('click', async () => {
  const code = els.pairingCodeInput.value.trim();
  if (!code) return;
  els.pairingStatus.textContent = 'Linking…';
  try {
    await redeemPairingCode(code);
    els.pairingCodeInput.value = '';
    els.pairingStatus.textContent = 'Linked! Your stats are now combined with the other device.';
    refreshStatsTable();
  } catch (err) {
    console.warn('redeemPairingCode failed:', err);
    const message = err?.message || 'That code is invalid or already used.';
    els.pairingStatus.textContent = `Couldn't link: ${message}`;
  }
});

// ---- boot ----

setMode('fill');
syncMuteButton();
populatePuzzleSelect();
loadPuzzle(SAMPLE_PUZZLES[0].id);
window.addEventListener('resize', debounce(fitBoardToViewport, 100));
window.addEventListener('orientationchange', () => setTimeout(fitBoardToViewport, 50));
