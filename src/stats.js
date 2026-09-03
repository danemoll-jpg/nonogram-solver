// Cross-device stats + pairing (Current Objective item 4). No accounts, no passwords — each
// device gets its own Firebase Anonymous Auth UID; pairing re-authenticates a second device
// as the first device's UID via a custom token minted server-side (see functions/index.js's
// redeemPairingCode), so afterwards both devices simply *are* the same Firebase user and
// every stats read/write uses the same plain per-uid security rule (see firestore.rules).
//
// Stats are bucketed by exact grid size ("10x10"), per the earlier design pass. A puzzle
// with no stable published id (an unpublished scan or drawing — see model.js's
// hasUnstableId) never counts — see recordCompletion.
//
// Every function here fails soft: stats/pairing are a nice-to-have layered on top of a
// fully-playable offline game, not a requirement for it. A network error, not-yet-deployed
// Cloud Functions, or a blocked/offline device should never interrupt play.

import { ensureSignedIn, getFirestoreClient, getCallable, signInWithPairingToken } from './firebase.js';
import { hasUnstableId } from './model.js';

function sizeKey(rows, cols) {
  return `${rows}x${cols}`;
}

// Called once per genuine puzzle completion (see app.js's maybeShowCompletion). Resolves
// true/false for whether the write actually happened — callers don't need to react either
// way, since a failed stats write must never block or alter the completion UI.
export async function recordCompletion(puzzle, { timeMs, hintsUsed, mistakes }) {
  if (hasUnstableId(puzzle)) return false; // resolved design decision — see TODO.md
  try {
    const user = await ensureSignedIn();
    const { db, mod } = await getFirestoreClient();
    const ref = mod.doc(db, 'users', user.uid, 'stats', sizeKey(puzzle.rows, puzzle.cols));
    await mod.setDoc(
      ref,
      {
        puzzlesSolved: mod.increment(1),
        totalTimeMs: mod.increment(timeMs),
        totalHints: mod.increment(hintsUsed),
        totalMistakes: mod.increment(mistakes),
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.warn('recordCompletion: stats write failed (offline, not deployed yet, or blocked) — ignoring', err);
    return false;
  }
}

// Returns [{ size, puzzlesSolved, avgTimeMs, avgHints, avgMistakes }, ...], sorted by size.
// Throws on failure — callers (the stats modal) show an explanatory message rather than
// silently rendering nothing, since this one's a direct response to the player asking to see
// their stats rather than a background side effect.
export async function fetchAllStats() {
  const user = await ensureSignedIn();
  const { db, mod } = await getFirestoreClient();
  const snap = await mod.getDocs(mod.collection(db, 'users', user.uid, 'stats'));
  const out = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const solved = d.puzzlesSolved || 0;
    out.push({
      size: docSnap.id,
      puzzlesSolved: solved,
      avgTimeMs: solved ? d.totalTimeMs / solved : 0,
      avgHints: solved ? d.totalHints / solved : 0,
      avgMistakes: solved ? d.totalMistakes / solved : 0,
    });
  });
  out.sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }));
  return out;
}

// Generates a short-lived pairing code for *this* device's identity. Resolves
// { code, expiresInSeconds }. Throws on failure (not deployed, offline, etc.) — the pairing
// UI shows the error rather than a silently-blank code.
export async function generatePairingCode() {
  const createPairingCode = await getCallable('createPairingCode');
  const { data } = await createPairingCode();
  return data;
}

// Redeems a code generated on another device: re-authenticates this device as that device's
// identity (merging this device's own prior stats into it server-side first — see
// redeemPairingCode in functions/index.js). Resolves true on success; throws with a
// player-facing message otherwise (bad/expired code, offline, not deployed).
export async function redeemPairingCode(code) {
  const redeem = await getCallable('redeemPairingCode');
  const { data } = await redeem({ code });
  await signInWithPairingToken(data.customToken);
  return true;
}
