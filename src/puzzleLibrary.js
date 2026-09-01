// Public shared puzzle library — the save-to-library slice of item 9, pulled forward
// (see TODO.md's Current Objective). Reuses the "Scan a puzzle" wizard as the puzzle
// authoring tool: src/scanUI.js's "done" step calls savePuzzleToLibrary() with the
// confirmed grid + clues (never the current fill/X marks — saving is always a blank-
// puzzle snapshot of the definition, decoupled from whatever the player's own scan
// session is doing). app.js's library browse UI calls the rest.
//
// Firestore schema (`puzzles/{puzzleId}`, minimum viable per TODO.md):
//   rows, cols        — grid dimensions (numbers)
//   rowClues, colClues — one comma-joined string per line, e.g. "2,5" or "" for an
//                        all-empty line. Firestore has no array-of-arrays type, so a
//                        real rowClues (array of arrays of numbers) can't be stored
//                        directly without wrapping every row in its own map; comma-
//                        joined strings sidestep that and round-trip through
//                        scanPuzzle.js's existing parseClueText — the exact format that
//                        module already parses out of OCR/correction text.
//   title             — required at save time, editable later by the creator only.
//   creatorUid        — Firebase Anonymous Auth uid (see src/firebase.js), whoever saved it.
//   createdAt         — serverTimestamp(), used to sort the browse list newest-first.
//
// No solution is stored — buildScannedPuzzle already proved these clues solve before the
// wizard allowed saving (see scanPuzzle.js's uniqueness note), so loadLibraryPuzzle just
// re-solves them the same way a fresh scan does, keeping the stored doc minimal.
//
// Public read; create restricted to the authenticated (including anonymous) creator;
// update restricted to the original creator and scoped to only the `title` field — see
// firestore.rules.

import { ensureSignedIn, getFirestoreClient } from './firebase.js';
import { parseClueText, buildScannedPuzzle } from './scanPuzzle.js';

const COLLECTION = 'puzzles';

function serializeClues(clues) {
  return clues.map((line) => line.join(','));
}

function deserializeClues(lines) {
  return lines.map((line) => parseClueText(line));
}

// Writes a new public library puzzle from confirmed grid dimensions + clues. Resolves
// the new doc's id. Throws on failure (offline, not deployed, rules rejection) — the
// scan wizard's "Save to library" action shows the error rather than pretending it
// worked.
export async function savePuzzleToLibrary({ rows, cols, rowClues, colClues, title }) {
  const user = await ensureSignedIn();
  const { db, mod } = await getFirestoreClient();
  const ref = await mod.addDoc(mod.collection(db, COLLECTION), {
    rows,
    cols,
    rowClues: serializeClues(rowClues),
    colClues: serializeClues(colClues),
    title,
    creatorUid: user.uid,
    createdAt: mod.serverTimestamp(),
  });
  return ref.id;
}

// Lists public library puzzles, most recent first. Resolves
// [{ id, rows, cols, title, creatorUid }, ...] — clues/solution are loaded lazily, only
// once a specific puzzle is actually opened (loadLibraryPuzzle), keeping the browse list
// itself light regardless of how large individual puzzles are.
export async function fetchLibraryPuzzles() {
  const { db, mod } = await getFirestoreClient();
  const q = mod.query(mod.collection(db, COLLECTION), mod.orderBy('createdAt', 'desc'));
  const snap = await mod.getDocs(q);
  const out = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    out.push({ id: docSnap.id, rows: d.rows, cols: d.cols, title: d.title, creatorUid: d.creatorUid });
  });
  return out;
}

// Loads one library puzzle and turns it into a playable Puzzle (see model.js's
// makePuzzle) by re-solving its clues. `source` is left as buildScannedPuzzle's default
// solve-and-validate path produces it ('scan') and then overridden to 'authored' here —
// a puzzle played from the library is a real, permanent puzzle (full move history,
// counts toward stats; see app.js's startPuzzle and src/stats.js's recordCompletion),
// not an ephemeral scan snapshot, even though it's built via the same solver call.
export async function loadLibraryPuzzle(id) {
  const { db, mod } = await getFirestoreClient();
  const snap = await mod.getDoc(mod.doc(db, COLLECTION, id));
  if (!snap.exists()) throw new Error('This puzzle is no longer in the library.');
  const d = snap.data();
  const rowClues = deserializeClues(d.rowClues);
  const colClues = deserializeClues(d.colClues);
  const result = buildScannedPuzzle({
    id: `lib-${id}`,
    name: d.title,
    rows: d.rows,
    cols: d.cols,
    rowClues,
    colClues,
  });
  if (!result.solved) throw new Error("This puzzle's clues no longer solve — it may be corrupted.");
  return { ...result.puzzle, source: 'authored', libraryId: id, creatorUid: d.creatorUid };
}

// Renames a library puzzle's title. Firestore rules restrict this update to the
// original creator and to only the `title` field (see firestore.rules) — the browse UI
// only shows the rename affordance on the signed-in user's own puzzles in the first
// place (see app.js), but the rule is what actually enforces it.
export async function renamePuzzleInLibrary(id, title) {
  const { db, mod } = await getFirestoreClient();
  await mod.updateDoc(mod.doc(db, COLLECTION, id), { title });
}

// ---- Personal solved-puzzle tracking (library-consolidation round — see TODO.md) ----
//
// `users/{uid}/solvedLibraryPuzzles/{puzzleId}` records, per player, which puzzles in the
// merged browse list (app.js merges SAMPLE_PUZZLES + this module's fetchLibraryPuzzles into
// one list) they've solved — keyed by that puzzle's own id, which works the same way for a
// built-in ('heart-5') or a saved library puzzle (Firestore doc id): this collection never
// needs to look the id up against `puzzles/{puzzleId}`, it's just a client-chosen doc id
// under the player's own uid. This is what lets the browse list reveal a puzzle's real name
// once solved (instead of the generic hidden-name placeholder — see app.js's
// renderLibraryList) and show a solved badge + personal times-solved/best-time, and it's
// what the Solved/Unsolved filter reads. Cross-device pairing re-authenticates a second
// device onto the same uid (see src/stats.js's header comment), so this tracks correctly
// across paired devices with no extra logic, exactly like the existing per-size stats do.
//
// Deliberately NOT the same document as `users/{uid}/stats/{size}` — that's bucketed by
// grid size with no per-puzzle identity; this is bucketed by puzzle id with no size
// grouping. Both are written at the same completion point (see app.js's
// maybeShowCompletion) but serve different UI.

// Resolves a Map<puzzleId, { timesSolved, bestTimeMs }> for every library-list puzzle the
// current (or paired) user has ever solved. Throws on failure — the library modal falls
// back to treating every puzzle as unsolved (name hidden, no badge) rather than guessing,
// same "fail soft, don't fake it" pattern as the rest of this module's Firestore calls.
export async function fetchSolvedPuzzles() {
  const user = await ensureSignedIn();
  const { db, mod } = await getFirestoreClient();
  const snap = await mod.getDocs(mod.collection(db, 'users', user.uid, 'solvedLibraryPuzzles'));
  const out = new Map();
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    out.set(docSnap.id, { timesSolved: d.timesSolved || 0, bestTimeMs: d.bestTimeMs ?? null });
  });
  return out;
}

// Called once per genuine completion of a library-list puzzle (see app.js's
// maybeShowCompletion, right alongside src/stats.js's recordCompletion) — increments
// timesSolved and lowers bestTimeMs only if this run genuinely beat it. A scan-origin
// puzzle never has a stable identity worth tracking as "solved" (same reasoning
// recordCompletion already uses to skip it), so it's skipped here too. Resolves true/false
// for whether the write happened; callers don't need to react either way, matching
// recordCompletion's fire-and-forget contract — a failed write must never affect completion
// UI the player already sees.
export async function recordPuzzleSolved(puzzle, timeMs) {
  if (puzzle.source === 'scan') return false;
  try {
    const user = await ensureSignedIn();
    const { db, mod } = await getFirestoreClient();
    const ref = mod.doc(db, 'users', user.uid, 'solvedLibraryPuzzles', puzzle.id);
    // A transaction, not a plain read-then-write, so two solves racing (e.g. two tabs) can't
    // clobber each other's bestTimeMs — mod.increment alone would be safe for timesSolved,
    // but "keep the lower of two times" needs to read before it writes.
    await mod.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const prevBest = snap.exists() ? snap.data().bestTimeMs : null;
      const bestTimeMs = prevBest == null ? timeMs : Math.min(prevBest, timeMs);
      tx.set(ref, { timesSolved: mod.increment(1), bestTimeMs, solvedAt: mod.serverTimestamp() }, { merge: true });
    });
    return true;
  } catch (err) {
    console.warn('recordPuzzleSolved: write failed (offline, not deployed yet, or blocked) — ignoring', err);
    return false;
  }
}
