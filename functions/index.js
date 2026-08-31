// Cloud Functions for the nonogram app:
//   - phraseHint (item 7.6): takes the structured "deduction" object the solver already
//     produces (src/hintPhrasing.js on the client) and asks an LLM to phrase it as a short,
//     conversational hint. The LLM API key lives only here (as a Secret Manager secret,
//     never in client code or source control) — see functions/README.md for deploy steps.
//   - createPairingCode / redeemPairingCode (item 4): cross-device stats pairing. See the
//     comment above createPairingCode for the design.
//
// All three are callable (not raw HTTPS endpoints) so the client gets request/response
// marshalling, auth-context propagation, and CORS handling for free via the Firebase SDK
// (see src/firebase.js).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are a friendly, experienced nonogram (picross) solver helping a
player who is stuck. You'll be given one structured deduction describing a single forced
move the solver already computed — your only job is to phrase it in natural, varied,
conversational language, the way an experienced human solver would explain their reasoning
out loud.

Rules:
- 1-2 sentences. No preamble, no restating these instructions, no markdown.
- Explain the *reasoning*, not just the answer — reference the clue numbers and cells
  described, so the player learns the technique, not just this one move.
- Rows and columns are already given 1-indexed for display — use those numbers as-is.
- If the technique is "mistake", gently explain what's wrong, not how to fix everything else.
- Never mention anything beyond the single deduction you're given — no spoilers about the
  rest of the board.`;

exports.phraseHint = onCall({ secrets: [anthropicApiKey], cors: true }, async (request) => {
  const deduction = request.data?.deduction;
  if (!deduction || typeof deduction !== 'object' || typeof deduction.technique !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected { deduction: { technique, ... } }.');
  }

  const apiKey = anthropicApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY secret is not configured.');
  }

  const prompt = describeDeduction(deduction);

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    throw new HttpsError('unavailable', `Could not reach the LLM API: ${err.message}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new HttpsError('internal', `LLM API returned ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.content?.find((block) => block.type === 'text')?.text?.trim();
  if (!text) {
    // TEMPORARY DIAGNOSTIC (see TODO.md's Current Objective) — remove once the root cause of
    // "LLM response had no text content" is found and fixed. Logs the full response so we can
    // see what Anthropic actually sent back (e.g. an error object, a refusal, a different
    // block shape) instead of just the fact that no text block was found.
    console.error('phraseHint: no text block in Anthropic response', {
      status: response.status,
      data,
    });
    throw new HttpsError('internal', 'LLM response had no text content.');
  }

  return { text };
});

// ---- deduction -> plain-language prompt (mirrors src/hintPhrasing.js's defaultPhraser,
// but describes the facts for the LLM to phrase rather than picking a fixed template) ----

function describeLine(line) {
  if (!line) return null;
  const label = line.type === 'row' ? 'Row' : 'Column';
  return `${label} ${line.index + 1}`;
}

function describeClue(clue) {
  if (!clue || clue.length === 0) return '(empty — the whole line is blank)';
  return `[${clue.join(', ')}]`;
}

function describeCells(cells) {
  if (!cells || cells.length === 0) return 'none';
  return cells.map((c) => `(row ${c.row + 1}, col ${c.col + 1})`).join(', ');
}

function describeDeduction(deduction) {
  const { technique, line, reasoningCells, resultCells, resultState, meta = {} } = deduction;
  const lines = [
    `technique: ${technique}`,
    `line: ${describeLine(line) ?? 'n/a'}`,
    `clue for that line: ${describeClue(meta.clue)}`,
    `line length: ${meta.length ?? 'n/a'}`,
    `reasoning cells (already-known marks the deduction relies on): ${describeCells(reasoningCells)}`,
    `result cells (what the player should mark now): ${describeCells(resultCells)}`,
    `result state to mark them: ${resultState}`,
  ];
  if (technique === 'edge') lines.push(`matched run length: ${meta.runLength}`);
  if (technique === 'contradiction') {
    lines.push(`hypothesis that was tried and failed: ${meta.hypothesis}`);
    lines.push(`so the cell is forced to: ${meta.forced}`);
  }
  if (technique === 'mistake') {
    lines.push(`the player marked it: ${meta.markedAs}`);
    lines.push(`it should be: ${meta.shouldBe}`);
  }
  return lines.join('\n');
}

// ---- Cross-device stats pairing (item 4) ----
//
// No accounts, no passwords — matches the pairing pattern from the project owner's other
// app (Worldly). Each device signs in with Firebase Anonymous Auth on its own (client-side,
// see src/firebase.js's ensureSignedIn) and gets its own UID. Rather than trying to merge
// two separate Firebase Auth identities (not really a supported operation), pairing instead
// re-authenticates the *second* device as the *first* device's UID via a custom token minted
// here with the Admin SDK — after that, both devices are simply the same Firebase user, so
// the client-facing Firestore rule for stats (firestore.rules) stays a plain
// `request.auth.uid == uid` check with no merge-aware special-casing needed.
//
// Resolved open questions from TODO.md:
//   - Code expiry: 10 minutes (PAIRING_CODE_TTL_MS below) — long enough to type a code from
//     one device to another, short enough that a stale/abandoned code isn't a lingering way
//     to attach a random device to someone's stats.
//   - Merging pre-existing stats on redemption: sum the cumulative counters bucket-by-bucket
//     (mergeStatsBucket) — puzzlesSolved/totalTimeMs/totalHints/totalMistakes are all
//     running totals, so summing is lossless and the natural combination (unlike, say, a
//     "longest streak" field, which would need max instead — not a concern here since no
//     such field exists yet).
//   - Visibility: player-only for now — these functions don't expose stats to anyone but the
//     owning UID. Friend-visible stats are item 9's concern, not this one's.

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Excludes 0/O/1/I — characters easy to misread/mistype when copying a code by eye.
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPairingCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PAIRING_CODE_ALPHABET[Math.floor(Math.random() * PAIRING_CODE_ALPHABET.length)];
  }
  return out;
}

exports.createPairingCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const uid = request.auth.uid;

  // Collision-check against live (non-expired-looking) codes; a handful of retries is
  // plenty at this codespace size (32^6) and low expected concurrent-code volume.
  let code = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = randomPairingCode();
    const existing = await db.collection('pairingCodes').doc(candidate).get();
    if (!existing.exists) code = candidate;
  }
  if (!code) throw new HttpsError('internal', 'Could not generate a unique pairing code — try again.');

  const now = Date.now();
  await db.collection('pairingCodes').doc(code).set({
    uid,
    createdAt: now,
    expiresAt: now + PAIRING_CODE_TTL_MS,
  });

  return { code, expiresInSeconds: PAIRING_CODE_TTL_MS / 1000 };
});

// Pure and side-effect-free so it's unit-testable without Firestore/Admin — see
// functions/test-merge.js (`node functions/test-merge.js`).
function mergeStatsBucket(a = {}, b = {}) {
  return {
    puzzlesSolved: (a.puzzlesSolved || 0) + (b.puzzlesSolved || 0),
    totalTimeMs: (a.totalTimeMs || 0) + (b.totalTimeMs || 0),
    totalHints: (a.totalHints || 0) + (b.totalHints || 0),
    totalMistakes: (a.totalMistakes || 0) + (b.totalMistakes || 0),
  };
}
exports.mergeStatsBucket = mergeStatsBucket;

exports.redeemPairingCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const fromUid = request.auth.uid;
  const code = typeof request.data?.code === 'string' ? request.data.code.trim().toUpperCase() : '';
  if (!code) throw new HttpsError('invalid-argument', 'Expected { code }.');

  const codeRef = db.collection('pairingCodes').doc(code);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) throw new HttpsError('not-found', 'That code is invalid or already used.');

  const { uid: toUid, expiresAt } = codeSnap.data();
  if (Date.now() > expiresAt) {
    await codeRef.delete();
    throw new HttpsError('deadline-exceeded', 'That code has expired — generate a new one.');
  }

  if (toUid !== fromUid) {
    // Merge fromUid's existing stats into toUid's, then drop fromUid's copies so they can
    // never be double-counted (e.g. if this ever ran twice for the same pair of devices).
    const fromStatsSnap = await db.collection('users').doc(fromUid).collection('stats').get();
    const batch = db.batch();
    for (const doc of fromStatsSnap.docs) {
      const toRef = db.collection('users').doc(toUid).collection('stats').doc(doc.id);
      const toSnap = await toRef.get();
      batch.set(toRef, mergeStatsBucket(toSnap.exists ? toSnap.data() : {}, doc.data()));
      batch.delete(doc.ref);
    }
    batch.delete(codeRef);
    await batch.commit();
  } else {
    await codeRef.delete(); // redeeming your own code — nothing to merge, just clean up
  }

  const customToken = await getAuth().createCustomToken(toUid);
  return { customToken };
});
