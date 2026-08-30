// Data model: the plain grid/clue representation everything else (solver, hints,
// mistake-checking, UI) is built on. See README.md "Architecture" for the overview.

// Cell states. A cell is UNKNOWN until the player (or the solver) decides it.
export const UNKNOWN = 'unknown';
export const FILLED = 'filled';
export const EMPTY = 'empty';

export function createGrid(rows, cols, fill = UNKNOWN) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

export function getRow(grid, r) {
  return grid[r].slice();
}

export function getCol(grid, c) {
  return grid.map((row) => row[c]);
}

// Derive run-length clues (e.g. [2, 1]) from one line of a solution.
// Accepts FILLED/EMPTY strings, booleans, or 0/1 — whatever a solution grid uses.
export function cluesFromLine(line) {
  const runs = [];
  let count = 0;
  for (const cell of line) {
    const filled = cell === FILLED || cell === true || cell === 1;
    if (filled) {
      count++;
    } else if (count > 0) {
      runs.push(count);
      count = 0;
    }
  }
  if (count > 0) runs.push(count);
  return runs; // [] means the line is entirely empty
}

// Derive full row/col clue sets from a solution grid.
export function deriveClues(solution) {
  const rows = solution.length;
  const cols = solution[0]?.length ?? 0;
  const rowClues = solution.map((row) => cluesFromLine(row));
  const colClues = [];
  for (let c = 0; c < cols; c++) {
    colClues.push(cluesFromLine(solution.map((row) => row[c])));
  }
  return { rowClues, colClues };
}

// A Puzzle is the static definition: dimensions + clues (+ optional known solution,
// which is present for authored/generated puzzles but may be absent for a puzzle whose
// solution isn't known in advance — not currently used, but kept optional on purpose).
export function makePuzzle({ id, name, rows, cols, rowClues, colClues, solution = null, source = 'authored' }) {
  return { id, name, rows, cols, rowClues, colClues, solution, source };
}

// Build a puzzle directly from a solution grid, deriving its clues from it.
export function puzzleFromSolution({ id, name, solution, source = 'authored' }) {
  const rows = solution.length;
  const cols = solution[0].length;
  const { rowClues, colClues } = deriveClues(solution);
  const boolSolution = solution.map((row) => row.map((c) => c === FILLED || c === true || c === 1));
  return makePuzzle({ id, name, rows, cols, rowClues, colClues, solution: boolSolution, source });
}

// A Board is the mutable play state: a grid of UNKNOWN/FILLED/EMPTY marks plus move
// history. History is what makes "undo to move #N" possible; a board reconstructed from
// a photo/scan snapshot has no history (see hasHistory) and mistake-checking degrades
// gracefully for it (flag wrong cells as a set, no undo-to-point).
//
// Each history entry is one *move*: { cells: [{ row, col, prev, next }, ...], source }.
// Most moves are a single cell (one click). A move can also batch several cells that
// happened as one causally-linked action — e.g. a manual fill plus the auto-X marks it
// triggers on a just-completed line (see app.js's paintCell) — so undo-to-point removes
// them together instead of leaving a line half-auto-marked. `source` ('player' | 'hint')
// lets the UI derive a "hints used" count straight from history without a separate
// counter (see app.js's completion stats).
export class Board {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.grid = createGrid(rows, cols);
    this.history = [];
    this.hasHistory = true;
  }

  static fromGrid(grid, { hasHistory = true } = {}) {
    const board = new Board(grid.length, grid[0]?.length ?? 0);
    board.grid = cloneGrid(grid);
    board.hasHistory = hasHistory;
    return board;
  }

  clone() {
    const b = new Board(this.rows, this.cols);
    b.grid = cloneGrid(this.grid);
    b.history = this.history.map((m) => ({ ...m, cells: m.cells.map((c) => ({ ...c })) }));
    b.hasHistory = this.hasHistory;
    return b;
  }

  get(r, c) {
    return this.grid[r][c];
  }

  // Set a single cell. Returns false (no-op) if it was already that state.
  // recordHistory:false is for scratch boards (hint preview, contradiction search) that
  // must not pollute the real move history. `source` tags the move (see class comment).
  set(r, c, state, { recordHistory = true, source = 'player' } = {}) {
    const prev = this.grid[r][c];
    if (prev === state) return false;
    this.grid[r][c] = state;
    if (recordHistory && this.hasHistory) {
      this.history.push({ cells: [{ row: r, col: c, prev, next: state }], source });
    }
    return true;
  }

  // Set several cells as one atomic move (see class comment). No-op cells (already at the
  // target state) are skipped; if nothing actually changed, no history entry is pushed.
  // Returns the list of cells that did change, as { row, col, prev, next }.
  setBatch(changes, { recordHistory = true, source = 'player' } = {}) {
    const applied = [];
    for (const { row, col, state } of changes) {
      const prev = this.grid[row][col];
      if (prev === state) continue;
      this.grid[row][col] = state;
      applied.push({ row, col, prev, next: state });
    }
    if (applied.length > 0 && recordHistory && this.hasHistory) {
      this.history.push({ cells: applied, source });
    }
    return applied;
  }

  getRow(r) { return getRow(this.grid, r); }
  getCol(c) { return getCol(this.grid, c); }

  isComplete() {
    return this.grid.every((row) => row.every((cell) => cell !== UNKNOWN));
  }

  // Rebuild the grid by replaying only history[0, n) — "undo to move #n". Used when an
  // on-demand check finds the earliest wrong mark was move #n.
  undoToMove(n) {
    const replay = this.history.slice(0, n);
    this.grid = createGrid(this.rows, this.cols);
    for (const move of replay) {
      for (const cell of move.cells) this.grid[cell.row][cell.col] = cell.next;
    }
    this.history = replay;
  }

  undoLast() {
    if (this.history.length > 0) this.undoToMove(this.history.length - 1);
  }
}

// A line (row or col) is "satisfied" once its filled-cell runs exactly match its clue —
// this is what the UI uses to gray out a clue number, independent of remaining unknowns.
export function isLineSatisfied(line, clue) {
  const runs = cluesFromLine(line.map((c) => (c === FILLED ? FILLED : EMPTY)));
  if (runs.length !== clue.length) return false;
  return runs.every((r, i) => r === clue[i]);
}
