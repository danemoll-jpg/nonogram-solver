// UI wiring for the full puzzle experience (build-order item 7). Plain ES modules, no
// bundler — matches the project's existing static-site pattern. All the actual logic
// (solving, hints, mistake-checking) lives in src/*; this file only renders the board and
// dispatches user actions to those modules.

import { Board, UNKNOWN, FILLED, EMPTY, isLineSatisfied, isLineLocked, hasUnstableId } from './src/model.js';
import { getNextHint } from './src/solver.js';
import { findContradictionHint } from './src/contradiction.js';
import { isLineConsistent, anchoredClueNumbers } from './src/lineSolver.js';
import { phraseDeduction } from './src/hintPhrasing.js';
import { autoCheckMark, checkForMistakes, removeBadMarks } from './src/mistakes.js';
import { SAMPLE_PUZZLES } from './src/puzzles.js';
import { playSound, isMuted, toggleMuted } from './src/sounds.js';
import { recordCompletion, fetchAllStats, generatePairingCode, redeemPairingCode } from './src/stats.js';
import { initScanWizard } from './src/scanUI.js';
import { initDrawWizard } from './src/drawUI.js';
import {
  fetchLibraryPuzzles,
  loadLibraryPuzzle,
  renamePuzzleInLibrary,
  fetchSolvedPuzzles,
  recordPuzzleSolved,
  saveInProgressPuzzle,
  deleteInProgressPuzzle,
  fetchInProgressPuzzles,
  loadInProgressPuzzle,
  fetchHiddenPuzzles,
  hidePuzzleInLibrary,
  unhidePuzzleInLibrary,
  fetchGlobalFastestTimes,
  submitGlobalFastestTime,
} from './src/puzzleLibrary.js';
import { ensureSignedIn } from './src/firebase.js';
import { cellsOnLine } from './src/geometry.js';
import { initTooltips, attachTooltip } from './src/tooltip.js';

let puzzle = null;
let board = null;
let autoCheckEnabled = false;
let activeMode = 'fill'; // 'fill' | 'x' | 'erase' — which mark a click/drag applies (item 7.1)
let highlightedCells = []; // { row, col, kind: 'reasoning' | 'result' }
let puzzleStartTime = 0;
let puzzleCompleteShown = false;
// Undo button (Current Objective — see TODO.md): computeCompletionStats derives hints-used
// by walking board.history, but undoLast() actually removes the undone move from history —
// so undoing a hint-sourced move would silently decrement that count, contradicting the
// confirmed rule that a used hint is permanent. This floor never decreases; hints-used is
// always max(what history currently shows, this) — see runUndo/applyHintDeduction's call
// sites and computeCompletionStats below.
let hintsUsedFloor = 0;

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
  pageRoot: document.getElementById('page-root'),
  explainPanel: document.getElementById('explain-panel'),
  btnOpenLibrary: document.getElementById('btn-open-library'),
  btnOpenStats: document.getElementById('btn-open-stats'),
  btnSaveProgress: document.getElementById('btn-save-progress'),
  btnUndo: document.getElementById('btn-undo'),
  boardRoot: document.getElementById('board-root'),
  statusLine: document.getElementById('status-line'),
  modeFill: document.getElementById('mode-fill'),
  modeX: document.getElementById('mode-x'),
  modeErase: document.getElementById('mode-erase'),
  toggleAutocheck: document.getElementById('toggle-autocheck'),
  muteToggle: document.getElementById('mute-toggle'),
  helpMenuBtn: document.getElementById('help-menu-btn'),
  helpMenuList: document.getElementById('help-menu-list'),
  menuHowToPlay: document.getElementById('menu-how-to-play'),
  menuHint: document.getElementById('menu-hint'),
  menuCheck: document.getElementById('menu-check'),
  menuRemoveBad: document.getElementById('menu-remove-bad'),
  libraryBtnScan: document.getElementById('library-btn-scan'),
  libraryBtnDraw: document.getElementById('library-btn-draw'),
  menuRestart: document.getElementById('menu-restart'),
  menuAllGames: document.getElementById('menu-all-games'),
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
  scanStepSize: document.getElementById('scan-step-size'),
  scanStepUpload: document.getElementById('scan-step-upload'),
  scanStepGrid: document.getElementById('scan-step-grid'),
  scanStepOcr: document.getElementById('scan-step-ocr'),
  scanStepCorrect: document.getElementById('scan-step-correct'),
  scanStepFillstate: document.getElementById('scan-step-fillstate'),
  scanStepDone: document.getElementById('scan-step-done'),
  scanRowsInput: document.getElementById('scan-rows-input'),
  scanColsInput: document.getElementById('scan-cols-input'),
  scanSizeError: document.getElementById('scan-size-error'),
  scanBtnSizeContinue: document.getElementById('scan-btn-size-continue'),
  scanFileInput: document.getElementById('scan-file-input'),
  scanCanvas: document.getElementById('scan-canvas'),
  scanGridHint: document.getElementById('scan-grid-hint'),
  scanBtnConfirmGrid: document.getElementById('scan-btn-confirm-grid'),
  scanOcrStatus: document.getElementById('scan-ocr-status'),
  scanRowClueList: document.getElementById('scan-row-clue-list'),
  scanColClueList: document.getElementById('scan-col-clue-list'),
  scanRecheckWarning: document.getElementById('scan-recheck-warning'),
  scanInvertSuspect: document.getElementById('scan-invert-suspect'),
  scanBtnFlipFillstate: document.getElementById('scan-btn-flip-fillstate'),
  scanBuildError: document.getElementById('scan-build-error'),
  scanBtnBuild: document.getElementById('scan-btn-build'),
  scanFillstateGrid: document.getElementById('scan-fillstate-grid'),
  scanBtnConfirmState: document.getElementById('scan-btn-confirm-state'),
  scanNameInput: document.getElementById('scan-name-input'),
  scanNameError: document.getElementById('scan-name-error'),
  scanBtnPlay: document.getElementById('scan-btn-play'),
  scanPlayStatus: document.getElementById('scan-play-status'),
  scanBtnCancel: document.getElementById('scan-btn-cancel'),
  drawModal: document.getElementById('draw-modal'),
  drawStepSize: document.getElementById('draw-step-size'),
  drawStepDraw: document.getElementById('draw-step-draw'),
  drawStepDone: document.getElementById('draw-step-done'),
  drawRowsInput: document.getElementById('draw-rows-input'),
  drawColsInput: document.getElementById('draw-cols-input'),
  drawSizeError: document.getElementById('draw-size-error'),
  drawBtnStart: document.getElementById('draw-btn-start'),
  drawGrid: document.getElementById('draw-grid'),
  drawBuildError: document.getElementById('draw-build-error'),
  drawBtnClear: document.getElementById('draw-btn-clear'),
  drawBtnDone: document.getElementById('draw-btn-done'),
  drawNameInput: document.getElementById('draw-name-input'),
  drawNameError: document.getElementById('draw-name-error'),
  drawBtnPlay: document.getElementById('draw-btn-play'),
  drawPlayStatus: document.getElementById('draw-play-status'),
  drawBtnCancel: document.getElementById('draw-btn-cancel'),
  libraryModal: document.getElementById('library-modal'),
  libraryStatus: document.getElementById('library-status'),
  libraryList: document.getElementById('library-list'),
  libraryFilterSolved: document.getElementById('library-filter-solved'),
  libraryFilterSize: document.getElementById('library-filter-size'),
  libraryFilterShowHidden: document.getElementById('library-filter-show-hidden'),
  btnLibraryClose: document.getElementById('btn-library-close'),
  renameModal: document.getElementById('rename-modal'),
  renameInput: document.getElementById('rename-input'),
  renameStatus: document.getElementById('rename-status'),
  btnRenameCancel: document.getElementById('btn-rename-cancel'),
  btnRenameSave: document.getElementById('btn-rename-save'),
};

// ---- background-scroll lock (formerly JS-toggled per modal, now permanent — see styles.css) ----
//
// Real iOS bug report that originally motivated this: opening the scan wizard (or any
// .modal-overlay) and trying to scroll its content instead scrolled the PAGE BEHIND it — a
// fixed overlay with no scrollable content of its own doesn't stop iOS Safari from walking up
// to the next scrollable ancestor (the page body) for a touch-drag that starts on it. That got
// fixed here via a MutationObserver toggling `overflow: hidden` on <html>/<body> only while a
// modal was open (confirming first that `position: fixed` on <body> — the older, more forceful
// technique — overshot: it also broke touch-scrolling the modal's own `.modal-card__body` on a
// real iOS device, since taking <body> out of normal flow changes how iOS hit-tests a nested
// `overflow: auto` region's touch-scroll gesture).
//
// Current Objective (app-wide scroll bug, round 2 — see TODO.md): the round-1 fix (magnitude-
// gating the resize listeners below) did not hold on real hardware, and the project owner asked
// to "just lock it down" rather than chase another incremental patch. Since `overflow: hidden`
// on <html>/<body> was ALREADY confirmed iOS-safe here (just conditionally, only while a modal
// was open), this generalizes it: <html>/<body> are now UNCONDITIONALLY non-scrolling (see
// styles.css), and #page-root / .scan-screen each own their own internal
// `overflow-y: auto` region instead — the exact same proven-safe pattern `.modal-card__body`
// already used, just applied to the whole screen instead of only a modal card. This removes the
// scroll-position feedback loop the round-1 fix could only gate, not eliminate: iOS's chrome
// (address bar/toolbar) auto-hide is driven by scrolling the top-level DOCUMENT specifically,
// not by an inner `overflow: auto` element's own scroll — with the document itself permanently
// non-scrollable, routine content reflow can no longer trigger a chrome collapse/expand at all,
// so there's no viewport-height blip left for fitBoardToViewport to (over)react to. No JS lock
// toggling, scroll-position save/restore, or MutationObserver is needed any more: a modal
// opening on top of a permanently-non-scrolling document doesn't change anything underneath it,
// so there's nothing to save or restore.

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

// Shared init for any puzzle, however it was loaded — a library-modal selection (built-in
// or community-saved, see the "puzzle library browse" section below), a freshly scanned one,
// or a freshly drawn one (both passed straight through as initScanWizard's/initDrawWizard's
// onPuzzleReady, which now auto-publish every played scan/drawing to the library first — see
// src/scanUI.js's scanBtnPlay handler and src/drawUI.js's own equivalent — so either arrives
// here as a normal source:'authored' puzzle with a real library id in the overwhelming common
// case). `board.hasHistory` is unconditionally true: even the rare fallback case (a scan or
// drawing played offline, before publishing could succeed) gets real post-import
// history/Undo per the corrected Current Objective guidance in TODO.md; only the imported
// baseline itself (seeded straight into the grid below, never into history) is permanently
// un-undoable, same shape as the resumed-progress case described next. The remaining
// `hasUnstableId(puzzle)` checks elsewhere (saveProgressIfApplicable, recordCompletion,
// recordPuzzleSolved, mistakes.js's snapshot-vs-history branch) still matter for that same
// rare fallback case — no stable id to save/track stats against — but no longer affect Undo.
//
// `puzzle.initialMarks`, when present (a scanned puzzle whose fill/X state was detected and
// confirmed — see src/scanUI.js's fill-state review step and TODO.md's Current Objective),
// seeds the board from that snapshot via Board.fromGrid instead of starting blank — this is
// the whole point of capturing fill state at all: it lets a mid-solve scan land the player
// straight back where their photo already was, with the existing mistake-checking tools
// (autoCheckMark/checkForMistakes) immediately able to point at whatever's wrong, rather than
// silently discarding real progress the way scanning used to (see TODO.md's history).
// `puzzle.resumed` + `puzzle.resumeElapsedMs`/`resumeHintsUsed`, when present (loaded via
// the library's "Incomplete" resume flow — see the library "Play" handler below and
// TODO.md's saved/incomplete-progress item), carry forward stats from BEFORE this session:
// board.history only ever records moves made in the current session (a save is a grid
// snapshot, not a full move log — see src/puzzleLibrary.js), so puzzleStartTime is offset
// backwards by resumeElapsedMs (making elapsed-time display include prior time for free,
// with no separate accumulator) and computeCompletionStats adds resumeHintsUsed onto
// whatever it derives from this session's own history.
function startPuzzle(p) {
  puzzle = p;
  board = puzzle.initialMarks ? Board.fromGrid(puzzle.initialMarks) : new Board(puzzle.rows, puzzle.cols);
  board.hasHistory = true;
  highlightedCells = [];
  autoXCells = new Set();
  hintsUsedFloor = 0;
  puzzleStartTime = Date.now() - (puzzle.resumeElapsedMs || 0);
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
  // class + no anchored/satisfied state yet: syncAllCellVisuals sets that per render, live —
  // see its own comment for why (a fresh puzzle load has no marks yet to compute against).
  return nums.map((n) => `<span class="nono-clue__num">${n}</span>`).join('');
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
const MIN_CELL_PX = 18; // below this, the ✕ mark and cell tap targets stop being usable
const MAX_CELL_PX = 64; // caps how large cells get on a big screen with a tiny puzzle

// Current Objective #3 (see TODO.md): clue-number legibility on large puzzles. Clue font-size
// used to be a straight `--cell-size * 0.41` — fine for small/medium puzzles, but on a large
// one (e.g. 25x25+) where fitBoardToViewport has to shrink cellPx a lot just to fit the CELLS
// in the viewport, the clue text shrank right along with it and became hard to read, even
// though legible clue numbers don't actually need to be as large as the cells themselves.
// MIN_CLUE_FONT_PX decouples the floor: clue font-size still scales proportionally with cell
// size same as before ABOVE this floor (unchanged behavior for every puzzle size that was
// already fine), but never drops below it once a big grid would otherwise push it there.
// Reference: scratch-images/reference-30x30-legible.png (a competing app, "Nonogram 999")
// fits a real 30x30 puzzle on one screen with clue numbers that read as roughly FIXED size
// regardless of how small the cells get, rather than scaling all the way down with them —
// this is the same idea, not a literal pixel match to that screenshot.
const MIN_CLUE_FONT_PX = 13;
// Per-number clue-margin width/height, relative to the CLUE FONT SIZE (not cell size) —
// carried over from the original fixed sizing (1.1rem per number + 0.3rem base, against the
// original fixed 0.78rem clue font) so clue-margin proportions are unchanged from before this
// decoupling. Deliberately re-derived against clueFontPx rather than cellPx (see below): the
// margin only needs to be big enough to fit the rendered TEXT, and once font-size and cell-size
// can diverge (see MIN_CLUE_FONT_PX), sizing the margin off cellPx would clip the now-larger-
// than-cellPx-implies text on exactly the large puzzles this fix targets.
const CLUE_DIGIT_PER_FONT = 1.1 / 0.78;
const CLUE_BASE_PER_FONT = 0.3 / 0.78;

// Last viewport height fitBoardToViewport actually computed against — see
// handleViewportResize below for why this is tracked.
let lastFitViewportHeight = null;

function fitBoardToViewport() {
  syncExplainPanelSpace();
  if (!puzzle) return;
  const grid = els.boardRoot.querySelector('.nono-grid');
  if (!grid) return;

  const maxRowClueLen = Math.max(1, ...puzzle.rowClues.map((c) => c.length));
  const maxColClueLen = Math.max(1, ...puzzle.colClues.map((c) => c.length));

  const rootRect = els.boardRoot.getBoundingClientRect();
  const rootStyle = getComputedStyle(els.boardRoot);
  const availableWidth = rootRect.width - parseFloat(rootStyle.paddingLeft) - parseFloat(rootStyle.paddingRight);

  // Available height = viewport space below the board-root's own top (which already
  // reflects everything stacked above it — page padding, header, toolbar, board-panel
  // padding) minus everything stacked below it (status line, board-panel's bottom
  // padding/border, .page's own bottom padding) minus the fixed explain panel's actual
  // current height, minus a small buffer so the board never visually touches either edge.
  const boardPanel = els.boardRoot.closest('.board-panel');
  const panelStyle = getComputedStyle(boardPanel);
  const statusLineRect = els.statusLine.getBoundingClientRect();
  const statusLineStyle = getComputedStyle(els.statusLine);
  // Bug fix (iOS scroll regression, "baseline" symptom — see TODO.md): .page's own bottom
  // padding (breathing room after board-panel, before body's reserved explain-panel space)
  // was never subtracted here, so the page's real flow height could end up a bit taller
  // than the viewport even though the board itself fit within its own computed budget —
  // confirmed directly: a 375px mobile viewport with a 10x10 puzzle still overflowed by
  // ~18px after fixing the --explain-panel-space sync bug elsewhere in this same
  // investigation, traced to exactly this missing term.
  const pagePaddingBottom = parseFloat(getComputedStyle(els.pageRoot).paddingBottom);
  const belowBoardRoot =
    statusLineRect.height +
    parseFloat(statusLineStyle.marginTop) +
    parseFloat(panelStyle.paddingBottom) +
    parseFloat(panelStyle.borderBottomWidth) +
    pagePaddingBottom;
  const explainPanelHeight = document.getElementById('explain-panel').offsetHeight;
  const BUFFER_PX = 16;
  // visualViewport.height, not window.innerHeight, when available: innerHeight reflects the
  // LAYOUT viewport, which iOS Safari does not shrink when the on-screen keyboard opens —
  // sizing the board off it would keep the board (and the page height it drives) sized for
  // room that's no longer actually visible once the keyboard covers part of the screen,
  // exactly the "extra whitespace becomes scrollable" symptom this fixes (see TODO.md).
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  lastFitViewportHeight = viewportHeight;
  // Bug fix (iOS scroll regression, "baseline" symptom — see TODO.md): rootRect.top is
  // board-root's OUTER edge, before ITS OWN padding (.board-root { padding: 0.5rem } —
  // availableWidth above already subtracts the left/right half of this, but nothing
  // subtracted the top/bottom half here) — so the grid, sized directly off availableHeight,
  // could render up to a full board-root-padding taller than the room actually measured for
  // it. Confirmed directly as the last piece of a real (if modest, ~8px) baseline overflow
  // that survived the two fixes above it.
  const rootVerticalPadding = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom);
  const availableHeight =
    viewportHeight - rootRect.top - rootVerticalPadding - belowBoardRoot - explainPanelHeight - BUFFER_PX;

  // Pass 1: an initial cell-size estimate, treating the clue margin as if it still scaled
  // directly with cell size — the same approximation this function used before clue-font-size
  // decoupling existed. Only used below to decide whether that decoupling actually kicks in
  // (i.e. whether cellPx * 0.41 would fall under MIN_CLUE_FONT_PX); the REAL cellPx is solved
  // in pass 2 against the clue margin's actual (possibly now-larger) pixel size.
  const widthUnitsEstimate = puzzle.cols + maxRowClueLen * (CLUE_DIGIT_PER_FONT * 0.41) + CLUE_BASE_PER_FONT * 0.41;
  const heightUnitsEstimate = puzzle.rows + maxColClueLen * (CLUE_DIGIT_PER_FONT * 0.41) + CLUE_BASE_PER_FONT * 0.41;
  const cellPxEstimate = Math.max(
    MIN_CELL_PX,
    Math.min(MAX_CELL_PX, Math.floor(Math.min(availableWidth / widthUnitsEstimate, availableHeight / heightUnitsEstimate)))
  );

  // Current Objective #3 (see MIN_CLUE_FONT_PX's own comment): the clue font keeps scaling
  // proportionally with the estimated cell size above the floor (unchanged from before), and
  // sticks at the floor once a large puzzle would otherwise shrink it past legibility.
  const clueFontPx = Math.max(MIN_CLUE_FONT_PX, cellPxEstimate * 0.41);

  // Pass 2: the real clue-margin pixel size, off the (possibly decoupled) clue font rather
  // than cell size — see CLUE_DIGIT_PER_FONT/CLUE_BASE_PER_FONT's own comment. Subtracted from
  // the available space directly (in px, not "cell units") before dividing the REMAINDER by
  // rows/cols, since the margin no longer scales in lockstep with the cells once the floor is
  // active.
  const clueColWidth = (maxRowClueLen * CLUE_DIGIT_PER_FONT + CLUE_BASE_PER_FONT) * clueFontPx;
  const clueRowHeight = (maxColClueLen * CLUE_DIGIT_PER_FONT + CLUE_BASE_PER_FONT) * clueFontPx;
  const cellPx = Math.max(
    MIN_CELL_PX,
    Math.min(
      MAX_CELL_PX,
      Math.floor(Math.min((availableWidth - clueColWidth) / puzzle.cols, (availableHeight - clueRowHeight) / puzzle.rows))
    )
  );

  document.documentElement.style.setProperty('--cell-size', `${cellPx}px`);
  document.documentElement.style.setProperty('--clue-font-size', `${clueFontPx}px`);
  grid.style.gridTemplateColumns = `${clueColWidth}px repeat(${puzzle.cols}, ${cellPx}px)`;
  grid.style.gridTemplateRows = `${clueRowHeight}px repeat(${puzzle.rows}, ${cellPx}px)`;
}

// Bug fix (iOS scroll regression, "baseline" symptom — see TODO.md): body's own
// `padding-bottom` (styles.css) exists purely to reserve room for the fixed #explain-panel
// so it never covers board content, but it used to be a SECOND hardcoded rem value that had
// to be hand-kept in sync with the panel's own min-height — and had already drifted out of
// sync (5.5rem/88px reserved vs. a 4.5rem/72px minimum normally, 6.5rem/104px vs. 5.5rem/88px
// on narrow screens), so the page's real scrollable height was always a few pixels TALLER
// than anything visible actually needed, independent of board sizing (confirmed directly: a
// 375px-wide mobile viewport with a 10x10 puzzle measured 34px of scrollHeight beyond
// innerHeight even though the board itself rendered with room to spare above the panel).
// Rather than picking new numbers to re-sync by hand (the same trap that caused the drift),
// this reads the panel's REAL rendered height and writes it to a CSS variable
// (--explain-panel-space, consumed by body's padding-bottom in styles.css) so there's only
// ever one source of truth. A ResizeObserver on the panel itself would be the obvious way
// to catch every height change automatically (content reflow, the panel being hidden
// entirely for the scan wizard) — kept below as a belt-and-suspenders backstop, but NOT
// relied on alone: confirmed directly that it doesn't fire reliably in this project's own
// browser-preview tooling (no callback at all, even on a genuine forced height change), so
// this is also called explicitly from every place that actually changes the panel's
// height/visibility — fitBoardToViewport (itself already called on resize/orientationchange/
// visualViewport-resize/setExplain/wizard-close) and scanUI.js's openWizard (via the
// onOpen callback below, for the "wizard opens, panel hidden" case fitBoardToViewport isn't
// otherwise called for).
function syncExplainPanelSpace() {
  document.documentElement.style.setProperty('--explain-panel-space', `${els.explainPanel.offsetHeight}px`);
}
try {
  new ResizeObserver(syncExplainPanelSpace).observe(els.explainPanel);
} catch {
  // ResizeObserver missing entirely on some old browser — the explicit call sites above
  // still keep this correct without it.
}
syncExplainPanelSpace();

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

// Current Objective (per-number clue gray-out — see TODO.md): grays individual number spans
// within a clue independently, via anchoredClueNumbers (lineSolver.js) — see that function's
// own comment for the actual reasoning. Skipped entirely (nothing grayed) when the line is in
// genuine contradiction: anchoredClueNumbers' walk assumes a board state that's at least
// internally consistent, and a contradictory line already shows red at the whole-clue level
// (.contradiction, set by the caller) — graying individual numbers on top of that would be a
// confusing, unearned signal on marks the player still needs to fix. clueHtml renders exactly
// one .nono-clue__num span per clue number (or one placeholder span for an empty clue, which
// anchoredClueNumbers never touches — see clueHtml), in the same order as `clue`/`line`, so
// children[i] always lines up with anchored[i].
function applyAnchoredClasses(clueEl, line, clue, consistent) {
  const anchored = consistent ? anchoredClueNumbers(line, clue) : [];
  const spans = clueEl.children;
  for (let i = 0; i < spans.length; i++) {
    spans[i].classList.toggle('nono-clue__num--anchored', anchored[i] === true);
  }
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
    const consistent = isLineConsistent(row, puzzle.rowClues[r]);
    rowClueEls[r].classList.toggle('satisfied', isLineSatisfied(row, puzzle.rowClues[r]));
    rowClueEls[r].classList.toggle('contradiction', !consistent);
    applyAnchoredClasses(rowClueEls[r], row, puzzle.rowClues[r], consistent);
  }
  for (let c = 0; c < puzzle.cols; c++) {
    const col = board.getCol(c);
    const consistent = isLineConsistent(col, puzzle.colClues[c]);
    colClueEls[c].classList.toggle('satisfied', isLineSatisfied(col, puzzle.colClues[c]));
    colClueEls[c].classList.toggle('contradiction', !consistent);
    applyAnchoredClasses(colClueEls[c], col, puzzle.colClues[c], consistent);
  }
  applyHighlightClasses();
  els.btnUndo.disabled = board.history.length === 0;

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
  // Undo button (Current Objective — see TODO.md): a used hint is permanent even if the move
  // it produced is later undone (confirmed with the project owner) — but undoLast() actually
  // removes that move from board.history, so the plain history-derived count above would
  // silently shrink. hintsUsedFloor (bumped alongside every source:'hint' move, never
  // decremented — see runUndo/applyHintDeduction/menuRemoveBad's call sites) is the floor this
  // count can never drop below.
  hintsUsed = Math.max(hintsUsed, hintsUsedFloor);
  // Resumed-puzzle baseline (see startPuzzle's own comment) — hints given BEFORE this
  // session aren't in board.history at all, so they'd otherwise silently vanish from both
  // the completion modal and the next progress save.
  hintsUsed += puzzle.resumeHintsUsed || 0;
  return { hintsUsed, mistakes };
}

function maybeShowCompletion() {
  if (puzzleCompleteShown || !puzzle.solution) return;
  puzzleCompleteShown = true;
  playSound('completeFanfare');
  const timeMs = Date.now() - puzzleStartTime;
  const { hintsUsed, mistakes } = computeCompletionStats();
  els.statName.textContent = puzzle.name; // reveal — see the library modal's renderLibraryList
  els.statTime.textContent = formatDuration(timeMs);
  els.statHints.textContent = String(hintsUsed);
  els.statMistakes.textContent = String(mistakes);
  els.completeModal.classList.remove('hidden');
  // Fire-and-forget: a stats-write failure (offline, not deployed yet) must never affect the
  // completion UI the player already sees. Both calls skip scan-origin puzzles internally
  // (see recordCompletion and recordPuzzleSolved) — a scan has no stable identity worth
  // recording stats against, size-bucketed or per-puzzle.
  recordCompletion(puzzle, { timeMs, hintsUsed, mistakes }).catch(() => {});
  recordPuzzleSolved(puzzle, timeMs).catch(() => {});
  // Current Objective (see TODO.md): the global fastest-time-across-all-users stat. Same
  // fire-and-forget contract as the two calls above — submitGlobalFastestTime already skips
  // unpublished scan/drawn-origin puzzles internally (see its own comment).
  submitGlobalFastestTime(puzzle, timeMs).catch(() => {});
  // A genuinely solved puzzle has nothing left to "resume" — clear any stale in-progress
  // save so it stops showing under the library's Incomplete filter (see TODO.md's
  // saved/incomplete-progress item). Same fire-and-forget contract as the two calls above;
  // skips unpublished scan/drawn-origin puzzles the same way saveProgressIfApplicable does
  // (see its own comment) since they were never eligible to be saved in the first place.
  if (!hasUnstableId(puzzle)) deleteInProgressPuzzle(puzzle.id).catch(() => {});
}

els.btnCompleteClose.addEventListener('click', () => {
  els.completeModal.classList.add('hidden');
});

// ---- saved/incomplete puzzle progress (Current Objective — see TODO.md) ----
//
// Save cadence, confirmed with the project owner: explicit in-app-triggered saves only — no
// per-move writes, no browser-level "leaving" detection. Three call sites: the "Save
// progress" Help-menu item (explicit), opening the library modal (auto — "exits back to the
// library"), and picking a different puzzle in the library (auto — "switches puzzles"); see
// each one's own comment. All funnel through this one function so the eligibility rules
// below only need to stay in sync in one place.
//
// Eligible puzzles only: unpublished scan/drawn-origin snapshots have no stable identity
// worth saving against (same reasoning recordCompletion/recordPuzzleSolved already use to
// skip them — see hasUnstableId), and a puzzle with no known solution can't produce the
// hintsUsed/mistakes stats this feature tracks anyway. A completed board has nothing left to
// "resume" (maybeShowCompletion already deletes any stale save on a genuine solve; a
// complete-but-wrong board is a rare edge case better left to Check my work / Remove bad
// marks than folded in here). An untouched (all-UNKNOWN) board deletes any stale save
// instead of writing an empty one — covers the case where a player resumed a puzzle, then
// manually cleared it back to blank by hand (short of a full Restart) without ever adding a
// new mark worth preserving.
async function saveProgressIfApplicable() {
  if (!puzzle || !board || hasUnstableId(puzzle) || !puzzle.solution) return;
  if (board.isComplete()) return;
  const hasAnyMarks = board.grid.some((row) => row.some((cell) => cell !== UNKNOWN));
  if (!hasAnyMarks) {
    await deleteInProgressPuzzle(puzzle.id);
    return;
  }
  const { hintsUsed } = computeCompletionStats();
  const elapsedMs = Date.now() - puzzleStartTime;
  await saveInProgressPuzzle(puzzle.id, board.grid, elapsedMs, hintsUsed);
}

// Current Objective #3 (see TODO.md): moved out of the Help menu onto its own main-toolbar
// button, alongside Library/Stats — the project owner confirmed after round 1 shipped this
// under Help that the same "not really a help action" reasoning already applied to those two
// applies here too, and the UI-polish round's toolbar trimming left room for it.
els.btnSaveProgress.addEventListener('click', async () => {
  // Current Objective (see TODO.md): a played scan or drawing now auto-publishes to the
  // library before it ever reaches startPuzzle (see src/scanUI.js's/src/drawUI.js's "Play
  // it" handlers), so hasUnstableId(puzzle) here means that publish attempt specifically
  // failed (offline, not deployed yet) — the rare fallback case, not the normal state.
  if (hasUnstableId(puzzle)) {
    setExplain("Couldn't save — this puzzle wasn't added to the library (offline, or not deployed yet), so it has no stable identity to save progress against.");
    return;
  }
  if (!puzzle.solution) {
    setExplain("This puzzle can't be saved yet.");
    return;
  }
  try {
    await saveProgressIfApplicable();
    setExplain('Progress saved — find it under the library’s "Incomplete" filter.');
  } catch (err) {
    console.warn('saveProgressIfApplicable failed:', err);
    setExplain("Couldn't save progress — offline, or not deployed yet.");
  }
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

// ---- rename-a-library-puzzle popup (Current Objective — see TODO.md) ----
//
// Replaces the old edit-in-place row (a text input swapped into whichever row triggered it,
// wherever that row sat in the scrollable list) after a second confirmed real-device
// scroll-bug trigger: a keyboard opening on a text input positioned near the bottom of the
// screen. Same promise-based shape as showConfirm above — resolves the trimmed new title on
// Save, or null on Cancel — and `.modal-overlay--top` (styles.css) is what actually avoids the
// trigger, pinning this modal near the top of the viewport regardless of which row opened it.
// The Firestore write itself stays in renderLibraryList's click handler (below), same
// separation of concerns as showConfirm not knowing what it's guarding.
let renameResolve = null;

function showRenameModal(currentTitle) {
  els.renameInput.value = currentTitle;
  els.renameStatus.textContent = '';
  els.renameModal.classList.remove('hidden');
  els.renameInput.focus();
  return new Promise((resolve) => {
    renameResolve = resolve;
  });
}

function resolveRename(result) {
  els.renameModal.classList.add('hidden');
  const resolve = renameResolve;
  renameResolve = null;
  resolve?.(result);
}

els.btnRenameCancel.addEventListener('click', () => resolveRename(null));
els.btnRenameSave.addEventListener('click', () => {
  const newTitle = els.renameInput.value.trim();
  if (!newTitle) return;
  resolveRename(newTitle);
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

// ---- pointer interaction: a mode toggle picks Fill, Mark-empty, or Eraser (Current
// Objective — see TODO.md), click applies it, clicking an already-marked cell in that state
// clears it, drag paints a stroke using whichever action the first cell in the drag performed
// (item 7.1). Eraser was chosen over inferring "erase intent" from what a drag happens to
// cross — it's a third, unambiguous mode, not a modification of how Fill/Mark-empty behave. ----

function setMode(mode) {
  activeMode = mode;
  els.modeFill.setAttribute('aria-pressed', String(mode === 'fill'));
  els.modeX.setAttribute('aria-pressed', String(mode === 'x'));
  els.modeErase.setAttribute('aria-pressed', String(mode === 'erase'));
}

els.modeFill.addEventListener('click', () => setMode('fill'));
els.modeX.addEventListener('click', () => setMode('x'));
els.modeErase.addEventListener('click', () => setMode('erase'));

function targetStateFor(current) {
  if (activeMode === 'fill') return current === FILLED ? UNKNOWN : FILLED;
  // Eraser always aims at UNKNOWN — paintCell's current === state check already no-ops a
  // click/drag-sweep over a cell that's UNKNOWN already (nothing to erase there).
  if (activeMode === 'erase') return UNKNOWN;
  return current === EMPTY ? UNKNOWN : EMPTY;
}

// Current Objective (TODO.md): a drag starting on a cell already in the mode's own target
// state (e.g. starting a Fill-mode drag on a cell that's already FILLED) did nothing at all,
// beyond clearing that one starting cell. Cause: pointerdown used targetStateFor's click
// semantics (toggle-to-clear an already-marked cell) to decide the WHOLE drag's paintState,
// so that single toggle silently redefined the entire stroke's intent to "paint UNKNOWN" —
// and since dragStep cells are only ever painted when they're already UNKNOWN (the
// drag-only-touches-blank-cells rule below), every later cell in the drag became a same-state
// no-op. This is the mode's own normal target regardless of what the first cell happens to
// already be — the toggle-to-clear behavior stays exactly as before for a plain single click
// (see the pointerdown handler below), just no longer leaks into what a drag-sweep paints.
function modeTargetState() {
  if (activeMode === 'fill') return FILLED;
  if (activeMode === 'erase') return UNKNOWN;
  return EMPTY;
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

// Rebuilds autoXCells from scratch by replaying board.history — which cell in the row's
// batch was the auto-X "extra" vs. the direct move is tagged per-cell via setBatch's `auto`
// option (see model.js) and threaded straight through into the history entry, so this is a
// pure function of history rather than something that has to be kept incrementally in sync.
// Deliberately re-derived (not incrementally patched) after EVERY mutation, including undo:
// undoLast()/undoToMove() truncate board.history directly without knowing anything about
// autoXCells, so any purely-incremental add/delete bookkeeping would silently go stale the
// first time a move got undone (a real gap found while building the repeatable Undo button —
// see TODO.md's Current Objective) — replaying history from scratch is correct by
// construction regardless of how history got to its current length.
function deriveAutoXCells(history) {
  const cells = new Set();
  for (const move of history) {
    for (const cell of move.cells) {
      const key = `${cell.row},${cell.col}`;
      if (cell.auto) cells.add(key);
      else cells.delete(key);
    }
  }
  return cells;
}

// Applies `changes` plus whatever auto-X they trigger (see computeAutoXExtras) as one
// batched move — batching is what makes undo-to-point remove a move's auto-X marks along
// with it (see model.js's Board.setBatch doc). `extra`'s cells are tagged auto:true so
// deriveAutoXCells (called right after) can tell them apart from the direct `changes` cells.
// Used by both paintCell and applyHintDeduction — fixes the old bug where a hint that
// completed a line didn't auto-X, because the hint path used to skip this check entirely.
function applyWithAutoX(changes, opts) {
  const extra = computeAutoXExtras(changes);
  const tagged = [
    ...changes.map((c) => ({ ...c, auto: false })),
    ...extra.map((c) => ({ ...c, auto: true })),
  ];
  const applied = board.setBatch(tagged, opts);
  autoXCells = deriveAutoXCells(board.history);
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
  autoXCells = deriveAutoXCells(board.history);
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

// Current Objective (TODO.md): a sound for an individual clue NUMBER newly becoming anchored
// (grayed out) — a per-number event (anchoredClueNumbers, lineSolver.js), distinct from an
// entire line locking. Same before/after-snapshot-around-the-mutation shape as
// allLockedSnapshot/anyNewlyTrue above, just per-number instead of per-line: each line's own
// anchored array is skipped (returned empty) whenever the line is in contradiction, matching
// applyAnchoredClasses' own rule that anchoredClueNumbers' walk assumes a consistent line.
// Plumbing only — see sounds.js's SOUND_FILES for the 'anchor' slot; the actual audio file is
// the project owner's own to source, not Code's.
function allAnchoredSnapshot() {
  return {
    rows: Array.from({ length: puzzle.rows }, (_, r) => {
      const row = board.getRow(r);
      return isLineConsistent(row, puzzle.rowClues[r]) ? anchoredClueNumbers(row, puzzle.rowClues[r]) : [];
    }),
    cols: Array.from({ length: puzzle.cols }, (_, c) => {
      const col = board.getCol(c);
      return isLineConsistent(col, puzzle.colClues[c]) ? anchoredClueNumbers(col, puzzle.colClues[c]) : [];
    }),
  };
}

function anyNewlyAnchored(before, after) {
  const newlyInLines = (beforeLines, afterLines) =>
    afterLines.some((afterArr, i) => afterArr.some((v, j) => v && !beforeLines[i][j]));
  return newlyInLines(before.rows, after.rows) || newlyInLines(before.cols, after.cols);
}

// Applies a fill/empty batch (manual mark or hint deduction) and plays exactly one sound for
// it, in priority order:
//   1. a line newly locking — 'lock' (this always also covers auto-X completing a line,
//      since isLineLocked = isLineSatisfied + fully marked, which is exactly what
//      computeAutoXExtras produces — see TODO.md's note on not stacking lock + chime)
//   2. more than one cell changed without locking anything (a multi-cell hint, or the
//      auto-X-without-locking case kept as a literal fallback even though 1) subsumes it in
//      practice) — 'batchCompleteChime'
// A newly-contradictory line plays 'error' independently of the above (it's feedback about
// the board, not about what kind of move just happened, so it can layer with any of them).
// Current Objective (see TODO.md): the routine per-cell dinging on every ordinary fill/X
// mark or drag-sweep step was removed on the project owner's direct feedback — a single
// mark or drag step that doesn't hit either case above is deliberately silent now. Only
// line-level/notable events (lock, unlock, batch, error, complete) still make sound.
function applyMoveWithSound(changes, opts) {
  const lockedBefore = allLockedSnapshot();
  const contradictionBefore = allContradictionSnapshot();
  const anchoredBefore = allAnchoredSnapshot();
  const applied = applyWithAutoX(changes, opts);
  if (applied.length === 0) return applied;
  // Undo button (Current Objective — see TODO.md): bump the permanent hint-count floor here,
  // once per hint-sourced move actually applied — see computeCompletionStats' own comment.
  if (opts?.source === 'hint') hintsUsedFloor++;

  const justLocked = anyNewlyTrue(lockedBefore, allLockedSnapshot());
  if (justLocked) {
    playSound('lock');
  } else if (applied.length > 1) {
    playSound('batchCompleteChime');
  }

  // Current Objective (TODO.md): 'anchor' — see allAnchoredSnapshot's comment. Skipped
  // whenever this same move already played 'lock': every remaining number in a
  // freshly-satisfied-and-locked line trivially finishes "anchored" too, so a separate ping
  // on top of the more significant lock sound would be redundant noise, not new information.
  // One shared sound per move no matter how many numbers anchor at once — the simpler of the
  // two options the TODO called out as an open design choice, and consistent with
  // lock/batchCompleteChime above already being exactly-one-sound-per-move.
  if (!justLocked && anyNewlyAnchored(anchoredBefore, allAnchoredSnapshot())) playSound('anchor');

  if (anyNewlyTrue(contradictionBefore, allContradictionSnapshot())) playSound('error');
  return applied;
}

// Same idea as applyMoveWithSound, for the one move type that can *un*lock a line. A plain
// unfill that doesn't unlock anything is silent, same reasoning as applyMoveWithSound above.
function applyUnfillWithSound(r, c, opts) {
  const lockedBefore = allLockedSnapshot();
  const applied = applyUnfill(r, c, opts);
  if (applied.length === 0) return applied;

  if (anyNewlyFalse(lockedBefore, allLockedSnapshot())) playSound('unlock');

  return applied;
}

// ---- repeatable Undo button (Current Objective — see TODO.md) ----
//
// Distinct from the mistake-driven "back up to move #N" flow above (runOnDemandCheck): this
// steps back exactly one move at a time, on demand, with no need to run a mistake check
// first. "One move" already matches this app's history-batching unit (Board.setBatch) — a
// drag-paint or a hint/auto-X batch undoes as one unit — so Board.undoLast() (model.js),
// which just calls undoToMove(history.length - 1), is exactly the right primitive; no new
// undo logic needed in model.js. Repeatable simply by not disabling itself after one use —
// syncAllCellVisuals disables the button only once board.history is genuinely empty (either
// nothing done yet, or a scan-baseline import that predates all real history — the baseline
// itself is seeded straight into the grid, never into history, so undo naturally can't cross
// it, matching the resumed-progress feature's same baseline-plus-new-moves shape).
function runUndo() {
  if (!board || board.history.length === 0) return;
  board.undoLast();
  autoXCells = deriveAutoXCells(board.history);
  clearHighlights();
  setExplain(null);
  syncAllCellVisuals();
}
els.btnUndo.addEventListener('click', runUndo);

// ---- live drag-fill cell counter (Current Objective — see TODO.md) ----
//
// A small floating badge that follows the pointer while the player is click-and-dragging a
// fill (or X) stroke, showing how many cells have been painted so far — lets them watch it
// hit a clue's run length instead of counting cells by eye after the fact. Deliberately a
// single lazily-created element reused across every drag (not recreated per-stroke): drags
// happen often enough during normal play that per-stroke DOM churn isn't worth it, and
// nothing about the badge needs to persist between strokes.
let dragCountBadgeEl = null;
function dragCountBadge() {
  if (!dragCountBadgeEl) {
    dragCountBadgeEl = document.createElement('div');
    dragCountBadgeEl.className = 'drag-count-badge hidden';
    dragCountBadgeEl.setAttribute('aria-hidden', 'true'); // transient visual feedback only — status-line/board state already carry the real info for a11y
    document.body.appendChild(dragCountBadgeEl);
  }
  return dragCountBadgeEl;
}
function showDragCountBadge(x, y, count) {
  const el = dragCountBadge();
  el.textContent = String(count);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.classList.remove('hidden');
}
function hideDragCountBadge() {
  dragCountBadgeEl?.classList.add('hidden');
}

function attachPointerHandlers(grid) {
  let dragging = null; // { paintState, touched: Set<string>, count: number }

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
  // dragStep distinguishes the drag's first cell (a click) from cells it sweeps across
  // afterward — used below to restrict what a sweep is allowed to touch (see the Bug fix
  // comment); it doesn't change what mark gets applied.
  // Returns true iff this call actually changed the board (used by the drag-fill counter
  // above to count only genuine paints, not every cell the pointer merely passed over).
  function paintCell(el, state, { dragStep = false } = {}) {
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    const current = board.get(r, c);
    if (current === state) return false;

    // Bug fix (Current Objective #4): a drag's paintState is fixed from whichever action its
    // *first* cell performed (see pointerdown below), then reapplied to every cell it sweeps
    // across. Applying it unconditionally meant dragging across an already-marked cell (e.g.
    // sweeping Fill mode over a cell the player had X'd) reused that same click-to-clear
    // logic and blanked it — a drag should only ever paint still-blank cells, never modify a
    // cell that's already FILLED or EMPTY, regardless of the drag's mode. Single-click
    // toggle-off-if-same-state (dragStep:false, the pointerdown call below) is unaffected —
    // only cells the drag *sweeps into* afterward are restricted to UNKNOWN.
    // Eraser mode is the mirror image of that rule (Current Objective — see TODO.md): it
    // should only ever touch already-marked cells while sweeping, never blank ones, so the
    // "sweep only touches UNKNOWN" restriction above doesn't apply to it.
    if (dragStep && activeMode !== 'erase' && current !== UNKNOWN) return false;

    // Eraser mode clearing a FILLED or EMPTY cell is the same operation as Fill mode's
    // click-an-already-filled-cell-to-clear-it (computeUnfillChanges/applyUnfillWithSound),
    // just generalized to EMPTY cells too — clearing an X mark has no line-unlock side effect
    // to compute (computeUnfillChanges is state-agnostic already), so reuse rather than
    // reinvent. Non-erase modes keep their original FILLED-only definition unchanged.
    const isUnfill = activeMode === 'erase' ? current !== UNKNOWN : current === FILLED && state === UNKNOWN;
    if (!isUnfill && (rowLockedNow(r) || colLockedNow(c))) return false;

    const applied = isUnfill
      ? applyUnfillWithSound(r, c, undefined)
      : applyMoveWithSound([{ row: r, col: c, state }], undefined);
    if (applied.length === 0) return false;
    for (const cell of applied) {
      const cellEl = cellEls.get(`${cell.row},${cell.col}`);
      cellEl.classList.toggle('filled', cell.next === FILLED);
      cellEl.classList.toggle('empty', cell.next === EMPTY);
    }
    for (const cell of applied) onCellChanged(cell.row, cell.col);
    return true;
  }

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.classList && el.classList.contains('nono-cell') ? el : null;
  }

  // ---- row/column crosshair highlight (Current Objective — see TODO.md) ----
  //
  // Highlights the full row and column of whichever cell is currently being pressed or
  // dragged across, so a misaligned tap/drag is easy to catch before committing — especially
  // useful on large puzzles. Deliberately separate from the reasoning/result highlight system
  // above (applyHighlightClasses/highlightedCells) — that one is deduction-driven and already
  // cleared on every pointerdown; this one tracks raw pointer position instead, live during
  // the interaction. Local to attachPointerHandlers (like `dragging`) so it naturally resets
  // on every renderBoard rather than needing separate cleanup when cellEls is rebuilt.
  let crosshair = null; // { row, col } | null

  function clearCrosshairHighlight() {
    if (!crosshair) return;
    const { row, col } = crosshair;
    for (let c = 0; c < puzzle.cols; c++) cellEls.get(`${row},${c}`)?.classList.remove('nono-cell--crosshair');
    for (let r = 0; r < puzzle.rows; r++) cellEls.get(`${r},${col}`)?.classList.remove('nono-cell--crosshair');
    crosshair = null;
  }

  function setCrosshairHighlight(row, col) {
    if (crosshair && crosshair.row === row && crosshair.col === col) return;
    clearCrosshairHighlight();
    crosshair = { row, col };
    for (let c = 0; c < puzzle.cols; c++) cellEls.get(`${row},${c}`)?.classList.add('nono-cell--crosshair');
    for (let r = 0; r < puzzle.rows; r++) cellEls.get(`${r},${col}`)?.classList.add('nono-cell--crosshair');
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
    setCrosshairHighlight(r, c);
    const newState = targetStateFor(board.get(r, c));
    // paintState (what a drag-sweep paints into later cells) is the mode's own normal target —
    // see modeTargetState's comment — NOT `newState`, which is only this pressed cell's own
    // click-toggle result and would wrongly redefine the whole stroke as "clear" when the
    // pressed cell happened to already be marked.
    dragging = { paintState: modeTargetState(), touched: new Set([`${r},${c}`]), count: 0, lastRow: r, lastCol: c };
    const changed = paintCell(el, newState);
    // Only show/count for a genuine fill or X paint — not a plain click-to-clear (newState
    // UNKNOWN), which isn't "painting a run" and wouldn't make sense to badge (see this
    // section's header comment).
    if (changed && newState !== UNKNOWN) {
      dragging.count = 1;
      showDragCountBadge(e.clientX, e.clientY, dragging.count);
    }
    syncAllCellVisuals();
  });

  grid.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (dragging.paintState !== UNKNOWN) {
      // Keep the badge glued to the pointer between cell boundaries too, not just on a new
      // cell — the whole point is glanceable feedback right where the player is looking.
      if (dragging.count > 0) showDragCountBadge(e.clientX, e.clientY, dragging.count);
    }
    const el = cellAt(e.clientX, e.clientY);
    if (!el) return;
    const r1 = Number(el.dataset.row);
    const c1 = Number(el.dataset.col);
    setCrosshairHighlight(r1, c1);

    // Walk every cell between where the drag last was and where it is now (see cellsOnLine's
    // own comment) instead of only painting this one sampled point — a fast swipe can easily
    // jump more than one cell between two pointermove events. touched still dedupes (a cell
    // this line re-crosses, or one already handled by an earlier event, is skipped exactly as
    // before), so this only ever paints strictly more of what a drag already visually covered.
    let anyChanged = false;
    for (const [r, c] of cellsOnLine(dragging.lastRow, dragging.lastCol, r1, c1)) {
      const key = `${r},${c}`;
      if (dragging.touched.has(key)) continue;
      dragging.touched.add(key);
      const cellEl = cellEls.get(key);
      if (!cellEl) continue;
      const changed = paintCell(cellEl, dragging.paintState, { dragStep: true });
      if (changed && dragging.paintState !== UNKNOWN) {
        dragging.count++;
        anyChanged = true;
      }
    }
    dragging.lastRow = r1;
    dragging.lastCol = c1;
    if (anyChanged) showDragCountBadge(e.clientX, e.clientY, dragging.count);
    syncAllCellVisuals();
  });

  function endDrag() {
    dragging = null;
    hideDragCountBadge(); // transient in-stroke feedback only — see this section's header comment
    clearCrosshairHighlight();
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
      autoXCells = deriveAutoXCells(board.history);
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
  const applied = removeBadMarks(board, puzzle.solution);
  // Undo button (Current Objective — see TODO.md): removeBadMarks batches every wrong cell
  // into one source:'hint' move (mistakes.js) — same "one floor bump per hint move" rule
  // applyMoveWithSound uses, kept in sync here since this path doesn't go through it.
  if (applied.length > 0) hintsUsedFloor++;
  clearHighlights();
  setExplain(null);
  syncAllCellVisuals();
});

// Auto-save trigger #3, scan flavor (see TODO.md's saved/incomplete-progress item and the
// library "Play" handler's own comment): finishing the scan wizard replaces the current
// puzzle with a freshly scanned one, same as picking a different puzzle from the library —
// save the OUTGOING puzzle's progress first, before startPuzzle discards it.
async function handleScannedPuzzleReady(p) {
  await saveProgressIfApplicable().catch(() => {});
  startPuzzle(p);
}

const scanWizard = initScanWizard({
  els,
  onPuzzleReady: handleScannedPuzzleReady,
  onClose: fitBoardToViewport,
  onOpen: syncExplainPanelSpace,
});
// Moved in from the Help menu (see index.html's comment) into the library modal — closing the
// library first, same as any other full-screen wizard being opened from it, so the two never
// stack.
els.libraryBtnScan.addEventListener('click', () => {
  els.libraryModal.classList.add('hidden');
  scanWizard.open();
});

// Current Objective (see TODO.md): "draw a puzzle" — the same auto-save-outgoing-puzzle-
// first/start-blank pattern handleScannedPuzzleReady above already established, since
// finishing the draw wizard replaces the current puzzle exactly the same way finishing the
// scan wizard does.
async function handleDrawnPuzzleReady(p) {
  await saveProgressIfApplicable().catch(() => {});
  startPuzzle(p);
}

const drawWizard = initDrawWizard({
  els,
  onPuzzleReady: handleDrawnPuzzleReady,
  onClose: fitBoardToViewport,
  onOpen: syncExplainPanelSpace,
});
els.libraryBtnDraw.addEventListener('click', () => {
  els.libraryModal.classList.add('hidden');
  drawWizard.open();
});

// Toolbar cleanup (see TODO.md): wires the custom hover/press tooltip (src/tooltip.js) onto
// every icon-only toolbar button that lost its visible label this round (X, Eraser, Stats,
// Undo, Save progress — see their own `data-tooltip` attributes in index.html). Called once,
// after all the toolbar markup above is guaranteed to exist.
initTooltips();

// ---- puzzle library browse (library-consolidation round — see TODO.md; started as item
// 9's save-to-library slice) ----
//
// The single puzzle-selection UI: merges the built-in SAMPLE_PUZZLES with the public
// community-saved puzzles from src/puzzleLibrary.js into one list. Every entry's id is
// unique across both sources (a SAMPLE_PUZZLES id like 'heart-5' vs. a Firestore-generated
// doc id), which is what lets solved-status tracking (users/{uid}/solvedLibraryPuzzles, see
// src/puzzleLibrary.js) key off one id space for both.

// Cached between a refresh and a filter change so switching the Solved/Unsolved or Size
// filter doesn't need to re-fetch — only refreshLibraryList (on open, or after a completion)
// re-fetches from Firestore.
let libraryEntriesCache = [];
let solvedPuzzlesCache = new Map(); // puzzleId -> { timesSolved, bestTimeMs }
// Saved/incomplete-progress item (see TODO.md) — backs the library's "Incomplete" filter and
// each matching row's in-progress badge, same caching contract as solvedPuzzlesCache above.
let inProgressPuzzlesCache = new Map(); // puzzleId -> { elapsedMs, hintsUsed }
// Hide-a-puzzle item (Current Objective — see TODO.md) — puzzleIds the current (or paired)
// player has personally hidden, same caching contract as the two above. Excluded from
// applyLibraryFilters' output entirely unless "Show hidden puzzles" is checked.
let hiddenPuzzlesCache = new Set();
// Global fastest-time-across-all-users item (Current Objective — see TODO.md), same caching
// contract as the others above — puzzleId -> fastestTimeMs.
let globalFastestTimesCache = new Map();
let libraryMyUid = null;

function builtinLibraryEntries() {
  return SAMPLE_PUZZLES.map((p) => ({
    id: p.id,
    rows: p.rows,
    cols: p.cols,
    title: p.name,
    builtin: true,
    creatorUid: null,
  }));
}

// Rebuilds the Size filter's options from whatever sizes are actually present, preserving
// the current selection if it's still a valid choice.
function populateLibrarySizeFilter(entries) {
  const sizes = [...new Set(entries.map((e) => `${e.rows}x${e.cols}`))];
  sizes.sort((a, b) => {
    const [ar, ac] = a.split('x').map(Number);
    const [br, bc] = b.split('x').map(Number);
    return ar * ac - br * bc || ar - br;
  });
  const prev = els.libraryFilterSize.value;
  els.libraryFilterSize.innerHTML = '<option value="all">All sizes</option>';
  for (const s of sizes) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    els.libraryFilterSize.appendChild(opt);
  }
  if (sizes.includes(prev)) els.libraryFilterSize.value = prev;
}

// One shared "⋮" overflow-menu popover for every library row (Rename/Hide) — same one-shared-
// floating-element idea as src/tooltip.js's one shared bubble, and for the same reason: a
// per-row popover positioned relative to its own row (position:absolute) got clipped by
// `.modal-card__body`'s own overflow-y:auto scroll region the moment a row's trigger was near
// that region's bottom edge (confirmed directly in testing — a real, not hypothetical, bug).
// `position:fixed` + appending to `document.body` + JS-computed coordinates escapes that
// clipping entirely, exactly like the tooltip bubble already does. Reused/repositioned per
// open rather than rebuilt per row, so nothing is left behind across renderLibraryList's
// repeated innerHTML rebuilds.
let rowMenuPopover = null;
let rowMenuOpenTrigger = null; // the trigger button the popover is currently showing for, or null

function ensureRowMenuPopover() {
  if (rowMenuPopover) return rowMenuPopover;
  rowMenuPopover = document.createElement('ul');
  rowMenuPopover.className = 'help-menu__list library-row__menu-popover hidden';
  rowMenuPopover.setAttribute('role', 'menu');
  document.body.appendChild(rowMenuPopover);
  return rowMenuPopover;
}

function closeRowMenu() {
  if (!rowMenuOpenTrigger) return;
  ensureRowMenuPopover().classList.add('hidden');
  rowMenuOpenTrigger.setAttribute('aria-expanded', 'false');
  rowMenuOpenTrigger = null;
}

// `items`: [{ label, onClick }]. Rebuilds the shared popover's contents fresh each open (cheap
// — at most two items) rather than trying to reuse/diff DOM across different rows' item sets.
function openRowMenu(trigger, items) {
  const popover = ensureRowMenuPopover();
  popover.innerHTML = '';
  for (const { label, onClick } of items) {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const btn = document.createElement('button');
    btn.className = 'help-menu__item';
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      closeRowMenu();
      onClick();
    });
    li.appendChild(btn);
    popover.appendChild(li);
  }
  popover.classList.remove('hidden');
  trigger.setAttribute('aria-expanded', 'true');
  rowMenuOpenTrigger = trigger;

  // Right-aligned under the trigger, flipped ABOVE it instead when there isn't room below —
  // the same viewport-clamping idea as src/tooltip.js's positionBubble, needed here for the
  // same underlying reason even though position:fixed already solves the ancestor-scroll-
  // clipping problem: a row near the bottom of the actual VIEWPORT (not just the modal's own
  // scroll region) still has nowhere to open downward into.
  const rect = trigger.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.right = 'auto'; // clear .help-menu__list's own `right: 0`, which would fight the explicit `left` below
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;
  const left = Math.min(Math.max(8, rect.right - pw), window.innerWidth - pw - 8);
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= ph + 8 ? rect.bottom + 4 : rect.top - ph - 4;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(8, top)}px`;
}

document.addEventListener('click', (e) => {
  if (!rowMenuOpenTrigger) return;
  if (e.target === rowMenuOpenTrigger || ensureRowMenuPopover().contains(e.target)) return;
  closeRowMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeRowMenu();
});

// Renders one row per (already filtered) library entry. `myUid` decides whether that row's
// rename affordance shows at all — the Firestore rule is what actually enforces who can
// rename (see firestore.rules), this just avoids showing a control that would fail for
// everyone but the creator; built-in entries never get one. `hiddenPuzzles` (hide-a-puzzle
// item — see TODO.md) is unrelated to ownership — every row, built-in or not, gets a Hide/
// Unhide toggle regardless of who created it, since hiding is a personal display preference,
// not an edit to the puzzle itself. Both now live behind one "⋮" overflow menu per row (see
// closeOpenRowMenu above) rather than as separate icon buttons.
function renderLibraryList(entries, solvedPuzzles, inProgressPuzzles, hiddenPuzzles, myUid, globalFastestTimes) {
  els.libraryList.innerHTML = '';
  for (const entry of entries) {
    const solved = solvedPuzzles.get(entry.id);
    // A puzzle only ever carries in-progress state if it's NOT solved (maybeShowCompletion
    // deletes the save the moment a solve is recorded — see its own comment) — checked
    // defensively rather than assumed, so a stale/racing save can't show both badges at once.
    const inProgress = !solved ? inProgressPuzzles.get(entry.id) : null;
    const hidden = hiddenPuzzles.has(entry.id);

    const li = document.createElement('li');
    li.className = hidden ? 'library-row library-row--hidden' : 'library-row';

    const title = document.createElement('span');
    title.className = 'library-row__title';
    // Hidden until solved — same generic "Puzzle N — RxC" placeholder scheme the old
    // dropdown used (see the completion-modal comment in index.html) — so browsing the
    // list doesn't spoil the picture. `displayIndex` is assigned once over the full
    // unfiltered merged list (see refreshLibraryList) so it stays stable across filtering.
    title.textContent = solved ? entry.title : `Puzzle ${entry.displayIndex} — ${entry.rows}x${entry.cols}`;

    const size = document.createElement('span');
    size.className = 'library-row__size';
    size.textContent = `${entry.rows}x${entry.cols}`;

    li.append(title, size);

    // Hide-a-puzzle item (see TODO.md) — only ever rendered when "Show hidden puzzles" is
    // checked (applyLibraryFilters excludes hidden rows entirely otherwise), so this and the
    // dimmed .library-row--hidden class above only ever appear together.
    if (hidden) {
      const hiddenBadge = document.createElement('span');
      hiddenBadge.className = 'library-row__hidden';
      hiddenBadge.textContent = '🙈 Hidden';
      li.appendChild(hiddenBadge);
    }

    if (solved) {
      // Direct ask: drop the "Solved"/"In progress" text — the ✓/⏳ symbols already carry the
      // meaning, and a hover/tap tooltip (the same shared mechanism Rename/Hide/the medal
      // already use) keeps it discoverable without spending row width on a text label.
      const solvedBadge = document.createElement('span');
      solvedBadge.className = 'library-row__solved';
      solvedBadge.textContent = '✓';
      solvedBadge.setAttribute('tabindex', '0');
      solvedBadge.setAttribute('aria-label', 'Solved');
      solvedBadge.setAttribute('data-tooltip', 'Solved');
      attachTooltip(solvedBadge);

      // Current Objective #3 (see TODO.md), corrected per direct follow-up feedback: the
      // first pass replaced the personal-best TIME with a medal and hid the number behind a
      // hover tooltip — but the ask was to keep both the world-record time and the personal-
      // best time visible as text, with the medal as an extra visual indicator alongside the
      // best time, not a replacement for it. Stacking the two lines (times-solved+best on one
      // line, the global record on the line below) is what actually reclaims the horizontal
      // room the puzzle's own name needs, rather than hiding either time.
      const statsStack = document.createElement('span');
      statsStack.className = 'library-row__stats-stack';

      const globalTimeMs = globalFastestTimes.get(entry.id);
      const personalLine = document.createElement('span');
      personalLine.className = 'library-row__personal-stats';
      const times = `${solved.timesSolved}×`;
      if (solved.bestTimeMs != null) {
        // Gold if this player's own best matches (or beats) the current global record, or if
        // no global record has been recorded yet at all (their own time is, by definition,
        // the only known one so far — reads as more sensible than defaulting to copper);
        // copper otherwise.
        const isGold = globalTimeMs == null || solved.bestTimeMs <= globalTimeMs;
        const medal = isGold ? '🥇' : '🥉';
        personalLine.textContent = `${times} · ${medal} ${formatDuration(solved.bestTimeMs)}`;
      } else {
        personalLine.textContent = times;
      }
      statsStack.appendChild(personalLine);

      // Absent until someone's completion has actually reported a time for this puzzle (see
      // submitGlobalFastestTime) — no placeholder shown before then.
      if (globalTimeMs != null) {
        const globalLine = document.createElement('span');
        globalLine.className = 'library-row__personal-stats library-row__global-stats';
        globalLine.textContent = `🌍 ${formatDuration(globalTimeMs)}`;
        statsStack.appendChild(globalLine);
      }

      li.append(solvedBadge, statsStack);
    } else if (inProgress) {
      const inProgressBadge = document.createElement('span');
      inProgressBadge.className = 'library-row__in-progress';
      inProgressBadge.textContent = '⏳';
      inProgressBadge.setAttribute('tabindex', '0');
      inProgressBadge.setAttribute('aria-label', 'In progress');
      inProgressBadge.setAttribute('data-tooltip', 'In progress');
      attachTooltip(inProgressBadge);
      const statsSpan = document.createElement('span');
      statsSpan.className = 'library-row__personal-stats';
      statsSpan.textContent = `${formatDuration(inProgress.elapsedMs)} so far`;
      li.append(inProgressBadge, statsSpan);
    }

    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn--primary';
    playBtn.type = 'button';
    playBtn.textContent = inProgress ? 'Resume' : 'Play';
    playBtn.addEventListener('click', async () => {
      playBtn.disabled = true;
      els.libraryStatus.textContent = '';
      try {
        const base = entry.builtin
          ? SAMPLE_PUZZLES.find((sp) => sp.id === entry.id)
          : await loadLibraryPuzzle(entry.id);
        // Resuming (see TODO.md's saved/incomplete-progress item): merge the saved snapshot
        // onto the base puzzle definition rather than trusting the base's own solve — the
        // built-in/library puzzle object is re-fetched/re-solved fresh above every time, so
        // this can't go stale even if the puzzle definition itself never changes.
        // loadInProgressPuzzle resolving null (a stale/already-cleared save racing this
        // click) falls back to a normal fresh start, not an error.
        const saved = inProgress ? await loadInProgressPuzzle(entry.id) : null;
        const p = saved
          ? { ...base, initialMarks: saved.grid, resumeElapsedMs: saved.elapsedMs, resumeHintsUsed: saved.hintsUsed, resumed: true }
          : base;
        // Auto-save trigger #3 (see TODO.md): switching to a different puzzle. Saves the
        // OUTGOING puzzle's progress before this one replaces it — a no-op if there's
        // nothing worth saving (see saveProgressIfApplicable).
        await saveProgressIfApplicable().catch(() => {});
        els.libraryModal.classList.add('hidden');
        startPuzzle(p);
      } catch (err) {
        console.warn('loadLibraryPuzzle failed:', err);
        els.libraryStatus.textContent = `Couldn't load "${entry.title}" — ${err?.message || 'try again.'}`;
        playBtn.disabled = false;
      }
    });
    li.appendChild(playBtn);

    // Direct follow-up: even icon-only Rename + Hide buttons side by side were still too much
    // row width. Both now live behind a single "⋮" overflow menu (openRowMenu/
    // ensureRowMenuPopover above), same idea as a mobile app's per-row overflow menu. Rename
    // only appears when allowed (own community puzzle), Hide/Unhide always does. Built as a
    // plain { label, onClick } list rather than real DOM here — the shared popover builds its
    // own `<li>`/`<button>` elements fresh per open (see openRowMenu).
    const menuItems = [];
    if (!entry.builtin && entry.creatorUid === myUid) {
      menuItems.push({
        label: '✏️ Rename',
        // Opens #rename-modal (see showRenameModal above) instead of swapping this row into an
        // inline edit state — the old behavior turned out to be a real scroll-bug trigger on a
        // row near the bottom of the list (a keyboard opening on a text input positioned near
        // the bottom of the screen — see TODO.md's Current Objective). Renaming still edits the
        // always-real `entry.title`; whether it's currently DISPLAYED depends on solved status
        // exactly like every other row, unaffected by this.
        onClick: async () => {
          const newTitle = await showRenameModal(entry.title);
          if (newTitle == null || newTitle === entry.title) return;
          els.libraryStatus.textContent = '';
          try {
            await renamePuzzleInLibrary(entry.id, newTitle);
            entry.title = newTitle;
            // Simplest correct way back to a normal, up-to-date list: re-run the filters
            // against the (now-updated) cache rather than hand-reassembling this one row.
            applyLibraryFilters();
          } catch (err) {
            console.warn('renamePuzzleInLibrary failed:', err);
            els.libraryStatus.textContent = `Couldn't rename — ${err?.message || 'try again.'}`;
          }
        },
      });
    }

    // Hide-a-puzzle item (see TODO.md): personal to this player only — never touches the
    // shared `puzzles/{puzzleId}` doc, so no other player's view of the library is affected
    // either way (see src/puzzleLibrary.js's hidePuzzleInLibrary/unhidePuzzleInLibrary).
    const hideLabel = hidden ? 'Unhide' : 'Hide';
    menuItems.push({
      label: hidden ? '👁️ Unhide' : '🙈 Hide',
      onClick: async () => {
        els.libraryStatus.textContent = '';
        try {
          if (hidden) {
            await unhidePuzzleInLibrary(entry.id);
            hiddenPuzzles.delete(entry.id);
          } else {
            await hidePuzzleInLibrary(entry.id);
            hiddenPuzzles.add(entry.id);
          }
          // Same "re-run the filters" pattern as rename above — and the only way a hidden row
          // actually disappears from view when "Show hidden puzzles" is off, since that
          // exclusion happens in applyLibraryFilters, not here.
          applyLibraryFilters();
        } catch (err) {
          console.warn(`${hidden ? 'unhidePuzzleInLibrary' : 'hidePuzzleInLibrary'} failed:`, err);
          els.libraryStatus.textContent = `Couldn't ${hideLabel.toLowerCase()} — ${err?.message || 'try again.'}`;
        }
      },
    });

    const menuTrigger = document.createElement('button');
    menuTrigger.className = 'btn btn--icon library-row__menu-trigger';
    menuTrigger.type = 'button';
    menuTrigger.setAttribute('aria-haspopup', 'true');
    menuTrigger.setAttribute('aria-expanded', 'false');
    menuTrigger.setAttribute('aria-label', 'More actions');
    menuTrigger.setAttribute('data-tooltip', 'More actions');
    menuTrigger.textContent = '⋮';
    attachTooltip(menuTrigger);
    menuTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpenForThis = rowMenuOpenTrigger === menuTrigger;
      closeRowMenu();
      if (!wasOpenForThis) openRowMenu(menuTrigger, menuItems);
    });
    li.appendChild(menuTrigger);

    els.libraryList.appendChild(li);
  }
}

// Re-fetches everything the library modal needs (saved puzzles, solved-puzzle tracking, and
// the signed-in uid) and re-renders. Built-in puzzles are always shown even if the Firestore
// fetch fails (offline, rules not deployed) — they're static local data, not something a
// network hiccup should hide.
async function refreshLibraryList() {
  els.libraryStatus.textContent = 'Loading…';
  els.libraryList.innerHTML = '';

  let saved = [];
  let fetchError = null;
  try {
    saved = await fetchLibraryPuzzles();
  } catch (err) {
    console.warn('fetchLibraryPuzzles failed:', err);
    fetchError = err;
  }

  // Anonymous sign-in only (no UI, no prompt) — needed for "is this my own puzzle" (rename
  // affordance), the solved-puzzle/in-progress lookups, and now the hidden-puzzle lookup
  // (hide-a-puzzle item — see TODO.md); browsing/reading the library itself is public and
  // doesn't require it (see firestore.rules).
  const [user, solvedPuzzles, inProgressPuzzles, hiddenPuzzles, globalFastestTimes] = await Promise.all([
    ensureSignedIn().catch(() => null),
    fetchSolvedPuzzles().catch(() => new Map()),
    fetchInProgressPuzzles().catch(() => new Map()),
    fetchHiddenPuzzles().catch(() => new Set()),
    fetchGlobalFastestTimes().catch(() => new Map()),
  ]);

  const merged = builtinLibraryEntries().concat(saved.map((p) => ({ ...p, builtin: false })));
  merged.forEach((e, i) => {
    e.displayIndex = i + 1;
  });

  libraryEntriesCache = merged;
  solvedPuzzlesCache = solvedPuzzles;
  inProgressPuzzlesCache = inProgressPuzzles;
  hiddenPuzzlesCache = hiddenPuzzles;
  globalFastestTimesCache = globalFastestTimes;
  libraryMyUid = user?.uid ?? null;
  populateLibrarySizeFilter(merged);

  els.libraryStatus.textContent = fetchError
    ? "Couldn't load community-saved puzzles (offline or not deployed yet) — showing built-in puzzles only."
    : '';
  applyLibraryFilters();
}

// Applies the Solved/Unsolved/Incomplete and Size filters to the cached merged list and
// re-renders — doesn't re-fetch, so switching a filter is instant. "Incomplete" (saved/
// incomplete-progress item — see TODO.md) is a strict subset of "unsolved" — a puzzle can be
// unsolved with nothing saved yet — so it's its own value alongside solved/unsolved, not a
// modifier on top of them.
function applyLibraryFilters() {
  const solvedFilter = els.libraryFilterSolved.value;
  const sizeFilter = els.libraryFilterSize.value;
  const showHidden = els.libraryFilterShowHidden.checked;
  let filtered = libraryEntriesCache;
  // Hide-a-puzzle item (see TODO.md): excluded by default, same "off unless explicitly asked
  // for" default every other filter here uses. Checked first, ahead of the other two filters,
  // since it's a visibility gate rather than a narrowing choice like they are — a hidden
  // puzzle should never appear just because it also happens to match Solved/Size.
  if (!showHidden) filtered = filtered.filter((e) => !hiddenPuzzlesCache.has(e.id));
  if (solvedFilter === 'solved') filtered = filtered.filter((e) => solvedPuzzlesCache.has(e.id));
  else if (solvedFilter === 'unsolved') filtered = filtered.filter((e) => !solvedPuzzlesCache.has(e.id));
  // Excludes an already-solved puzzle even if it also has a stale in-progress save (e.g. one
  // solved before this feature existed, then later re-opened and saved mid-replay without
  // re-solving it) — matches renderLibraryList's own solved-takes-priority display rule
  // (see its comment) so a row never shows here only to render as "✓ Solved" once you look.
  else if (solvedFilter === 'incomplete') {
    filtered = filtered.filter((e) => inProgressPuzzlesCache.has(e.id) && !solvedPuzzlesCache.has(e.id));
  }
  if (sizeFilter !== 'all') filtered = filtered.filter((e) => `${e.rows}x${e.cols}` === sizeFilter);

  if (filtered.length === 0) {
    els.libraryList.innerHTML = '';
    els.libraryStatus.textContent = 'No puzzles match these filters.';
    return;
  }
  els.libraryStatus.textContent = '';
  renderLibraryList(filtered, solvedPuzzlesCache, inProgressPuzzlesCache, hiddenPuzzlesCache, libraryMyUid, globalFastestTimesCache);
}

els.libraryFilterSolved.addEventListener('change', applyLibraryFilters);
els.libraryFilterSize.addEventListener('change', applyLibraryFilters);
els.libraryFilterShowHidden.addEventListener('change', applyLibraryFilters);

// Auto-save trigger #2 (see TODO.md's saved/incomplete-progress item): opening the library
// modal is "exiting the current puzzle back to the library". The modal itself opens
// immediately for responsiveness (refreshLibraryList already shows its own "Loading…" while
// it fetches), but the save is awaited BEFORE that fetch starts, not fire-and-forget like
// maybeShowCompletion's cleanup calls — otherwise this puzzle's own just-triggered save could
// race fetchInProgressPuzzles and the library could open not yet reflecting it.
els.btnOpenLibrary.addEventListener('click', async () => {
  els.libraryModal.classList.remove('hidden');
  els.libraryStatus.textContent = 'Loading…';
  await saveProgressIfApplicable().catch(() => {});
  refreshLibraryList();
});

els.btnLibraryClose.addEventListener('click', () => {
  els.libraryModal.classList.add('hidden');
});

// "Restart" — renamed from "Clear all" (UI/branding polish round, see TODO.md). Wipes the
// board, move history, hints-used count, and elapsed time back to this attempt's starting
// state — not just the marks, which is all the old "Clear all" name implied. Still asks for
// confirmation first (via showConfirm, not window.confirm — see that function's comment for
// why), since it's still irreversible.
//
// Re-invoking startPuzzle(puzzle) already zeroes hints-used and elapsed time for free (both
// are derived fresh — see computeCompletionStats and puzzleStartTime — not carried on the
// puzzle object), so a plain re-init is enough EXCEPT for a resumed in-progress puzzle (see
// TODO.md's saved/incomplete-progress item): `puzzle.resumed` carries an `initialMarks` +
// `resumeElapsedMs`/`resumeHintsUsed` baseline from the save it was loaded from, and a plain
// startPuzzle(puzzle) would re-seed right back to THAT saved snapshot rather than truly
// blank — correct for "restart this session" in general (see startPuzzle's own comment on
// why a scan's initialMarks is deliberately preserved across a restart the same way), but
// not what "as if starting the attempt over from scratch" means for a resumed puzzle
// specifically: the player is intentionally abandoning saved progress, not just this
// session's changes on top of it. So this one case strips the resume baseline first and
// deletes the stale save (a restart wouldn't leave a phantom "Incomplete" library entry for
// progress that no longer exists anywhere).
els.menuRestart.addEventListener('click', async () => {
  closeHelpMenu();
  if (!(await showConfirm(
    "Restart this puzzle from scratch? This clears your marks, hints used, and elapsed time — it can't be undone."
  ))) return;
  // Clear any saved in-progress state for THIS puzzle regardless of which branch below runs
  // — not just the resumed case. An explicit "Save progress" click (or an earlier
  // auto-save) could have saved THIS SAME session before the player decided to restart it;
  // leaving that save in place would let a later "Resume" silently undo the restart by
  // loading the pre-restart snapshot back in. Fire-and-forget, same contract as every other
  // progress-save cleanup call (see maybeShowCompletion).
  if (!hasUnstableId(puzzle)) deleteInProgressPuzzle(puzzle.id).catch(() => {});
  if (puzzle.resumed) {
    const { initialMarks, resumeElapsedMs, resumeHintsUsed, resumed, ...fresh } = puzzle;
    startPuzzle(fresh);
  } else {
    startPuzzle(puzzle);
  }
});

// ---- "All games" (UI/branding polish round — see TODO.md): navigate back to the game-hub
// launcher, with the same in-page confirm pattern as every other destructive/navigating
// action here (see showConfirm's own comment for why not window.confirm). Saves progress
// first (same as opening the library — see btnOpenLibrary above) since leaving the app
// entirely is exactly the kind of exit a lost-progress save is meant to catch. ----
const GAME_HUB_URL = 'https://dansgamehub.netlify.app/';
els.menuAllGames.addEventListener('click', async () => {
  closeHelpMenu();
  if (!(await showConfirm('Leave this puzzle and go back to All games?'))) return;
  await saveProgressIfApplicable().catch(() => {});
  window.location.href = GAME_HUB_URL;
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

els.btnOpenStats.addEventListener('click', () => {
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
startPuzzle(SAMPLE_PUZZLES[0]);
// Current Objective (see TODO.md): the app-wide "screen moves up and down for no reason on
// iOS" report turned out NOT to be about extra scrollable space (the scrollbar itself was
// fine whenever real content needed one, per the project owner directly) — it's iOS Safari's
// chrome (address bar + bottom toolbar) collapsing/expanding in response to perfectly
// ordinary scrolling, which changes `visualViewport.height`/`window.innerHeight` by roughly
// 40-100px with nothing the player did warranting a re-layout. Both listeners below used to
// call fitBoardToViewport on EVERY one of those, and fitBoardToViewport recomputes
// `--cell-size` off the current viewport height AND the board's current on-screen position
// (`rootRect.top`, itself dependent on scroll position) — a routine chrome-collapse blip could
// therefore nudge the board's rendered size by a px, changing the page's total height, which
// iOS can react to by adjusting scroll position to compensate: a small feedback loop that
// reads to a player as the screen moving on its own, with nothing on screen actually
// warranting it. handleViewportResize filters this out by ignoring viewport-height changes
// too small to be a real keyboard open/close (a real iPhone keyboard changes the visual
// viewport by 250-350px, comfortably clearing the threshold below) — a genuine keyboard
// event, desktop window resize, or device rotation still re-fits the board; routine chrome
// noise no longer does.
const VIEWPORT_CHANGE_THRESHOLD_PX = 120;

function handleViewportResize() {
  const currentHeight = window.visualViewport?.height ?? window.innerHeight;
  if (lastFitViewportHeight !== null && Math.abs(currentHeight - lastFitViewportHeight) < VIEWPORT_CHANGE_THRESHOLD_PX) {
    return; // routine iOS chrome show/hide, not a real reason to re-lay-out the board
  }
  fitBoardToViewport();
}

window.addEventListener('resize', debounce(handleViewportResize, 100));
// A real device rotation is an unambiguous, intentional viewport change — always re-fit,
// unfiltered by the threshold above (unlike ordinary resize/visualViewport noise, this event
// only ever fires for a genuine orientation change).
window.addEventListener('orientationchange', () => setTimeout(fitBoardToViewport, 50));
// iOS scroll regression, "keyboard" symptom (see TODO.md): the on-screen keyboard opening
// shrinks the VISUAL viewport but does not reliably fire a plain `window` 'resize' event on
// iOS Safari, so fitBoardToViewport (which reads window.innerHeight — the LAYOUT viewport,
// unaffected by the keyboard either way) could stay sized for the pre-keyboard viewport.
// visualViewport's own 'resize' event is the one iOS actually fires for this — also the one
// that fires constantly for routine chrome show/hide, which is exactly why it goes through
// the same handleViewportResize threshold filter above rather than calling
// fitBoardToViewport directly.
window.visualViewport?.addEventListener('resize', debounce(handleViewportResize, 100));

// ---- iOS keyboard-close residual viewport pan fix (Current Objective — see TODO.md) ----
//
// Root cause CONFIRMED via real on-device `?debug=scroll` history (see TODO.md), not guessed:
// iOS Safari pans the *visual* viewport to keep a focused input clear of the on-screen
// keyboard, then doesn't always fully reverse that pan. Round 1's real capture showed this
// with NOTHING focused: the pan opened by 408px, closing only reversed 329px of it, leaving
// `visualViewport.offsetTop` stuck at a residual 79px a full second after focus was gone
// entirely — it does not self-correct given time. This is a well-known iOS Safari quirk, not
// a sizing bug in this app's own CSS/JS — fitBoardToViewport was confirmed correct throughout
// the same repro, so this fix deliberately doesn't touch it.
//
// A SECOND real capture (Current Objective follow-up #1, see TODO.md) showed the same "stuck,
// stale pan" symptom can also happen WHILE an input is still focused — switching directly from
// one field to another without the keyboard ever fully closing left the pan sized for the
// field that was focused a moment ago, not the one that's focused now:
//   focusin #scan-known-rows-input — offsetTop=0
//   resize (keyboard opens) — offsetTop=408
//   focusout #scan-known-rows-input — offsetTop=408 (unchanged)
//   focusin #scan-known-cols-input — offsetTop=408 (unchanged, keyboard stays open)
//   resize (likely keyboard) — offsetTop=79 — active STILL #scan-known-cols-input
// Round 1's fix explicitly bailed out whenever *anything* was focused, on the assumption that
// a focused field's pan is presumably legitimate — this capture disproves that assumption, so
// blindly widening round 1's condition to "correct even while focused" isn't safe either: a
// genuinely-focused field's pan IS legitimate, and re-zeroing it with `scrollTo` would just
// hide that field behind the keyboard instead of fixing anything (the project owner's own
// framing of the risk here).
//
// The fix below checks the actual geometry instead of trusting focus state as a proxy: is the
// element that's ACTUALLY focused right now still fully inside what the current pan+height say
// is visible? If yes, the pan is still doing its job — leave it. If no (stale, sized for a
// field that no longer has focus, or simply never updated for this one), correct it — but with
// `scrollIntoView` on the real focused element rather than a blind `scrollTo`, so the
// correction re-derives the pan a currently-focused field actually needs instead of erasing it.
function correctResidualViewportPan() {
  const vv = window.visualViewport;
  if (!vv || vv.offsetTop === 0) return;
  const active = document.activeElement;
  const activeIsTextInput = active && /^(input|textarea)$/i.test(active.tagName || '');
  if (!activeIsTextInput) {
    // Nothing focused at all: no legitimate reason for a nonzero pan to exist — round 1's
    // original, unconditional re-zero is exactly right here.
    window.scrollTo(window.scrollX, window.scrollY);
    return;
  }
  // Something is focused, so *some* pan may be legitimate — check whether it's still correct
  // for the field that actually has focus right now, rather than assuming focus alone proves it.
  const rect = active.getBoundingClientRect();
  const visibleTop = rect.top - vv.offsetTop;
  const visibleBottom = rect.bottom - vv.offsetTop;
  if (visibleTop >= 0 && visibleBottom <= vv.height) return; // pan still keeps this field visible — leave it
  active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---- Current Objective, round 4 — the OTHER stuck variable (see TODO.md) ----
//
// Two real on-device `?debug=scroll` captures, taken at different points in the same bug's
// timeline, overturned the diagnosis every round above was built on: `correctResidualViewportPan`
// targets a stuck PAN (`visualViewport.offsetTop`/`pageTop`/`window.scrollTo`) — and a real
// capture confirmed that mechanism genuinely works (offsetTop back at 0, the poll having fired
// 5000+ times) — but a SEPARATE, later capture in the same stuck session still showed a 79px
// gap specifically between `visualViewport.height` (969) and `window.innerHeight` (1048), with
// the pan already at 0. An earlier-in-time capture shows both heights shrinking TOGETHER at
// onset, alongside the genuinely-stuck pan — but only `window.innerHeight` ever rejoins its true
// value; `visualViewport.height` stays permanently stuck at the shrunk figure even after
// everything else (pan, `window.innerHeight`) has recovered. `window.scrollTo`/CSS can only ever
// move scroll *position* — it was never capable of touching this variable, which is exactly why
// five straight rounds of pan/trigger refinement made no visible difference on real hardware.
//
// Round 4's fix (real-device DISPROVEN — see TODO.md for the full before/after capture):
// toggling `display:none` -> reflow -> `display:''` on the page root was a documented
// workaround for *some* WebKit stuck-viewport bugs, but a real on-device capture (pressing
// the manual "Force heal viewport height now" debug button, before/immediately-after/150ms
// readings) proved it only recomputes `window.innerHeight` — `visualViewport.height` itself
// stayed frozen at the stuck value in both readings, 79px gap unchanged. A layout reflow
// recomputes the LAYOUT viewport; `visualViewport` isn't part of the layout tree at all, so
// there was never a mechanism by which that trick could have touched it.
//
// Round 5 (genuinely different technique, per the explicit instruction not to keep tweaking
// round 4's): `visualViewport`'s dimensions are derived from the page's viewport meta-tag
// CONSTRAINTS (width=device-width, initial-scale, etc.), recomputed by WebKit whenever it
// re-parses that tag — not from anything in the DOM layout tree. Forcing a re-parse by
// mutating the `<meta name="viewport">` element's `content` attribute and then restoring it
// is a separately, widely documented workaround for this exact class of "visualViewport
// dimensions stuck after the on-screen keyboard closes" WebKit bug (distinct from the
// layout-reflow trick round 4 tried, and targeting the actual subsystem visualViewport comes
// from instead of hoping a layout pass happens to touch it too). Appending a harmless extra
// token (rather than writing the identical string back) is deliberate — WebKit's own
// attribute-change detection can no-op a set-to-the-same-value write.
//
// Trigger condition and threshold are unchanged from round 4 (still correctly scoped: don't
// touch this while a field is focused, still comparing against the confirmed-reliable
// window.innerHeight reference) — only the actual recompute mechanism changed.
const STUCK_HEIGHT_THRESHOLD_PX = 40; // comfortably below the confirmed real 79px gap, above ordinary desktop scrollbar/zoom noise
function healStuckViewportHeight() {
  const vv = window.visualViewport;
  if (!vv) return;
  const active = document.activeElement;
  if (active && /^(input|textarea)$/i.test(active.tagName || '')) return; // don't blur a field the player is using
  const gap = window.innerHeight - vv.height;
  if (gap < STUCK_HEIGHT_THRESHOLD_PX) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const original = meta.getAttribute('content');
    meta.setAttribute('content', `${original}, minimum-scale=1`);
    void document.documentElement.offsetHeight; // force WebKit to act on the change before restoring it
    meta.setAttribute('content', original);
  }
  fitBoardToViewport();
}

// focusout is the authoritative "an input just lost focus" signal. The real timeline above
// shows the keyboard-close resize/pan and the resulting stuck offsetTop both land BEFORE
// focusout fires, and stay stuck at least a second after — so a short delay here (letting iOS
// finish its close animation) is enough; there's no reason to wait longer.
document.addEventListener('focusout', (e) => {
  if (!/^(input|textarea)$/i.test(e.target?.tagName || '')) return;
  setTimeout(() => {
    correctResidualViewportPan();
    healStuckViewportHeight();
  }, 100);
});
// Current Objective follow-up #1: also re-check shortly after a field GAINS focus, not only
// after one loses it — the second capture's repro (switching directly between two fields while
// the keyboard stays open throughout) never produces a "focus lost, nothing new focused"
// moment at all, so a focusout-only listener can't ever catch it.
document.addEventListener('focusin', (e) => {
  if (!/^(input|textarea)$/i.test(e.target?.tagName || '')) return;
  setTimeout(() => {
    correctResidualViewportPan();
    healStuckViewportHeight();
  }, 100);
});
// Belt-and-suspenders: also re-check on every visualViewport resize (which includes the one
// accompanying keyboard close, height growing back toward window.innerHeight) in case focusout
// doesn't fire for some reason — e.g. focus cleared programmatically rather than by the player
// dismissing the keyboard by hand.
window.visualViewport?.addEventListener(
  'resize',
  debounce(() => {
    correctResidualViewportPan();
    healStuckViewportHeight();
  }, 150)
);

// Round 3 (see TODO.md): a REAL on-device `?debug=scroll` capture showed the pan getting stuck
// at offsetTop=79 and then staying stuck through 54+ seconds, a full scan-wizard close, and a
// screen navigation — none of which are a `focusout`/`focusin`/visualViewport `resize`, the only
// three events round 1 and round 2 re-check on. That's a coverage gap in *which events trigger a
// check*, not a flaw in correctResidualViewportPan's own logic (confirmed: the capture's "nothing
// focused, offsetTop stuck nonzero" state is exactly the case the function already handles via
// its unconditional `scrollTo` branch above — it simply never got invoked again because no
// covered event fired). Rather than keep chasing individual triggers one at a time, add a
// low-frequency idle poll as a backstop: correctResidualViewportPan is a couple of cheap property
// reads and returns immediately whenever offsetTop is already 0 (the common case), so polling a
// few times a second costs effectively nothing but closes the gap regardless of what transition
// (or lack of one) caused the stuck state.
//
// Round 3 real-device verification (see TODO.md): this made ZERO observable difference — "doing
// the exact same thing" as before the poll existed. Since the poll closes the exact trigger-
// coverage gap round 2 diagnosed, a continued total failure points at `correctResidualViewportPan`
// itself (specifically its `window.scrollTo` branch) possibly not working on this device/iOS
// version at all, not at when it runs. Two counters below exist purely to let `?debug=scroll`
// confirm the poll is actually executing on the real device (TODO.md's "cheap complementary
// check") independently of the separate manual-force test (initScrollDiagnostics, below) that
// isolates whether the correction itself is effective once invoked.
let scrollPollCount = 0;
let scrollLastPollAt = null;
setInterval(() => {
  scrollPollCount++;
  scrollLastPollAt = new Date();
  correctResidualViewportPan();
  healStuckViewportHeight(); // round 4 (see TODO.md) — same idle-poll backstop, other variable
}, 400);

// ---- Current Objective #2: a focused text input should never fight the player's own scroll
// gesture (see TODO.md) ----
//
// Direct complaint, e.g. in the scan wizard's correction step: "if I try to scroll the row
// edit with the cursor in it it would force it back on the screen." The mechanism is the
// pan-correction machinery just above (`correctResidualViewportPan`, re-run on focus events,
// visualViewport resize, and the 400ms poll): while a text input is focused and iOS's
// keyboard-avoidance pan is still active, ordinary page scroll moves that field outside what
// the current pan considers "visible," and the very next re-check snaps it back with
// `scrollIntoView` — fighting the scroll the player just made on purpose.
//
// Deliberately scoped narrowly, per the project owner's framing: this isn't an attempt to
// solve the main scroll-pan mystery (see TODO.md's Current Objective #3, not this round's
// focus) — it just stops a focused field from being defended against a deliberate scroll.
// Blurring the field as soon as a genuine scroll gesture starts removes the "keep this field
// visible" goal entirely, so there's nothing left for the poll/resize/focus re-checks above to
// fight the gesture over; `correctResidualViewportPan`'s own nothing-focused branch may still
// run afterward, but that branch only re-zeroes the pan, it doesn't aim at any particular
// field, so it can't yank the scroll back toward one.
//
// `e.target` is checked against the focused element so that touch-dragging *inside* the field
// itself (placing the cursor, extending a text selection) isn't mistaken for a scroll-away
// gesture and doesn't blur the field out from under the player mid-edit.
function blurFocusedTextInputOnScrollGesture(e) {
  const active = document.activeElement;
  if (!active || !/^(input|textarea)$/i.test(active.tagName || '')) return;
  if (active.contains(e.target)) return;
  active.blur();
}
document.addEventListener('touchmove', blurFocusedTextInputOnScrollGesture, { passive: true });
document.addEventListener('wheel', blurFocusedTextInputOnScrollGesture, { passive: true });

// ---- Current Objective #2 (bug-fix history, see TODO.md): keep the player-facing explain
// panel visible through the same stuck-pan state ----
//
// `.explain-panel` is `position: fixed; bottom: 0`, which iOS Safari pins to the LAYOUT
// viewport, not the visual one. During/after a keyboard interaction — including the stuck-pan
// state above, in whatever window before correctResidualViewportPan catches it — a lingering
// pan can push the actually-visible area up past this element's fixed position, making it
// disappear off the bottom of the screen. Confirmed by the project owner as the same class of
// issue the scroll-diagnostics tool's own floating button/panel already got a defensive fix
// for (see initScrollDiagnostics' pinToVisualViewport below, gated behind `?debug=scroll`) —
// that treatment was never applied to this real player-facing panel. Applied here
// unconditionally (not gated behind the debug flag) as a safety net ALONGSIDE, not instead of,
// the pan-correction fix above: that fix should stop the stuck pan from occurring at all, but
// this panel shouldn't be vulnerable to vanishing even if some residual pan slips through first.
(function pinExplainPanelToVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  function reposition() {
    const bottomGap = window.innerHeight - (vv.height + vv.offsetTop);
    els.explainPanel.style.transform = bottomGap > 0 ? `translateY(-${bottomGap}px)` : '';
  }
  vv.addEventListener('resize', reposition);
  vv.addEventListener('scroll', reposition);
  reposition();
})();

// ---- scroll diagnostics (Current Objective — see TODO.md) ----
//
// The app-wide iOS scroll regression has now failed real-device verification twice, on a bug
// class this project's own history says resists incremental CSS guessing (the original
// scan-wizard-specific scroll bug took four rounds). Per TODO.md's own recommended next step,
// this doesn't attempt a third blind CSS fix — it's a measurement tool, so the NEXT fix can be
// aimed at the real, on-device numbers instead of another guess. It answers exactly the
// question TODO.md poses: compare real `scrollHeight` against the real visible viewport height,
// and identify which element(s) are still contributing the extra (genuinely blank, per the
// project owner's report) scrollable space — per screen, on the real device where the bug
// actually reproduces (this project's own preview tooling can't reliably reproduce it).
//
// Round 3 (see TODO.md — the project owner tried this tool after the sharpened keyboard-
// specific repro but wasn't sure it had captured anything): the on-demand "tap for a
// snapshot" design has a real gap — it only shows whatever's true AT THE MOMENT OF THE TAP,
// so it can't distinguish "the bug produced no evidence" from "the player didn't tap during
// the ~seconds-wide window that mattered" (and per the bug's own description, that window is
// specifically right as/after the keyboard closes, easy to miss). Two changes address that
// directly, without guessing at the underlying fix:
//   1. An always-on rolling history (below) auto-captures a compact snapshot on every likely
//      keyboard-relevant signal (a real visualViewport resize, a visualViewport pan/scroll,
//      or a text input gaining/losing focus — the last one catches keyboard use even inside a
//      modal, which visualViewport size alone can't distinguish from routine iOS chrome
//      noise). Opening the panel any time after the bug happened now shows the actual
//      timeline through it, not just whatever's true right now.
//   2. The snapshot report now also captures `visualViewport.offsetTop`/`pageTop` — the pan
//      amount — which the original report never did. A live-device test with a *positive*
//      offsetTop that persists after the keyboard closes would point straight at a specific,
//      well-documented root cause (iOS panning the visual viewport to keep a focused input
//      clear of the keyboard, then failing to fully un-pan it) rather than requiring more
//      guessing. This is also exactly the failure mode that could explain the *second* open
//      question below (the button not reliably visible/tappable) as the SAME bug, not two.
//
// Separately (defensive, not a fix for the underlying bug): `position: fixed` elements on
// iOS Safari are pinned to the LAYOUT viewport, not the visual one — during/after a keyboard
// interaction, a naive bottom-anchored fixed element can render below whatever's actually
// visible. pinToVisualViewport() below counter-translates this button/panel by the visual
// viewport's own offset so they can't get stranded off-screen purely by this well-known
// mechanism, whether or not it turns out to be part of the real bug.
//
// Gated behind `?debug=scroll` in the URL rather than a normal Help-menu item: this is
// investigative instrumentation for the current bug, not a player-facing feature, and a
// floating button needs to stay reachable over every screen INCLUDING open modals (the scan
// wizard, stats/pairing, how-to-play) to satisfy TODO.md's "test across all screens" — none of
// which the normal Help dropdown stays reachable through, since modals sit above it. Safe to
// delete this whole section once the real fix, informed by a real report from this tool, ships
// and holds on real hardware.
function initScrollDiagnostics() {
  if (new URLSearchParams(location.search).get('debug') !== 'scroll') return;

  // Every top-level region with its own sizing/positioning logic implicated in past rounds of
  // this bug (see TODO.md): the fixed explain panel, the fixed board root, each modal overlay,
  // and the scan wizard's full-screen view. Labeled by what a report reader would recognize on
  // screen, not just the raw id, since this is meant to be read by the project owner directly
  // off their phone, not traced back through the source by someone who already knows it.
  const candidates = [
    ['page-root (whole page content)', els.pageRoot],
    ['board-root (puzzle grid)', els.boardRoot],
    ['explain-panel (bottom hint panel)', els.explainPanel],
    ['howtoplay-modal', els.howToPlayModal],
    ['complete-modal', els.completeModal],
    ['confirm-modal', els.confirmModal],
    ['stats-modal', els.statsModal],
    ['library-modal (puzzle library)', els.libraryModal],
    ['rename-modal (rename a puzzle)', els.renameModal],
    ['scan-modal (scan wizard)', els.scanModal],
    ['draw-modal (draw-a-puzzle wizard)', els.drawModal],
    ['help-menu-list (Help dropdown)', els.helpMenuList],
  ];

  // Short, readable identifier for the currently-focused element — id if it has one
  // (every real input in this app does), else tag+type, else "(none)". Used both in the
  // full snapshot and in each history-log line, since which input was focused is exactly
  // what turns a bare "keyboard opened" signal into an actionable repro step.
  function describeElement(el) {
    if (!el || el === document.body) return '(none)';
    if (el.id) return `#${el.id}`;
    return el.tagName ? el.tagName.toLowerCase() + (el.type ? `[type=${el.type}]` : '') : String(el);
  }

  function buildReport() {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const docScrollHeight = document.documentElement.scrollHeight;
    const bodyScrollHeight = document.body.scrollHeight;
    const excess = Math.max(docScrollHeight, bodyScrollHeight) - viewportHeight;

    const lines = [];
    lines.push(`${new Date().toLocaleTimeString()}`);
    lines.push(`visualViewport.height: ${window.visualViewport?.height ?? '(unavailable)'}`);
    lines.push(`window.innerHeight: ${window.innerHeight}`);
    // offsetTop/pageTop weren't captured before this round (see this function's header
    // comment) — a nonzero value that persists after the keyboard closes is the direct
    // signature of "iOS panned the visual viewport for the keyboard and didn't fully un-pan
    // it", one concrete, checkable explanation for whitespace that outlives the keyboard.
    lines.push(`visualViewport.offsetTop (pan from layout viewport top): ${window.visualViewport?.offsetTop ?? '(unavailable)'}`);
    lines.push(`visualViewport.pageTop (pan including document scroll): ${window.visualViewport?.pageTop ?? '(unavailable)'}`);
    lines.push(`visualViewport.scale: ${window.visualViewport?.scale ?? '(unavailable)'}`);
    lines.push(`document.documentElement.scrollHeight: ${docScrollHeight}`);
    lines.push(`document.body.scrollHeight: ${bodyScrollHeight}`);
    lines.push(`window.scrollY: ${window.scrollY}`);
    lines.push(`document.activeElement: ${describeElement(document.activeElement)}`);
    // Confirms whether the round-3 periodic poll is actually executing on THIS device at all
    // (see TODO.md's Current Objective) — a cheap check that's independent of, and a
    // prerequisite for interpreting, the manual "Force correct now" test below: if the poll
    // has never fired, its failure to fix the bug says nothing about whether the correction
    // itself works.
    lines.push(`Periodic poll (every 400ms): fired ${scrollPollCount} time(s) since page load; last fired ${scrollLastPollAt ? scrollLastPollAt.toLocaleTimeString() : '(never)'}`);
    lines.push(`EXCESS (scrollable beyond visible viewport): ${excess}px`);
    // Round 4 (see TODO.md): the OTHER stuck variable — a real capture showed this gap
    // persisting at 79px with the pan already confirmed back at 0, which is what pointed at
    // visualViewport.height (not the pan) as the actual bug. Surfaced as its own explicit
    // number here (the raw values above already show it, but not the derived gap itself) so a
    // real-device round can confirm at a glance whether healStuckViewportHeight is keeping it
    // near 0 or whether it's still climbing.
    lines.push(
      `window.innerHeight − visualViewport.height (round 4's stuck-height gap): ` +
      `${window.innerHeight - (window.visualViewport?.height ?? window.innerHeight)}px`
    );
    lines.push('');
    lines.push('Per-element (only currently-rendered ones shown; sorted worst offender first):');

    const rows = candidates
      .filter(([, el]) => el && getComputedStyle(el).display !== 'none')
      .map(([label, el]) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        // How far this element's own bottom edge sits past the visible viewport's bottom —
        // the direct, per-element version of the page-wide `excess` figure above. Fixed-
        // position elements aren't supposed to contribute to document scrollHeight at all
        // (see TODO.md's "genuinely blank" detail — precisely the discrepancy worth
        // surfacing if one of these has a positive overflowPx despite `position: fixed`).
        const overflowPx = Math.round(rect.bottom - viewportHeight);
        return { label, position: style.position, offsetHeight: el.offsetHeight, rectTop: Math.round(rect.top), rectBottom: Math.round(rect.bottom), overflowPx };
      })
      .sort((a, b) => b.overflowPx - a.overflowPx);

    for (const r of rows) {
      lines.push(
        `  ${r.label}: position=${r.position} offsetHeight=${r.offsetHeight} rect.top=${r.rectTop} ` +
        `rect.bottom=${r.rectBottom} overflowPastViewportBottom=${r.overflowPx}px`
      );
    }

    // Toolbar button geometry (round 3 — see TODO.md): round 2's "Puzzle library" height/
    // roundness fix was confirmed via a desktop-preview measurement (35.2px for all five
    // buttons) that then didn't hold on the real device — but the only real-device evidence
    // since has been a screenshot, an eyeball comparison, not a number. Reporting the actual
    // getBoundingClientRect/computed-style values for every toolbar .btn here closes that same
    // "screenshot vs. real numbers" gap this tool already closed for the scroll bug, off the
    // one debug view the project owner already knows to check.
    const toolbarEl = document.querySelector('.toolbar');
    const toolbarButtons = toolbarEl ? Array.from(toolbarEl.querySelectorAll('.btn')) : [];
    if (toolbarButtons.length) {
      lines.push('');
      lines.push('Toolbar buttons (round 3 — see TODO.md):');
      for (const btn of toolbarButtons) {
        const rect = btn.getBoundingClientRect();
        const style = getComputedStyle(btn);
        const label = describeElement(btn) + (btn.textContent.trim() ? ` "${btn.textContent.trim()}"` : '');
        lines.push(
          `  ${label}: offsetHeight=${btn.offsetHeight} rect.width=${Math.round(rect.width)} ` +
          `rect.height=${Math.round(rect.height)} borderRadius=${style.borderRadius} ` +
          `border=${style.borderWidth} padding=${style.padding} font=${style.fontSize}/${style.lineHeight}`
        );
      }
    }
    return lines.join('\n');
  }

  // ---- always-on history log (see this function's header comment for why) ----
  //
  // Capped so a long play session can't grow this unboundedly — old entries are dropped, not
  // the recent ones a real repro needs. Kept as plain strings (not objects re-rendered later)
  // so "Copy history" can just join it — the whole point is getting this off the device
  // verbatim, not building a UI around it.
  const HISTORY_MAX = 60;
  const history = [];
  let lastVisualViewportHeight = window.visualViewport?.height ?? window.innerHeight;

  function logHistory(trigger) {
    const vv = window.visualViewport;
    const line =
      `${new Date().toLocaleTimeString()} — ${trigger} — ` +
      `vv.height=${vv?.height ?? '?'} vv.offsetTop=${vv?.offsetTop ?? '?'} ` +
      `innerHeight=${window.innerHeight} scrollY=${window.scrollY} ` +
      `active=${describeElement(document.activeElement)}`;
    history.push(line);
    if (history.length > HISTORY_MAX) history.shift();
    // Cheap enough to keep live-updated even while the panel's hidden — no reason to defer
    // it to the next open, and it means a currently-open panel updates in real time too.
    historyPre.textContent = history.join('\n');
  }

  // Throttles the visualViewport 'scroll' (pan) listener, which can fire rapidly during
  // momentum scrolling — logging every single event would drown out the handful that
  // actually matter in noise.
  let lastScrollLog = 0;
  function onVisualViewportScroll() {
    const now = Date.now();
    if (now - lastScrollLog < 150) return;
    lastScrollLog = now;
    logHistory('visualViewport scroll (pan)');
  }

  function onVisualViewportResize() {
    const vv = window.visualViewport;
    const newHeight = vv?.height ?? window.innerHeight;
    const delta = newHeight - lastVisualViewportHeight;
    lastVisualViewportHeight = newHeight;
    // Same 120px heuristic app.js's own handleViewportResize uses to tell a real
    // keyboard open/close from routine iOS chrome noise — labeled here rather than
    // filtered, since for THIS tool seeing the noise too (correctly labeled) is useful
    // context, not clutter to hide.
    const label = Math.abs(delta) >= 120 ? 'visualViewport resize (likely keyboard)' : 'visualViewport resize (routine)';
    logHistory(`${label} Δ${delta > 0 ? '+' : ''}${delta}px`);
  }

  function onFocusIn(e) {
    if (!/^(input|textarea)$/i.test(e.target?.tagName || '')) return;
    logHistory(`focusin ${describeElement(e.target)}`);
  }
  function onFocusOut(e) {
    if (!/^(input|textarea)$/i.test(e.target?.tagName || '')) return;
    logHistory(`focusout ${describeElement(e.target)}`);
  }

  window.visualViewport?.addEventListener('resize', onVisualViewportResize);
  window.visualViewport?.addEventListener('scroll', onVisualViewportScroll);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  // ---- round 5 tooling extension: auto-log the height-diverged state itself (see TODO.md) ----
  //
  // Three separate real-device attempts in a row all happened to sample the pan-stuck (height
  // gap already 0) state, never the height-diverged one `healStuckViewportHeight` actually
  // exists to correct — manual timing kept missing the window, no matter how carefully the
  // project owner tried to catch it live. Rather than a fourth manual attempt, this makes a
  // miss impossible: the exact number `healStuckViewportHeight`'s own threshold gate watches
  // (`window.innerHeight − visualViewport.height`) is now auto-logged into this same history
  // the MOMENT it first crosses `STUCK_HEIGHT_THRESHOLD_PX` — no manual tap required. The
  // project owner can reproduce the bug normally, however long that takes, then check the
  // history log afterward for whether/when a crossing entry ever actually appears.
  //
  // Deliberately purely observational: this only calls logHistory, never
  // healStuckViewportHeight or anything else that would attempt a correction — it exists
  // solely to answer "did/when did the height-diverged state occur," independent of whether
  // any fix attempt is running, so it can't mask or be masked by one.
  //
  // Edge-triggered (armed/disarmed) rather than logged on every poll tick while the gap stays
  // over threshold: a stuck gap can plausibly persist across many ticks, and repeating the same
  // observation into a capped 60-line history on every tick would just push out genuinely
  // distinct events. Re-arms once the gap drops back under threshold, so a second, later
  // occurrence in the same page load still gets its own entry.
  let heightGapArmed = true;
  function checkStuckHeightGapObservation() {
    const vv = window.visualViewport;
    if (!vv) return;
    const gap = window.innerHeight - vv.height;
    if (gap >= STUCK_HEIGHT_THRESHOLD_PX) {
      if (!heightGapArmed) return; // already logged this occurrence — wait for it to clear
      heightGapArmed = false;
      logHistory(
        `HEIGHT GAP CROSSED THRESHOLD (auto-detected, observational only) — gap=${gap}px ` +
        `vv.height=${vv.height} innerHeight=${window.innerHeight} threshold=${STUCK_HEIGHT_THRESHOLD_PX}px`
      );
    } else {
      heightGapArmed = true; // gap cleared — re-arm so a later, separate crossing logs again
    }
  }
  // Same 400ms cadence as the app-wide correction poll (see correctResidualViewportPan's own
  // setInterval below), but this is its own independent interval — it must keep observing and
  // logging on its own schedule regardless of whether that poll (or healStuckViewportHeight
  // specifically) is running, gated, or itself mid-correction at any given tick.
  setInterval(checkStuckHeightGapObservation, 400);
  // Also check right on every visualViewport resize — the moment most likely to actually
  // produce a fresh crossing — so a crossing that happens to land between two 400ms poll ticks
  // still gets caught as close to the moment it happened as possible.
  window.visualViewport?.addEventListener('resize', checkStuckHeightGapObservation);

  // ---- keeping the button/panel visible through a keyboard interaction (defensive; see
  // this function's header comment) ----
  function pinToVisualViewport(el) {
    function reposition() {
      const vv = window.visualViewport;
      if (!vv) return;
      // Gap between the LAYOUT viewport's bottom (what a plain `position: fixed; bottom` is
      // pinned to on iOS Safari) and the VISUAL viewport's actual visible bottom edge —
      // positive whenever the keyboard (or a lingering, not-yet-reverted pan) is hiding part
      // of the layout viewport. Counter-translating upward by that gap keeps this element
      // inside whatever's really on screen either way.
      const bottomGap = window.innerHeight - (vv.height + vv.offsetTop);
      el.style.transform = bottomGap > 0 ? `translateY(-${bottomGap}px)` : '';
    }
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    reposition();
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'scroll-diag-btn';
  btn.textContent = '📏';
  btn.setAttribute('aria-label', 'Scroll diagnostics');
  document.body.appendChild(btn);
  pinToVisualViewport(btn);

  const panel = document.createElement('div');
  panel.className = 'scroll-diag-panel hidden';

  const snapshotHeading = document.createElement('h3');
  snapshotHeading.className = 'scroll-diag-panel__heading';
  snapshotHeading.textContent = 'Live snapshot (as of last tap)';
  const pre = document.createElement('pre');
  pre.className = 'scroll-diag-panel__text';

  const historyHeading = document.createElement('h3');
  historyHeading.className = 'scroll-diag-panel__heading';
  historyHeading.textContent = 'Auto-captured history (this page load, oldest first)';
  const historyPre = document.createElement('pre');
  historyPre.className = 'scroll-diag-panel__text';

  const actions = document.createElement('div');
  actions.className = 'scroll-diag-panel__actions';
  // Current Objective (see TODO.md): round 3's poll made zero observable difference on the
  // real device despite closing the trigger-coverage gap round 2 diagnosed — which points at
  // the correction itself (`correctResidualViewportPan`'s `window.scrollTo` branch) possibly
  // not working on this device, not at when it runs. This button isolates that: it calls the
  // *exact same* correction function on demand, so the project owner can reproduce the stuck
  // pan, tap it, and read directly off the device whether `offsetTop` actually changes at all —
  // rather than inferring it indirectly from whether the whole bug looks fixed.
  const forceBtn = document.createElement('button');
  forceBtn.type = 'button';
  forceBtn.className = 'btn';
  forceBtn.textContent = 'Force correct now';
  // Round 4 (see TODO.md): same isolation idea as forceBtn above, for the OTHER stuck
  // variable — calls healStuckViewportHeight on demand so the project owner can reproduce the
  // stuck-shrunk height, tap it, and read directly whether visualViewport.height actually
  // recovers, independent of whether the pan fix (forceBtn) looks like it worked.
  const forceHealBtn = document.createElement('button');
  forceHealBtn.type = 'button';
  forceHealBtn.className = 'btn';
  forceHealBtn.textContent = 'Force heal viewport height now';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy snapshot';
  const copyHistoryBtn = document.createElement('button');
  copyHistoryBtn.type = 'button';
  copyHistoryBtn.className = 'btn';
  copyHistoryBtn.textContent = 'Copy history';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--primary';
  closeBtn.textContent = 'Close';
  actions.append(forceBtn, forceHealBtn, copyBtn, copyHistoryBtn, closeBtn);
  panel.append(snapshotHeading, pre, historyHeading, historyPre, actions);
  document.body.appendChild(panel);
  pinToVisualViewport(panel);

  function copyText(text, button, idleLabel) {
    navigator.clipboard?.writeText(text).then(
      () => { button.textContent = 'Copied!'; setTimeout(() => { button.textContent = idleLabel; }, 1500); },
      () => { button.textContent = 'Copy failed — select text manually'; }
    );
  }
  // Records offsetTop immediately before and immediately after calling the correction, plus a
  // follow-up read a moment later (scrollTo's effect isn't guaranteed to land on the same tick
  // on iOS) — both go straight into the history log and the button's own label, so "does the
  // number actually change" is answered directly on the device, no console/inspector needed.
  forceBtn.addEventListener('click', () => {
    const vv = window.visualViewport;
    const before = vv?.offsetTop ?? '(unavailable)';
    const activeAt = describeElement(document.activeElement);
    correctResidualViewportPan();
    const afterImmediate = vv?.offsetTop ?? '(unavailable)';
    logHistory(`MANUAL FORCE — offsetTop before=${before} immediately-after=${afterImmediate} (active=${activeAt})`);
    forceBtn.textContent = `Forced: ${before} → ${afterImmediate}`;
    pre.textContent = buildReport();
    setTimeout(() => {
      const afterDelay = vv?.offsetTop ?? '(unavailable)';
      logHistory(`MANUAL FORCE follow-up (150ms later) — offsetTop=${afterDelay}`);
      forceBtn.textContent = `Forced: ${before} → ${afterImmediate} (150ms: ${afterDelay})`;
      pre.textContent = buildReport();
      setTimeout(() => { forceBtn.textContent = 'Force correct now'; }, 2500);
    }, 150);
  });
  // Same before/immediately-after/150ms-later logging pattern as forceBtn, reading
  // visualViewport.height instead of offsetTop — this is the number the viewport-meta
  // re-parse trick (healStuckViewportHeight, round 5 — see its own comment) targets, not
  // the pan. This same button/logging is what caught round 4's technique not working in the
  // first place — no new debug tooling needed to check round 5 the same way.
  forceHealBtn.addEventListener('click', () => {
    const vv = window.visualViewport;
    const before = vv?.height ?? '(unavailable)';
    healStuckViewportHeight();
    const afterImmediate = vv?.height ?? '(unavailable)';
    logHistory(`MANUAL HEAL — visualViewport.height before=${before} immediately-after=${afterImmediate}`);
    forceHealBtn.textContent = `Healed: ${before} → ${afterImmediate}`;
    pre.textContent = buildReport();
    setTimeout(() => {
      const afterDelay = vv?.height ?? '(unavailable)';
      logHistory(`MANUAL HEAL follow-up (150ms later) — visualViewport.height=${afterDelay}`);
      forceHealBtn.textContent = `Healed: ${before} → ${afterImmediate} (150ms: ${afterDelay})`;
      pre.textContent = buildReport();
      setTimeout(() => { forceHealBtn.textContent = 'Force heal viewport height now'; }, 2500);
    }, 150);
  });
  copyBtn.addEventListener('click', () => copyText(pre.textContent, copyBtn, 'Copy snapshot'));
  copyHistoryBtn.addEventListener('click', () => copyText(historyPre.textContent, copyHistoryBtn, 'Copy history'));
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  btn.addEventListener('click', () => {
    pre.textContent = buildReport();
    historyPre.textContent = history.length ? history.join('\n') : '(nothing captured yet this page load)';
    panel.classList.remove('hidden');
  });

  // Seed one history entry immediately so a report opened right after page load isn't empty,
  // and so the very first real resize/focus event has a baseline to diff against.
  logHistory('page load');
}
initScrollDiagnostics();
