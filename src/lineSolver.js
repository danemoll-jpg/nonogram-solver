// The line-solving engine: given one line's current marks (UNKNOWN/FILLED/EMPTY) and its
// clue, figures out which UNKNOWN cells can be determined for certain.
//
// Three techniques, tried cheapest-first (see solver.js for how a hint picks among them):
//   1. overlap            - leftmost/rightmost placement of the whole clue, "big number in
//                            a small space". Ignores existing marks; it's the deduction a
//                            human makes on a fresh line.
//   2. edgeCompletion     - a run touching the start/end of the line already matches its
//                            clue number, so the cell right after it must be empty.
//   3. generalLineSolve   - the full constraint solve (a DP/automaton match against the
//                            clue), which is what "gap-forcing" reduces to in general: once
//                            known-empty cells split the line into segments, this finds
//                            every cell that's forced across *all* remaining valid
//                            arrangements. It subsumes 1 and 2, so it's the guaranteed-
//                            complete fallback when the cheap techniques find nothing.
//
// generalLineSolve is also what the solving loop (technique 4, cross-line propagation, in
// solver.js) and contradiction search (contradiction.js) call to fully resolve a line.

import { UNKNOWN, FILLED, EMPTY } from './model.js';

// ---- Technique 1: overlap -------------------------------------------------

// Returns [{ index, runIndex }] for cells forced FILLED by the classic overlap technique,
// computed purely from the clue and line length (existing marks are not consulted).
export function overlapForcedCells(length, clue) {
  if (clue.length === 0) return [];
  const leftStarts = [];
  let pos = 0;
  for (const run of clue) {
    leftStarts.push(pos);
    pos += run + 1;
  }
  const rightStarts = new Array(clue.length);
  pos = length;
  for (let i = clue.length - 1; i >= 0; i--) {
    pos -= clue[i];
    rightStarts[i] = pos;
    pos -= 1;
  }
  const forced = [];
  for (let i = 0; i < clue.length; i++) {
    const leftEnd = leftStarts[i] + clue[i] - 1;
    const rightStart = rightStarts[i];
    const start = Math.max(leftStarts[i], rightStart);
    const end = Math.min(leftEnd, rightStart + clue[i] - 1);
    for (let idx = start; idx <= end; idx++) forced.push({ index: idx, runIndex: i });
  }
  return forced;
}

// ---- Technique 2: edge / completion ----------------------------------------

// Returns at most one deduction: { index, state: EMPTY, reasoning: [indices] } for the
// cell just past a boundary-touching run that already matches its clue number.
export function edgeCompletionDeductions(line, clue) {
  const n = line.length;
  const results = [];

  if (clue.length > 0 && line[0] === FILLED) {
    let runLen = 0;
    while (runLen < n && line[runLen] === FILLED) runLen++;
    if (runLen === clue[0] && runLen < n && line[runLen] === UNKNOWN) {
      results.push({ index: runLen, state: EMPTY, reasoning: range(0, runLen - 1) });
    }
  }

  if (clue.length > 0 && line[n - 1] === FILLED) {
    let runLen = 0;
    while (runLen < n && line[n - 1 - runLen] === FILLED) runLen++;
    const lastClue = clue[clue.length - 1];
    const targetIdx = n - 1 - runLen;
    if (runLen === lastClue && targetIdx >= 0 && line[targetIdx] === UNKNOWN) {
      results.push({ index: targetIdx, state: EMPTY, reasoning: range(n - runLen, n - 1) });
    }
  }

  return results;
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

// ---- Per-number anchoring (display-only — see app.js's clue-graying) -------------------
//
// Current Objective (per-number clue gray-out — see TODO.md): isLineSatisfied (model.js)
// grays out a WHOLE clue only once every one of its numbers matches, all at once. This
// answers a finer question: which INDIVIDUAL numbers within a clue are independently
// provable right now? It's edgeCompletionDeductions' own reasoning (a run touching a line's
// boundary that already matches its clue number) generalized to walk the WHOLE clue inward
// from an edge, one number at a time, instead of stopping after the first.
//
// A number counts as anchored once its own run is providably fixed in place: the walk has
// already fully accounted for every cell before `pos` (either a confirmed-empty gap, or an
// earlier number's own already-proven run, recursively) — so there is genuinely no room
// anywhere before `pos` for numbers 0..i-1 to relocate into. Given that, a FILLED run
// starting at `pos` whose length exactly matches clue[i] is forced: it can't be number i-1 or
// earlier (no room left of it), it can't be number i+1 or later (that would strand number i
// with nowhere to go), and it can't be number i itself at any OTHER length (it can't shrink —
// filled cells never un-fill — and growing it into a following UNKNOWN cell would change its
// length away from the one and only value that keeps it assignable to number i, which is the
// same contradiction again). So the run's identity AND its exact extent are both forced in
// every valid completion, regardless of whether the cell immediately after it is a confirmed
// EMPTY or still UNKNOWN — that trailing cell is itself implied empty by this same argument,
// it just isn't a *directly observed* mark yet, which is why the walk still won't try to
// anchor number i+1 from an unconfirmed cell (see the loop below): it only stops relying on
// what's directly marked once it runs out of forced conclusions to chain forward from.
//
// (This function used to also require the run's far/trailing boundary to already be a
// directly-observed EMPTY mark before counting it as anchored — reasonable-sounding, but
// unnecessarily conservative per the argument above, confirmed by brute force: it made the
// effect require far more player progress than the underlying logic actually needs, which in
// practice meant it rarely triggered during ordinary play. TODO.md's own `5, 3, 2` example
// (a complete run of 3 floating with neither neighbor anchored yet stays unanchored) is still
// correctly unanchored under this version too — it fails at the very first check below
// (`line[pos] !== FILLED`, since nothing has walked in from either edge to reach it yet), not
// because of the removed far-boundary requirement; that example was never actually about this
// function's far-boundary check in the first place.)
function walkAnchorsFromStart(line, clue) {
  const n = line.length;
  const anchored = new Array(clue.length).fill(false);
  let pos = 0;
  for (let i = 0; i < clue.length; i++) {
    while (pos < n && line[pos] === EMPTY) pos++; // skip a confirmed-empty gap
    if (pos >= n || line[pos] !== FILLED) break; // no confirmed start for this run yet
    let runEnd = pos;
    while (runEnd < n && line[runEnd] === FILLED) runEnd++;
    if (runEnd - pos !== clue[i]) break; // wrong length: still growing (UNKNOWN ahead) or already contradictory either way, not provable
    anchored[i] = true;
    pos = runEnd;
  }
  return anchored;
}

// Walks from both ends (a number can anchor from either direction — e.g. a clue's last
// number can anchor off the line's right edge even before anything about its first number is
// known) and combines them; see walkAnchorsFromStart's own comment for the actual reasoning.
export function anchoredClueNumbers(line, clue) {
  const fromLeft = walkAnchorsFromStart(line, clue);
  const fromRight = walkAnchorsFromStart(line.slice().reverse(), clue.slice().reverse()).reverse();
  return clue.map((_, i) => fromLeft[i] || fromRight[i]);
}

// ---- Technique 3: general line solve (automaton / DP) ----------------------

// Builds the block sequence a valid line must match: gap, run, gap, run, ..., gap.
// Internal gaps require >=1 empty cell (to separate runs); the leading/trailing gaps
// allow 0. A clue of [] (no runs) collapses to a single "whole line is gap" block.
function buildBlocks(clue) {
  if (clue.length === 0) return [{ type: 'gap', min: 0 }];
  const blocks = [{ type: 'gap', min: 0 }];
  for (let i = 0; i < clue.length; i++) {
    blocks.push({ type: 'run', len: clue[i] });
    blocks.push({ type: 'gap', min: i === clue.length - 1 ? 0 : 1 });
  }
  return blocks;
}

// canStart[p][b] = true if blocks[0..b-1] can validly consume line[0..p-1] exactly,
// leaving block b to start fresh at position p.
function forwardReach(line, blocks) {
  const n = line.length;
  const numBlocks = blocks.length;
  const canStart = Array.from({ length: n + 1 }, () => new Array(numBlocks + 1).fill(false));
  canStart[0][0] = true;
  for (let b = 0; b < numBlocks; b++) {
    const block = blocks[b];
    for (let p = 0; p <= n; p++) {
      if (!canStart[p][b]) continue;
      if (block.type === 'gap') {
        let maxG = 0;
        while (p + maxG < n && line[p + maxG] !== FILLED) maxG++;
        for (let g = block.min; g <= maxG; g++) canStart[p + g][b + 1] = true;
      } else {
        const len = block.len;
        if (p + len > n) continue;
        let ok = true;
        for (let c = p; c < p + len; c++) {
          if (line[c] === EMPTY) { ok = false; break; }
        }
        if (ok) canStart[p + len][b + 1] = true;
      }
    }
  }
  return canStart;
}

// Cheap check: does this line's current marks have *any* completion matching the clue?
// Used as a fast up-front gate so a contradiction is caught immediately, even in a line
// that's already fully marked (and so would otherwise never be re-examined).
export function isLineConsistent(line, clue) {
  const blocks = buildBlocks(clue);
  return forwardReach(line, blocks)[line.length][blocks.length];
}

// The full result of solving a line: which cells are forced, and whether the line's
// current marks are even consistent with its clue at all (used to detect contradictions).
//
// For each still-unknown cell, this hypothesizes each state in turn and checks whether the
// line as a whole still has *some* valid completion (via forwardReach as a feasibility
// oracle) — the cell is forced to whichever single state keeps the line satisfiable. This
// is the same hypothesize-and-check idea contradiction search uses at the whole-board
// level, just applied per-cell within one line; it's a little more work than tracking
// per-run coverage directly, but it's straightforward to get right.
export function generalLineSolve(line, clue) {
  const n = line.length;
  const blocks = buildBlocks(clue);
  const numBlocks = blocks.length;

  const isValid = (candidate) => forwardReach(candidate, blocks)[n][numBlocks];

  if (!isValid(line)) return { valid: false, forced: [] };

  const forced = [];
  for (let c = 0; c < n; c++) {
    if (line[c] !== UNKNOWN) continue;
    const asFilled = line.slice();
    asFilled[c] = FILLED;
    const asEmpty = line.slice();
    asEmpty[c] = EMPTY;
    const canFill = isValid(asFilled);
    const canEmpty = isValid(asEmpty);
    if (canFill && !canEmpty) forced.push({ index: c, state: FILLED });
    else if (canEmpty && !canFill) forced.push({ index: c, state: EMPTY });
    // if neither: the line is already contradictory elsewhere (caught by isValid(line)
    // above in a properly-fed puzzle). if both: genuinely undetermined for now.
  }
  return { valid: true, forced };
}
