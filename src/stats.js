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
  // This device's identity is now (about to be) shared — losing it would orphan the other
  // device's view too, so it's worth guarding the same way a redeeming device is.
  ensureSignedIn().then((user) => rememberPairedUid(user.uid)).catch(() => {});
  return data;
}

// Redeems a code generated on another device: re-authenticates this device as that device's
// identity (merging this device's own prior stats into it server-side first — see
// redeemPairingCode in functions/index.js). Resolves true on success; throws with a
// player-facing message otherwise (bad/expired code, offline, not deployed).
export async function redeemPairingCode(code) {
  const redeem = await getCallable('redeemPairingCode');
  const { data } = await redeem({ code });
  const user = await signInWithPairingToken(data.customToken);
  rememberPairedUid(user.uid);
  return true;
}

// ---- Paired-identity guard ----
//
// Real-device report: a paired iPad silently came back as a brand-new, empty identity (root
// cause was ensureSignedIn replacing the paired user — see src/firebase.js's
// resolveSignedInUser). Pairing leaves no record of "this device was paired" anywhere but
// Firebase Auth's own persisted user, so when that got replaced the app had no way to notice
// and just showed an empty stats table as if the player's history were gone.
//
// So a device that has paired remembers the uid it paired as, in localStorage — deliberately
// NOT in Firebase Auth's own storage, so it survives anything that replaces or clears just
// the auth user. On boot, a different current uid means the device lost its paired identity;
// app.js then warns and offers to re-enter a code right there.
//
// Honest limit: a full iOS storage eviction wipes localStorage together with IndexedDB, so
// this cannot detect that case — nothing stored on the device can. It does catch this bug's
// class (auth identity replaced while the rest of storage survives) and a partial clear.
const PAIRED_UID_STORAGE_KEY = 'nonogram.pairedUid';

export function rememberPairedUid(uid) {
  try {
    localStorage.setItem(PAIRED_UID_STORAGE_KEY, uid);
  } catch {
    // localStorage unavailable (private mode) — the guard just can't run on this device
  }
}

export function getRememberedPairedUid() {
  try {
    return localStorage.getItem(PAIRED_UID_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Pure: true only when this device has paired before and is now signed in as someone else.
export function hasLostPairedIdentity(rememberedUid, currentUid) {
  return Boolean(rememberedUid && currentUid && rememberedUid !== currentUid);
}
