# `phraseHint` Cloud Function

Backs item 7.6: the client (`src/hintPhrasing.js` via `src/firebase.js`) calls this callable
function with a structured deduction object; the function calls the Anthropic API (holding
the API key server-side) and returns phrased hint text. If this function isn't deployed yet,
or the call fails for any reason, the client silently falls back to the deterministic
template phrasing that was here before — the game is fully playable either way.

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

```bash
firebase deploy --only functions
```

## Verify

Open the app, use "Get a hint" or "Dig deeper," and confirm the hint text sounds
LLM-phrased (varied, conversational) rather than the fixed templates. If something's
misconfigured, open the browser console — `hintPhrasing.js` logs a warning and falls back to
template text rather than failing silently or throwing.

## Cost note

Every hint request calls the Anthropic API once. There's no caching or rate limiting here
yet — fine for personal/dev use, worth revisiting before wider release.
