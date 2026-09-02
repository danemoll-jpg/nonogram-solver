// Lazy Firebase client. Loaded from the CDN as ES modules — no bundler/npm install,
// matching the rest of this project — and only on first use, so importing this module
// never touches the network by itself (in particular, it's inert during `npm test`).
//
// Used by:
//   - src/hintPhrasing.js (item 7.6) — the phraseHint callable, via getCallable().
//   - src/stats.js (item 4) — Anonymous Auth + Firestore for cross-device stats/pairing.
//
// This is a normal public Firebase web-app config, not a secret — safe to check in (see
// TODO.md). The LLM provider's API key stays server-side, inside the Cloud Function only.
const firebaseConfig = {
  apiKey: 'AIzaSyDGKW2ZrpieqZQuL75XLjIAU0z7vovrnRM',
  authDomain: 'nonogram-pro-e8a31.firebaseapp.com',
  projectId: 'nonogram-pro-e8a31',
  storageBucket: 'nonogram-pro-e8a31.firebasestorage.app',
  messagingSenderId: '537841607435',
  appId: '1:537841607435:web:ec0c35f40f7053ba9db80e',
};

const SDK_VERSION = '10.14.1';
const cdn = (pkg) => `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${pkg}.js`;

// Bug fix (real-device regression — see TODO.md): nothing in this file ever timed out. A CDN
// module import or the Anonymous Auth handshake that stalls instead of cleanly failing (an
// ad-blocker/privacy extension or firewall silently dropping requests to gstatic.com or
// Google's Identity Toolkit is the common real-world cause, not anything specific to this app)
// left every caller's own `.catch()` fallback — and this app has several, e.g. the library
// modal's "Loading…" and the scan wizard's auto-publish-on-play — waiting on a promise that
// would simply never settle, either way. `.catch()` only guards against a REJECTION; it can't
// rescue a hang. `withTimeout` turns "hang forever" into "reject after a few seconds," which
// every existing fallback already knows how to handle correctly.
const NETWORK_TIMEOUT_MS = 8000; // generous for a slow real connection, short enough not to read as "stuck"

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Every dynamic CDN import in this file goes through this, so a blocked/stalled gstatic.com
// request fails the same way a genuine network error would, instead of hanging silently.
function timedImport(url) {
  return withTimeout(import(url), NETWORK_TIMEOUT_MS, `Loading ${url}`);
}

let appPromise = null;
function getApp() {
  if (!appPromise) {
    // Not cached on failure/timeout — see ensureSignedIn's own comment for why a stuck-forever
    // promise must never be the thing callers end up permanently cached against.
    appPromise = timedImport(cdn('app'))
      .then(({ initializeApp }) => initializeApp(firebaseConfig))
      .catch((err) => { appPromise = null; throw err; });
  }
  return appPromise;
}

// ---- Callable functions (phraseHint, createPairingCode, redeemPairingCode) ----

let functionsPromise = null;
async function getFunctionsClient() {
  if (!functionsPromise) {
    functionsPromise = (async () => {
      const [app, mod] = await Promise.all([getApp(), timedImport(cdn('functions'))]);
      return { functions: mod.getFunctions(app), mod };
    })().catch((err) => { functionsPromise = null; throw err; });
  }
  return functionsPromise;
}

// Resolves to a callable function: `theCallable(data) -> Promise<{ data }>`.
export async function getCallable(name) {
  const { functions, mod } = await getFunctionsClient();
  return mod.httpsCallable(functions, name);
}

// Back-compat name for the original single-purpose accessor (src/hintPhrasing.js).
export function getPhraseHintCallable() {
  return getCallable('phraseHint');
}

// ---- Auth (item 4: cross-device stats + pairing) ----
//
// Every device gets its own anonymous UID by default (ensureSignedIn). Redeeming a pairing
// code re-authenticates as the *other* device's UID via a custom token minted by the
// redeemPairingCode Cloud Function (see functions/index.js) — after that, both devices are
// simply the same Firebase Auth user, so no special merge-aware security rules are needed.

let authPromise = null;
async function getAuthClient() {
  if (!authPromise) {
    authPromise = (async () => {
      const [app, mod] = await Promise.all([getApp(), timedImport(cdn('auth'))]);
      return { auth: mod.getAuth(app), mod };
    })().catch((err) => { authPromise = null; throw err; });
  }
  return authPromise;
}

let signedInUserPromise = null;

// Resolves once a user (anonymous, or a previously-paired identity) is signed in. Reused
// across calls so multiple modules awaiting "the current uid" share one sign-in attempt
// rather than racing separate signInAnonymously() calls.
//
// Bug fix (real-device regression — see TODO.md): the sign-in handshake below has no natural
// timeout of its own — onAuthStateChanged only ever fires again once signInAnonymously's
// underlying network request actually completes, so a silently blocked/stalled request (see
// this file's header comment) left this promise pending forever. Wrapped in withTimeout so it
// reliably rejects instead — and NOT cached on failure (the previous version's `if
// (!signedInUserPromise)` guard would otherwise have permanently pinned every future call to
// the one timed-out attempt for the rest of the page's life, even if the underlying block was
// only transient), so a later retry (e.g. reopening the library, pressing Save progress again)
// gets a genuine fresh attempt.
export async function ensureSignedIn() {
  if (!signedInUserPromise) {
    signedInUserPromise = (async () => {
      const { auth, mod } = await getAuthClient();
      if (auth.currentUser) return auth.currentUser;
      const signInAttempt = new Promise((resolve, reject) => {
        const unsubscribe = mod.onAuthStateChanged(
          auth,
          (user) => {
            if (user) {
              unsubscribe();
              resolve(user);
            }
          },
          (err) => {
            unsubscribe();
            reject(err);
          }
        );
        mod.signInAnonymously(auth).catch((err) => {
          unsubscribe();
          reject(err);
        });
      });
      return withTimeout(signInAttempt, NETWORK_TIMEOUT_MS, 'Anonymous sign-in');
    })().catch((err) => { signedInUserPromise = null; throw err; });
  }
  return signedInUserPromise;
}

// After redeemPairingCode's Cloud Function mints a custom token for the *other* device's
// uid, sign in with it here — this device's Firebase Auth identity becomes that uid from
// this point on, for this call and every future one (persisted by the SDK like any sign-in).
export async function signInWithPairingToken(customToken) {
  const { auth, mod } = await getAuthClient();
  const cred = await mod.signInWithCustomToken(auth, customToken);
  signedInUserPromise = Promise.resolve(cred.user);
  return cred.user;
}

// ---- Firestore (item 4) ----

let firestorePromise = null;
export async function getFirestoreClient() {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const [app, mod] = await Promise.all([getApp(), timedImport(cdn('firestore'))]);
      return { db: mod.getFirestore(app), mod };
    })().catch((err) => { firestorePromise = null; throw err; });
  }
  return firestorePromise;
}
