// Differential test: for many random (line, clue) pairs, compare the DP-based
// generalLineSolve against a brute-force enumeration of every binary string of that
// length. This is the strongest correctness check for the solver's core — if the DP ever
// disagrees with brute force, that's a real bug, not a rounding/heuristic difference.

import { describe, test, assert, assertEqual } from './harness.js';
import { UNKNOWN, FILLED, EMPTY, cluesFromLine } from '../src/model.js';
import {
  generalLineSolve,
  overlapForcedCells,
  edgeCompletionDeductions,
  isLineConsistent,
  anchoredClueNumbers,
} from '../src/lineSolver.js';

function randomBoolLine(n, density) {
  return Array.from({ length: n }, () => Math.random() < density);
}

function maskLine(boolLine, keepProb) {
  return boolLine.map((filled) => {
    if (Math.random() > keepProb) return UNKNOWN;
    return filled ? FILLED : EMPTY;
  });
}

function bruteForce(masked, clue) {
  const n = masked.length;
  let canFill = new Array(n).fill(false);
  let canEmpty = new Array(n).fill(false);
  let anyValid = false;
  for (let bits = 0; bits < 1 << n; bits++) {
    const candidate = new Array(n);
    let consistent = true;
    for (let i = 0; i < n; i++) {
      const filled = (bits & (1 << i)) !== 0;
      candidate[i] = filled;
      if (masked[i] === FILLED && !filled) { consistent = false; break; }
      if (masked[i] === EMPTY && filled) { consistent = false; break; }
    }
    if (!consistent) continue;
    const runs = cluesFromLine(candidate);
    if (JSON.stringify(runs) !== JSON.stringify(clue)) continue;
    anyValid = true;
    for (let i = 0; i < n; i++) {
      if (candidate[i]) canFill[i] = true;
      else canEmpty[i] = true;
    }
  }
  return { anyValid, canFill, canEmpty };
}

describe('generalLineSolve vs brute force', () => {
  const trials = 400;
  for (let t = 0; t < trials; t++) {
    test(`random trial ${t}`, () => {
      const n = 1 + Math.floor(Math.random() * 10);
      const density = 0.35 + Math.random() * 0.3;
      const solution = randomBoolLine(n, density);
      const clue = cluesFromLine(solution);
      const masked = maskLine(solution, 0.4);

      const bf = bruteForce(masked, clue);
      const dp = generalLineSolve(masked, clue);

      assertEqual(dp.valid, bf.anyValid, `line=${JSON.stringify(masked)} clue=${JSON.stringify(clue)}: valid mismatch`);
      if (!bf.anyValid) return;

      const dpFill = new Set(dp.forced.filter((f) => f.state === FILLED).map((f) => f.index));
      const dpEmpty = new Set(dp.forced.filter((f) => f.state === EMPTY).map((f) => f.index));

      for (let i = 0; i < n; i++) {
        if (masked[i] !== UNKNOWN) continue;
        const shouldBeForcedFill = bf.canFill[i] && !bf.canEmpty[i];
        const shouldBeForcedEmpty = bf.canEmpty[i] && !bf.canFill[i];
        assert(
          dpFill.has(i) === shouldBeForcedFill,
          `cell ${i}: expected forced-fill=${shouldBeForcedFill}, got ${dpFill.has(i)} ` +
          `(line=${JSON.stringify(masked)} clue=${JSON.stringify(clue)})`
        );
        assert(
          dpEmpty.has(i) === shouldBeForcedEmpty,
          `cell ${i}: expected forced-empty=${shouldBeForcedEmpty}, got ${dpEmpty.has(i)} ` +
          `(line=${JSON.stringify(masked)} clue=${JSON.stringify(clue)})`
        );
      }
    });
  }
});

describe('overlap technique (hand-checked cases)', () => {
  test('5 in a space of 7 forces the middle 3', () => {
    const forced = overlapForcedCells(7, [5]).map((f) => f.index).sort();
    assertEqual(forced, [2, 3, 4]);
  });

  test('no overlap when the run fits loosely', () => {
    const forced = overlapForcedCells(7, [2]);
    assertEqual(forced, []);
  });

  test('multiple runs: each contributes its own overlap', () => {
    // length 10, clue [4,4]: left pack 0-3,5-8; right pack 1-4,6-9 -> overlaps 1-3, 6-8
    const forced = overlapForcedCells(10, [4, 4]).map((f) => f.index).sort((a, b) => a - b);
    assertEqual(forced, [1, 2, 3, 6, 7, 8]);
  });
});

// Item: red clue numbers for genuine contradictions (app.js uses isLineConsistent directly
// as its satisfiability check — never touching brute force). These cases mirror the two
// examples called out in TODO.md.
describe('isLineConsistent (contradiction detection)', () => {
  test('a run of 4 where the clue only allows runs of up to 3 is inconsistent', () => {
    // clue [2, 3] in a line of 8: ..####.. is a run of 4, which no arrangement of [2,3] can produce.
    const line = [EMPTY, EMPTY, FILLED, FILLED, FILLED, FILLED, EMPTY, EMPTY];
    assertEqual(isLineConsistent(line, [2, 3]), false);
  });

  test('three separated runs against a two-number clue is inconsistent', () => {
    // #.#.# has three runs of 1, but the clue only describes two numbers.
    const line = [FILLED, EMPTY, FILLED, EMPTY, FILLED];
    assertEqual(isLineConsistent(line, [2, 1]), false);
  });

  test('still consistent while some cells remain unknown', () => {
    const line = [FILLED, FILLED, UNKNOWN, UNKNOWN, UNKNOWN];
    assertEqual(isLineConsistent(line, [2, 1]), true);
  });

  test('a fully-marked line matching its clue is consistent', () => {
    const line = [FILLED, FILLED, EMPTY, EMPTY, FILLED];
    assertEqual(isLineConsistent(line, [2, 1]), true);
  });
});

describe('edge completion technique (hand-checked cases)', () => {
  test('boundary run matching clue forces the next cell empty', () => {
    const line = [FILLED, FILLED, FILLED, UNKNOWN, UNKNOWN];
    const result = edgeCompletionDeductions(line, [3, 1]);
    assertEqual(result.length, 1);
    assertEqual(result[0].index, 3);
    assertEqual(result[0].state, EMPTY);
  });

  test('boundary run shorter than clue forces nothing yet', () => {
    const line = [FILLED, FILLED, UNKNOWN, UNKNOWN, UNKNOWN];
    const result = edgeCompletionDeductions(line, [3]);
    assertEqual(result, []);
  });
});

// Current Objective (per-number clue gray-out — see TODO.md): hand-checked cases straight
// from the feature's own spec, plus the differential/property test below (per CLAUDE.md's
// "prefer differential/property-style tests... when correctness is subtle").
describe('anchoredClueNumbers (hand-checked cases)', () => {
  test("TODO.md's own `5, 3, 2` example: a complete, correctly-bounded run of 3 stays " +
    'unanchored while neither neighbor is anchored yet', () => {
    const line = [
      UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, // still deciding the "5"
      EMPTY,
      FILLED, FILLED, FILLED, // the "3" — complete and bounded, but floating
      EMPTY,
      UNKNOWN, UNKNOWN, // still deciding the "2"
    ];
    assertEqual(anchoredClueNumbers(line, [5, 3, 2]), [false, false, false]);
  });

  test('once the "5" anchors to the left edge with a confirmed empty gap, the "3" anchors relative to it', () => {
    const line = [
      FILLED, FILLED, FILLED, FILLED, FILLED, // "5", touches the left edge
      EMPTY,
      FILLED, FILLED, FILLED, // "3"
      EMPTY,
      UNKNOWN, UNKNOWN, // "2" still undecided
    ];
    assertEqual(anchoredClueNumbers(line, [5, 3, 2]), [true, true, false]);
  });

  test('a run touching the true edge is NOT anchored on its own if its far boundary is still unknown', () => {
    // clue [2]: the run starts at the line's own edge, but nothing confirms it stops at
    // length 2 rather than growing into the still-UNKNOWN cell right after it.
    const line = [FILLED, FILLED, UNKNOWN, UNKNOWN];
    assertEqual(anchoredClueNumbers(line, [2]), [false]);
  });

  test('a run touching the true edge IS anchored once its far boundary is confirmed empty', () => {
    const line = [FILLED, FILLED, EMPTY, UNKNOWN];
    assertEqual(anchoredClueNumbers(line, [2]), [true]);
  });

  test('a run that fills the whole line touches both edges at once and anchors', () => {
    assertEqual(anchoredClueNumbers([FILLED, FILLED, FILLED], [3]), [true]);
  });

  test('touching the true edge alone does not anchor a number whose far boundary is still unknown, even when a different number elsewhere is fully anchored', () => {
    const line = [
      FILLED, FILLED, FILLED, FILLED, FILLED, // "5", anchors: left edge + confirmed empty after
      EMPTY,
      UNKNOWN, // breaks the chain toward the "3"
      FILLED, FILLED, FILLED, // "3" — floating, not reachable from either anchored end
      UNKNOWN, // breaks the chain from the "2" side too
      FILLED, FILLED, // "2", touches the right edge, but its far (left-facing) boundary is UNKNOWN
    ];
    assertEqual(anchoredClueNumbers(line, [5, 3, 2]), [true, false, false]);
  });

  test('an empty clue has no numbers to anchor', () => {
    assertEqual(anchoredClueNumbers([EMPTY, EMPTY], []), []);
  });
});

function runPositions(candidate) {
  const positions = [];
  let start = -1;
  for (let i = 0; i <= candidate.length; i++) {
    const on = i < candidate.length && candidate[i];
    if (on && start === -1) start = i;
    else if (!on && start !== -1) {
      positions.push([start, i - 1]);
      start = -1;
    }
  }
  return positions;
}

// For every completion of `masked` consistent with both the existing marks and `clue`,
// collect the [start, end] each clue NUMBER (by index) actually occupies — used below to
// check anchoredClueNumbers never claims a number is anchored unless its position is
// genuinely invariant across every remaining possibility, i.e. a soundness check, brute-force
// verified, mirroring generalLineSolve's own differential test above.
function bruteForceRunPositionsPerNumber(masked, clue) {
  const n = masked.length;
  const perNumber = Array.from({ length: clue.length }, () => []);
  for (let bits = 0; bits < 1 << n; bits++) {
    const candidate = new Array(n);
    let consistent = true;
    for (let i = 0; i < n; i++) {
      const filled = (bits & (1 << i)) !== 0;
      candidate[i] = filled;
      if (masked[i] === FILLED && !filled) { consistent = false; break; }
      if (masked[i] === EMPTY && filled) { consistent = false; break; }
    }
    if (!consistent) continue;
    const positions = runPositions(candidate);
    if (positions.length !== clue.length) continue;
    if (!positions.every(([s, e], i) => e - s + 1 === clue[i])) continue;
    positions.forEach((pos, i) => perNumber[i].push(pos));
  }
  return perNumber;
}

describe('anchoredClueNumbers vs brute force (soundness — never claims an unproven position)', () => {
  const trials = 300;
  for (let t = 0; t < trials; t++) {
    test(`random trial ${t}`, () => {
      const n = 2 + Math.floor(Math.random() * 6); // 2-7 cells: small enough for exhaustive 2^n brute force
      const solution = randomBoolLine(n, 0.5);
      const clue = cluesFromLine(solution);
      if (clue.length === 0) return; // nothing to anchor
      const masked = maskLine(solution, 0.6);
      if (!isLineConsistent(masked, clue)) return; // app.js never calls anchoredClueNumbers on an inconsistent line either

      const anchored = anchoredClueNumbers(masked, clue);
      const perNumber = bruteForceRunPositionsPerNumber(masked, clue);
      for (let i = 0; i < clue.length; i++) {
        if (!anchored[i]) continue; // only checking that every POSITIVE claim is actually proven
        const positions = perNumber[i];
        assert(positions.length > 0, `trial ${t}: number ${i} claimed anchored but has no valid completion`);
        const [s0, e0] = positions[0];
        const invariant = positions.every(([s, e]) => s === s0 && e === e0);
        assert(
          invariant,
          `trial ${t}: number ${i} claimed anchored but its position varies across valid completions ` +
            `(line=${JSON.stringify(masked)}, clue=${JSON.stringify(clue)}, positions=${JSON.stringify(positions)})`
        );
      }
    });
  }
});
