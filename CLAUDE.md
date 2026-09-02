# Project Context & Rules

## Tech Stack
- Plain HTML/CSS/JavaScript — no framework, no bundler, no build step. ES modules loaded
  directly via `<script type="module">`, matching the sibling `game-hub` project's pattern
  (`C:\Users\danmo\game-hub` — a separate repo Code can access directly; the nonogram's
  listing there is live at https://dansgamehub.netlify.app/).
- No TypeScript currently; the whole solver and UI are vanilla JS.
- Firebase project (`nonogram-pro-e8a31`) is in active use for Cloud Functions, Anonymous
  Auth, and Firestore. Deployed callables: `phraseHint` (LLM hint phrasing) and
  `createPairingCode`/`redeemPairingCode` (cross-device stats pairing). Firestore also
  backs the puzzle library (`puzzles/{puzzleId}`), per-user solved-puzzle tracking
  (`users/{uid}/solvedLibraryPuzzles/{puzzleId}`), and per-user in-progress puzzle saves
  (`users/{uid}/inProgressPuzzles/{puzzleId}`).
- Deploy target: Netlify, static-site mode. The Netlify site auto-deploys from this
  repo's `main` branch — live at https://nonogrampro.netlify.app/.
- Tesseract.js (OCR, item 10's scan-existing-puzzle flow) is loaded lazily from the CDN
  as an ES module (`src/ocr.js`) — its ESM build has no named exports, only a default
  export bundling everything (`(await import(url)).default`).

## Code Style & Architecture
- Keep the solver's output as plain data ("deductions"), never player-facing text — the
  solver only produces facts; `src/hintPhrasing.js` is the only place that turns a
  deduction into text.
- Each module in `src/` does one job — don't collapse them together.
- Favor small pure functions over classes; `Board` is the one stateful class.
- Comments should explain *why*, especially design tradeoffs.
- No test framework installed — `test/harness.js` is a ~40-line custom runner. Prefer
  differential/property-style tests over hand-picked examples when correctness is
  subtle.
- **Item 10 (scan-existing-puzzle) specifically: prefer testing against a real image
  file over synthetic/guessed pixel data.** See `TODO.md`'s Completed Tasks for the full
  history, including a confirmed real ground-truth reference puzzle
  (`scratch-images/sample-mid-solve.jpg`) reusable for future OCR-accuracy verification.
- **The main scroll bug's diagnosis was overturned by real captures spanning the bug's
  full timeline: it is NOT a stuck `visualViewport.offsetTop`/pan (what rounds 1-3
  targeted) — it's a stuck-shrunk `visualViewport.height` that never recovers to match
  `window.innerHeight`, independent of pan/scroll state.** `window.scrollTo` (every
  earlier round's corrective action) can only affect scroll position, never viewport
  height — it was never capable of fixing this. Round 4 shipped a real, documented
  WebKit viewport-recompute workaround (`healStuckViewportHeight` in `app.js`) targeting
  the height variable directly — **still awaiting real-device verification**, since this
  project's own preview tooling can't reproduce the real iOS bug and five straight prior
  rounds needed real hardware to confirm or refute. Don't assume it's fixed just because
  it's a real technique and passed local testing.
- **Scanned puzzles now auto-publish to the library the moment they're played** (no more
  separate optional "Save to library" step) — this closed the original "Save progress
  does nothing for a scanned puzzle" gap by making a played scan a completely normal
  authored/library puzzle (`source: 'authored'`, a bare Firestore id) with real history,
  Undo, stats, and Incomplete-filter visibility.
- **Real bug found and fixed: `loadLibraryPuzzle` (`src/puzzleLibrary.js`) returned a
  played library puzzle's `id` as `lib-<firestoreId>`, but the browse list's `entry.id`
  (used to look up in-progress/solved state) was always the bare id — so a save/solved
  write for any COMMUNITY puzzle always succeeded, just under a key the UI could never
  find again ("claims success, nothing shows up").** Predates this round; only surfaced
  now because every prior tested save/resume round trip happened to use a built-in
  puzzle, where both ids happen to already match. Neither of the two suspected leads
  (a publish/save race, an optimistic confirmation) was the actual cause — both traced
  and cleared directly. Fixed by dropping the unnecessary `lib-` prefix everywhere;
  verified end-to-end on a community puzzle (not a built-in) in browser preview.
- **Real bug found and fixed: `src/firebase.js` had no timeout anywhere, so a
  silently blocked/stalled Firebase request (ad-blocker/firewall dropping
  `gstatic.com`/Google auth traffic — a real-world cause, not this app's fault) left
  the puzzle library stuck on "Loading…" forever, with the scan-auto-publish flow
  above now exposed to the same risk.** Every cached Firebase promise in that file
  was also never cleared on failure, so one stuck attempt permanently doomed every
  later attempt in the same page session — matching the project owner's own
  confirmation that a full app restart (not just retrying) was what fixed it.
  Fixed: an 8-second `withTimeout` wrapper around every CDN import and the sign-in
  handshake, plus resetting every cache to `null` on failure so a later retry works
  without needing a restart. Verified: the timeout mechanism itself, and the normal
  (non-blocked) happy path unaffected.
- **Real bug found and fixed: repeatedly tapping a toolbar button (reported via the new
  Undo button) triggered iOS Safari's native double-tap-to-zoom gesture.** The shared
  `.btn`/`.mode-btn` classes (`styles.css`) had no `touch-action` set at all. Fixed
  with `touch-action: manipulation` on both — kills double-tap-zoom without touching
  the page's viewport meta tag, so pinch-zoom stays available elsewhere as an
  accessibility aid on large puzzles. Applied to every toolbar/menu button, not just
  Undo, since any rapidly-tapped control is exposed to the same gesture.
- **Real bug found and fixed: dragging across more than a few cells could silently skip
  some, even with the finger never leaving the screen or crossing an already-marked
  cell.** A different bug class from the double-tap-zoom fix above (a plain sampling
  gap, not a gesture conflict) — `pointermove` (`app.js`) only ever painted the single
  cell exactly under the pointer at each event, and a fast swipe over small cells can
  jump more than one cell between samples. Fixed with a Bresenham line-walk
  (`cellsOnLine`) that paints every cell the pointer's path crossed since the last
  sample, not just its final resting point.
- **When a project owner describes a visual bug in plain language, take it literally
  before assuming a more complex/technical cause.** The toolbar-alignment bug took two
  misdiagnosed rounds (chasing a size difference) before the project owner's direct
  correction — "It isn't size, the buttons aren't lined up" — led straight to the real
  cause (a leaked CSS margin) in round 4.

## Commands
- Test: `npm test` (or `node test/run.js`)
- Build: none — it's static files, nothing to build
- Lint: none configured

## Where things stand
**Always check `TODO.md` for the current objective before starting work** — it's kept
more up to date than this file's summary below.

Short version: the full solver/UI stack, the UI consolidation and post-ship bug-fix
passes, the iPad-verification follow-up pass, the clue-number spacing fix, item 10
(scan-existing-puzzle), the per-number clue gray-out fix, the save-to-library
feature, the library-consolidation round, the UI/branding polish round, the
saved/incomplete-puzzle-progress feature, the live drag-fill cell counter, the
toolbar alignment fix, a real geometry bug behind a row-OCR failure (a filled first
row defeating the border-detection heuristic), a focused-input-vs-scroll fix, a
scan-correction numeric-keyboard fix, a repeatable Undo button, a row/column
interaction highlight, making every played scan auto-publish to the library, the
`lib-<id>` key-mismatch bug that broke save/solved tracking for community puzzles,
and the Firebase-hang timeout fix (see above) are all done, deployed, and **confirmed
working on the real device** (not just preview — see `TODO.md`'s Completed Tasks; the
Undo/highlight/auto-publish/key-mismatch/Firebase-timeout set is preview-verified —
including a full save→Incomplete-filter→Resume round trip on a community, non-built-in
puzzle — but not yet real-device-confirmed). The double-tap-zoom fix and the
fast-drag-skips-cells fix (both above) are also done and preview-verified, reported
directly from real iPad use but not yet re-confirmed on-device after the fix. Fully
public library visibility is confirmed as the right model. General OCR digit-level
noise (as opposed to the geometry bug above) has been explicitly accepted as "good
enough for now." See `TODO.md`'s Completed Tasks for the full history.

**Current objective**: waiting on the project owner for real-device verification of
the round-4 scroll-bug fix (`healStuckViewportHeight`) and the two newest fixes above
(double-tap-zoom, fast-drag cell-skipping) — not this round's active build work; the
ball is in the project owner's court to test on real hardware and report back (with
`?debug=scroll` data for the scroll bug specifically).

Item 8 (arbitrary-photo puzzle generation) remains deferred, explicitly deprioritized
by the project owner. Item 9's remaining scope is now just richer browsing (search,
sort, pagination) — the friends-sharing question is resolved.
