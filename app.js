// UI wiring for the full puzzle experience (build-order item 7). Plain ES modules, no
// bundler — matches the project's existing static-site pattern. All the actual logic
// (solving, hints, mistake-checking) lives in src/*; this file only renders the board and
// dispatches user actions to those modules.

import { Board, UNKNOWN, FILLED, EMPTY, isLineSatisfied, isLineLocked } from './src/model.js';
import { getNextHint } from './src/solver.js';
import { findContradictionHint } from './src/contradiction.js';
import { isLineConsistent, anchoredClueNumbers } from './src/lineSolver.js';
import { phraseDeduction } from './src/hintPhrasing.js';
import { autoCheckMark, checkForMistakes, removeBadMarks } from './src/mistakes.js';
import { SAMPLE_PUZZLES } from './src/puzzles.js';
import { playSound, isMuted, toggleMuted, onDragSweepCell, startDragSweep, stopDragSweep } from './src/sounds.js';
import { recordCompletion, fetchAllStats, generatePairingCode, redeemPairingCode } from './src/stats.js';
import { initScanWizard } from './src/scanUI.js';
import { fetchLibraryPuzzles, loadLibraryPuzzle, renamePuzzleInLibrary } from './src/puzzleLibrary.js';
import { ensureSignedIn } from './src/firebase.js';

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
  pageRoot: document.getElementById('page-root'),
  explainPanel: document.getElementById('explain-panel'),
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
  menuLibrary: document.getElementById('menu-library'),
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
  scanKnownRowsInput: document.getElementById('scan-known-rows-input'),
  scanKnownColsInput: document.getElementById('scan-known-cols-input'),
  scanBtnConfirmGrid: document.getElementById('scan-btn-confirm-grid'),
  scanGridConfirm: document.getElementById('scan-grid-confirm'),
  scanRowsInput: document.getElementById('scan-rows-input'),
  scanColsInput: document.getElementById('scan-cols-input'),
  scanKnownCountMismatch: document.getElementById('scan-known-count-mismatch'),
  scanBtnScanClues: document.getElementById('scan-btn-scan-clues'),
  scanOcrStatus: document.getElementById('scan-ocr-status'),
  scanRowClueList: document.getElementById('scan-row-clue-list'),
  scanColClueList: document.getElementById('scan-col-clue-list'),
  scanRecheckWarning: document.getElementById('scan-recheck-warning'),
  scanBuildError: document.getElementById('scan-build-error'),
  scanBtnBuild: document.getElementById('scan-btn-build'),
  scanFillstateGrid: document.getElementById('scan-fillstate-grid'),
  scanBtnConfirmState: document.getElementById('scan-btn-confirm-state'),
  scanBtnPlay: document.getElementById('scan-btn-play'),
  scanBtnCancel: document.getElementById('scan-btn-cancel'),
  scanLibraryTitleInput: document.getElementById('scan-library-title-input'),
  scanBtnSaveLibrary: document.getElementById('scan-btn-save-library'),
  scanLibrarySaveStatus: document.getElementById('scan-library-save-status'),
  libraryModal: document.getElementById('library-modal'),
  libraryStatus: document.getElementById('library-status'),
  libraryList: document.getElementById('library-list'),
  btnLibraryClose: document.getElementById('btn-library-close'),
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

// The most recently played library puzzle this session (item 9's save-to-library slice),
// mirroring scannedPuzzle's pattern above so re-selecting its picker entry works the same
// way — except a library puzzle is a real, permanent puzzle (source stays 'authored', see
// src/puzzleLibrary.js's loadLibraryPuzzle), not a session-only scan snapshot.
let libraryPuzzle = null;

function loadPuzzle(id) {
  const p =
    (scannedPuzzle && scannedPuzzle.id === id && scannedPuzzle) ||
    (libraryPuzzle && libraryPuzzle.id === id && libraryPuzzle) ||
    SAMPLE_PUZZLES.find((p) => p.id === id) ||
    SAMPLE_PUZZLES[0];
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

// Called when the player picks a puzzle to play from the library browse modal (below). A
// library puzzle's real title isn't spoiler-sensitive the way SAMPLE_PUZZLES' curated-shape
// names are (see populatePuzzleSelect's comment) — browsing by title is the whole point — so
// unlike that picker convention, this shows the puzzle's actual name.
function startLibraryPuzzle(p) {
  libraryPuzzle = p;
  let opt = els.puzzleSelect.querySelector('option[data-library]');
  if (!opt) {
    opt = document.createElement('option');
    opt.dataset.library = 'true';
    els.puzzleSelect.insertBefore(opt, els.puzzleSelect.firstChild);
  }
  opt.value = p.id;
  opt.textContent = `${p.name} — ${p.rows}x${p.cols}`;
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

    // Bug fix (Current Objective #4): a drag's paintState is fixed from whichever action its
    // *first* cell performed (see pointerdown below), then reapplied to every cell it sweeps
    // across. Applying it unconditionally meant dragging across an already-marked cell (e.g.
    // sweeping Fill mode over a cell the player had X'd) reused that same click-to-clear
    // logic and blanked it — a drag should only ever paint still-blank cells, never modify a
    // cell that's already FILLED or EMPTY, regardless of the drag's mode. Single-click
    // toggle-off-if-same-state (dragStep:false, the pointerdown call below) is unaffected —
    // only cells the drag *sweeps into* afterward are restricted to UNKNOWN.
    if (dragStep && current !== UNKNOWN) return;

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

const scanWizard = initScanWizard({
  els,
  onPuzzleReady: startScannedPuzzle,
  onClose: fitBoardToViewport,
  onOpen: syncExplainPanelSpace,
});
els.menuScan.addEventListener('click', () => {
  closeHelpMenu();
  scanWizard.open();
});

// ---- puzzle library browse (item 9's save-to-library slice — see TODO.md, src/puzzleLibrary.js) ----

// Renders one row per library puzzle. `myUid`, resolved once per open (below) rather than per
// row, decides whether that row's rename affordance shows at all — the Firestore rule is what
// actually enforces who can rename (see firestore.rules), this just avoids showing a control
// that would fail for everyone but the creator.
function renderLibraryList(puzzles, myUid) {
  els.libraryList.innerHTML = '';
  for (const entry of puzzles) {
    const li = document.createElement('li');
    li.className = 'library-row';

    const title = document.createElement('span');
    title.className = 'library-row__title';
    title.textContent = entry.title;

    const size = document.createElement('span');
    size.className = 'library-row__size';
    size.textContent = `${entry.rows}x${entry.cols}`;

    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn--primary';
    playBtn.type = 'button';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', async () => {
      playBtn.disabled = true;
      els.libraryStatus.textContent = '';
      try {
        const p = await loadLibraryPuzzle(entry.id);
        els.libraryModal.classList.add('hidden');
        startLibraryPuzzle(p);
      } catch (err) {
        console.warn('loadLibraryPuzzle failed:', err);
        els.libraryStatus.textContent = `Couldn't load "${entry.title}" — ${err?.message || 'try again.'}`;
        playBtn.disabled = false;
      }
    });

    li.append(title, size, playBtn);

    if (entry.creatorUid === myUid) {
      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn btn--ghost';
      renameBtn.type = 'button';
      renameBtn.textContent = 'Rename';
      renameBtn.addEventListener('click', () => {
        // Swap the row into an inline edit state — a text input pre-filled with the current
        // title plus Save/Cancel — rather than opening yet another modal on top of this one.
        const input = document.createElement('input');
        input.className = 'library-row__rename-input';
        input.type = 'text';
        input.maxLength = 80;
        input.value = entry.title;

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn--primary';
        saveBtn.type = 'button';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
          const newTitle = input.value.trim();
          if (!newTitle) return;
          saveBtn.disabled = true;
          try {
            await renamePuzzleInLibrary(entry.id, newTitle);
            entry.title = newTitle;
            title.textContent = newTitle;
            li.replaceChildren(title, size, playBtn, renameBtn);
          } catch (err) {
            console.warn('renamePuzzleInLibrary failed:', err);
            els.libraryStatus.textContent = `Couldn't rename — ${err?.message || 'try again.'}`;
            saveBtn.disabled = false;
          }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn--ghost';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
          li.replaceChildren(title, size, playBtn, renameBtn);
        });

        li.replaceChildren(input, saveBtn, cancelBtn);
        input.focus();
      });
      li.appendChild(renameBtn);
    }

    els.libraryList.appendChild(li);
  }
}

async function refreshLibraryList() {
  els.libraryStatus.textContent = 'Loading…';
  els.libraryList.innerHTML = '';
  try {
    // Anonymous sign-in only (no UI, no prompt) — needed just to know "is this my own
    // puzzle" for the rename affordance; browsing/reading the library itself is public and
    // doesn't require it (see firestore.rules), but ensureSignedIn() is already how every
    // other Firebase-backed feature here resolves "the current uid" (see src/stats.js).
    const [puzzles, user] = await Promise.all([fetchLibraryPuzzles(), ensureSignedIn().catch(() => null)]);
    if (puzzles.length === 0) {
      els.libraryStatus.textContent = 'No puzzles saved to the library yet — save one from the scan wizard.';
      return;
    }
    els.libraryStatus.textContent = '';
    renderLibraryList(puzzles, user?.uid ?? null);
  } catch (err) {
    console.warn('fetchLibraryPuzzles failed:', err);
    els.libraryStatus.textContent =
      "Couldn't load the library — this needs Firestore rules deployed and a network connection.";
  }
}

els.menuLibrary.addEventListener('click', () => {
  closeHelpMenu();
  els.libraryModal.classList.remove('hidden');
  refreshLibraryList();
});

els.btnLibraryClose.addEventListener('click', () => {
  els.libraryModal.classList.add('hidden');
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
    ['scan-modal (scan wizard)', els.scanModal],
    ['help-menu-list (Help dropdown)', els.helpMenuList],
  ];

  function buildReport() {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const docScrollHeight = document.documentElement.scrollHeight;
    const bodyScrollHeight = document.body.scrollHeight;
    const excess = Math.max(docScrollHeight, bodyScrollHeight) - viewportHeight;

    const lines = [];
    lines.push(`${new Date().toLocaleTimeString()}`);
    lines.push(`visualViewport.height: ${window.visualViewport?.height ?? '(unavailable)'}`);
    lines.push(`window.innerHeight: ${window.innerHeight}`);
    lines.push(`document.documentElement.scrollHeight: ${docScrollHeight}`);
    lines.push(`document.body.scrollHeight: ${bodyScrollHeight}`);
    lines.push(`window.scrollY: ${window.scrollY}`);
    lines.push(`EXCESS (scrollable beyond visible viewport): ${excess}px`);
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
    return lines.join('\n');
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'scroll-diag-btn';
  btn.textContent = '📏';
  btn.setAttribute('aria-label', 'Scroll diagnostics');
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'scroll-diag-panel hidden';
  const pre = document.createElement('pre');
  pre.className = 'scroll-diag-panel__text';
  const actions = document.createElement('div');
  actions.className = 'scroll-diag-panel__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy report';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--primary';
  closeBtn.textContent = 'Close';
  actions.append(copyBtn, closeBtn);
  panel.append(pre, actions);
  document.body.appendChild(panel);

  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(pre.textContent).then(
      () => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy report'; }, 1500); },
      () => { copyBtn.textContent = 'Copy failed — select text manually'; }
    );
  });
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  btn.addEventListener('click', () => {
    pre.textContent = buildReport();
    panel.classList.remove('hidden');
  });
}
initScrollDiagnostics();
