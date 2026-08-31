# Cloud Functions

Three callables, all deployed from this one `functions/` source:

- **`phraseHint`** (item 7.6): the client (`src/hintPhrasing.js` via `src/firebase.js`) calls
  this with a structured deduction object; the function calls the Anthropic API (holding the
  API key server-side) and returns phrased hint text. If this function isn't deployed yet, or
  the call fails for any reason, the client silently falls back to the deterministic template
  phrasing that was here before — the game is fully playable either way.
- **`createPairingCode`** / **`redeemPairingCode`** (item 4): back cross-device stats pairing.
  See the comment above `createPairingCode` in `index.js` for the design, and
  `../firestore.rules` for the security-rule side. **Not yet deployed or tested against a
  live project** — this needs the same first-deploy care as `phraseHint` did (see "Deploy
  gotchas" in `../TODO.md`), plus two one-time setup steps `phraseHint` didn't need:
  1. Enable **Anonymous** sign-in under Firebase Console → Authentication → Sign-in method.
  2. Deploy Firestore rules too, not just functions: `firebase deploy --only firestore:rules,functions`.

  Both callables need `firebase-admin` (added to `package.json`, run `npm install` — see
  below) for `createCustomToken` and Firestore access from trusted server code, which is a
  different SDK than the client's `firebase-firestore.js`/`firebase-auth.js` (loaded from the
  CDN in `src/firebase.js`) — the two never share code, by design (this project has no
  bundler to share modules between a CommonJS Cloud Function and client ES modules across the
  browser/Node boundary).

## One-time setup

```bash
npm install -g firebase-tools   # if not already installed
firebase login
```

The project is already configured via the repo's `.firebaserc` (`nonogram-pro-e8a31`), so no
`firebase use` step is needed once you're logged in as an account with access to that project.

## Install function dependencies

```bash
cd functions
npm install
```

## Set the LLM API key (Secret Manager, not a plaintext env var)

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

This prompts for the key value and stores it in Secret Manager; `functions/index.js`
references it via `defineSecret('ANTHROPIC_API_KEY')` and it's only ever readable from
inside the deployed function.

## Deploy

Deploy functions and Firestore rules together once `createPairingCode`/`redeemPairingCode`
are in the mix (rules alone are a no-op if the functions that need them aren't deployed, and
vice versa):

```bash
firebase deploy --only functions,firestore:rules
```

(`firebase deploy --only functions` alone is still fine if you're only redeploying
`phraseHint` and the rules are already live from a previous deploy.)

## Verify

- **`phraseHint`**: open the app, use "Get a hint" or "Dig deeper," and confirm the hint text
  sounds LLM-phrased (varied, conversational) rather than the fixed templates. If something's
  misconfigured, open the browser console — `hintPhrasing.js` logs a warning and falls back to
  template text rather than failing silently or throwing.
- **`createPairingCode`/`redeemPairingCode`**: open **Stats & pairing** from the Help menu on
  two different devices/browsers (or two browser profiles), generate a code on one, redeem it
  on the other, and confirm both then show the same merged stats. `src/stats.js`'s functions
  throw with a player-facing message on failure rather than failing silently, so a
  misconfiguration (Anonymous Auth not enabled, rules not deployed, functions not deployed)
  should surface as an error in the pairing modal, not a silent no-op.

## Local test (no deploy needed)

`mergeStatsBucket` (the pairing-redemption merge logic) is pure enough to unit-test without
the Firestore/Auth emulator:

```bash
node functions/test-merge.js
```

## Cost note

Every hint request calls the Anthropic API once. There's no caching or rate limiting here
yet — fine for personal/dev use, worth revisiting before wider release. The pairing
callables don't call any paid API — just Firestore reads/writes and a local
`createCustomToken` call, both covered by Firebase's free tier at this app's scale.
