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

let appPromise = null;
function getApp() {
  if (!appPromise) {
    appPromise = import(cdn('app')).then(({ initializeApp }) => initializeApp(firebaseConfig));
  }
  return appPromise;
}

// ---- Callable functions (phraseHint, createPairingCode, redeemPairingCode) ----

let functionsPromise = null;
async function getFunctionsClient() {
  if (!functionsPromise) {
    functionsPromise = (async () => {
      const [app, mod] = await Promise.all([getApp(), import(cdn('functions'))]);
      return { functions: mod.getFunctions(app), mod };
    })();
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
      const [app, mod] = await Promise.all([getApp(), import(cdn('auth'))]);
      return { auth: mod.getAuth(app), mod };
    })();
  }
  return authPromise;
}

let signedInUserPromise = null;

// Resolves once a user (anonymous, or a previously-paired identity) is signed in. Reused
// across calls so multiple modules awaiting "the current uid" share one sign-in attempt
// rather than racing separate signInAnonymously() calls.
export async function ensureSignedIn() {
  if (!signedInUserPromise) {
    signedInUserPromise = (async () => {
      const { auth, mod } = await getAuthClient();
      if (auth.currentUser) return auth.currentUser;
      return new Promise((resolve, reject) => {
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
    })();
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
      const [app, mod] = await Promise.all([getApp(), import(cdn('firestore'))]);
      return { db: mod.getFirestore(app), mod };
    })();
  }
  return firestorePromise;
}
