// Lazy Firebase client, used only by hintPhrasing.js's LLM phraser (item 7.6). Loaded from
// the CDN as ES modules — no bundler/npm install, matching the rest of this project — and
// only on first use, so importing this module never touches the network by itself (in
// particular, it's inert during `npm test`, which never calls phraseDeduction()).
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

let callablePromise = null;

// Resolves to a callable function: `phraseHint({ deduction }) -> Promise<{ data }>`.
// Initializes the Firebase app + Functions SDK from the CDN the first time it's needed.
export function getPhraseHintCallable() {
  if (!callablePromise) {
    callablePromise = (async () => {
      const [{ initializeApp }, { getFunctions, httpsCallable }] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-functions.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      const functions = getFunctions(app);
      return httpsCallable(functions, 'phraseHint');
    })();
  }
  return callablePromise;
}
