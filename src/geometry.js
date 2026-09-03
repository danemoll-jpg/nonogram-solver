// Pure grid-geometry helpers with no DOM/board dependency, shared by anything that needs to
// walk a path across grid cells — currently the real board's drag-painting (app.js) and the
// "draw a puzzle" wizard's editable grid (src/drawUI.js). Split out of app.js (where
// cellsOnLine originally lived, single-purpose to the real board's own drag handler) once a
// second, unrelated consumer needed the exact same logic — see CLAUDE.md's "each module does
// one job" rule.

// Real-device report (see TODO.md): dragging across more than a few cells, finger never
// leaving the screen and never crossing an already-marked cell, would sometimes still leave
// some cells unpainted. Root cause: a plain pointermove handler only ever paints whichever
// single cell is exactly under the pointer at the moment each event fires — on a fast swipe,
// especially over small cells, two consecutive samples can easily land in non-adjacent cells,
// silently skipping whatever was in between even though the finger visually passed straight
// over it without lifting.
//
// Standard Bresenham line algorithm between two grid cells (inclusive of both endpoints) —
// grid cells are just integer (row, col) coordinates, no different from pixels here. Lets a
// pointermove handler paint every cell the pointer's path crossed since the last sample, not
// just its final resting point.
export function cellsOnLine(r0, c0, r1, c1) {
  const cells = [];
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1;
  const sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;
  let r = r0;
  let c = c0;
  while (true) {
    cells.push([r, c]);
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 < dr) { err += dr; c += sc; }
  }
  return cells;
}
