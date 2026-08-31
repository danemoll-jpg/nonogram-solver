// Zero-dependency sanity check for mergeStatsBucket (item 4's pairing-redemption merge
// logic) — the one piece of functions/index.js that's pure enough to test without spinning
// up the Firestore/Auth emulator. Not wired into the root `npm test` (functions/ is a
// separate Node package with its own dependencies) — run directly:
//   node functions/test-merge.js

const { mergeStatsBucket } = require('./index.js');

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.log(`FAIL - ${message}\n  expected ${e}\n  got      ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`ok  - ${message}`);
  }
}

assertEqual(
  mergeStatsBucket(
    { puzzlesSolved: 3, totalTimeMs: 9000, totalHints: 2, totalMistakes: 1 },
    { puzzlesSolved: 2, totalTimeMs: 4000, totalHints: 5, totalMistakes: 0 }
  ),
  { puzzlesSolved: 5, totalTimeMs: 13000, totalHints: 7, totalMistakes: 1 },
  'sums both sides field-by-field'
);

assertEqual(
  mergeStatsBucket({}, { puzzlesSolved: 4, totalTimeMs: 1000, totalHints: 1, totalMistakes: 0 }),
  { puzzlesSolved: 4, totalTimeMs: 1000, totalHints: 1, totalMistakes: 0 },
  'treats a missing/empty bucket as all zeros'
);

assertEqual(
  mergeStatsBucket(undefined, undefined),
  { puzzlesSolved: 0, totalTimeMs: 0, totalHints: 0, totalMistakes: 0 },
  'handles both sides missing entirely'
);
