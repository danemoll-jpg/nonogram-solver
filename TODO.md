Active Development Plan

Completed Tasks

* Data model — cell states, clue derivation, `Board` w/ move history (`src/model.js`)
* Line-solving engine: overlap, edge/completion, general/gap-forcing + cross-line propagation (`src/lineSolver.js`, `src/solver.js`)
* Hint orchestration — one structured deduction per technique application
* Mistake handling: auto-check, on-demand check w/ undo-to-point, remove-bad-marks (`src/mistakes.js`)
* On-demand contradiction search for genuinely stuck states (`src/contradiction.js`)
* Full playable UI — click/right-click/drag marking, clue graying, hint highlighting (`index.html`, `app.js`, `styles.css`)
* 425-test suite, incl. a brute-force differential test of the line solver
* `CLAUDE.md` project context file
* **Item 7 — puzzle UI refinement pass.** All six sub-items landed:
  1. Fill/Mark-empty mode toggle in the toolbar (`#mode-fill` / `#mode-x`), replacing
     right-click/long-press. Click applies the active mode's mark, clears it if already set;
     drag paints using whatever the first cell in the drag did. See `app.js`'s
     `attachPointerHandlers`.
  2. 5×5 grid chunking — thicker border every 5 rows/cols, computed from actual row/col
     index in `app.js`'s `renderBoard` (not `nth-child`, which doesn't line up once clue
     cells are counted as siblings) and rendered via `.chunk-col-end` / `.chunk-row-end` in
     `styles.css`.
  3. Solver-based auto-X on line completion — `app.js`'s `autoXCellsFor`, using
     `isLineSatisfied`'s exact run-comparison (not a fill-count check). Batched into the
     triggering move via the model's new `Board.setBatch` (one history entry for
     multiple cells), so undo-to-point removes a move's auto-X marks along with it.
     (Originally only ran on manual marking, not the hint-application path — fixed in the
     UI consolidation pass below.) Line locking was later added on top of this — see the
     "Post-ship bug fixes" entry below — auto-X itself is unchanged.
  4. Auto-check mistake pop-up anchored to the board panel (`#mistake-popup` /
     `.mistake-popup` in `index.html` / `styles.css`) with Dismiss and Learn More; Learn
     More reuses the existing on-demand-check flow (`runOnDemandCheck` in `app.js`, backed
     by `mistakes.js`) rather than a new explanation path.
  5. Puzzle-complete modal (`#complete-modal`) showing time taken, hints used, and mistakes
     made — all derived from `board.history` at completion time (`computeCompletionStats`
     in `app.js`): hint-originated moves are tagged `source: 'hint'` (by `app.js`'s
     `applyHintDeduction`), and any historical cell-write that disagreed with the solution
     counts as a caught mistake. No new persistence or live counters needed.
  6. Real LLM-backed hint phrasing — `src/hintPhrasing.js` now calls a Firebase Cloud
     Function (`functions/index.js`, callable `phraseHint`) via `src/firebase.js`, falling
     back to the old deterministic template if the call fails for any reason (offline, not
     yet deployed, transient error) so hints never go missing. **The function is written but
     not yet deployed — deploying it is the Current Objective below.**
* **UI consolidation pass + auto-X-on-hint fix.** All three sub-items landed:
  1. Single "Help" dropdown (`#help-menu-btn` / `#help-menu-list`) replaces the old
     always-visible "Hints & help" / "Mistakes" side panels — those pushed content offscreen
     in portrait. Menu items: How to play, Get a hint, Check my work, Remove bad marks,
     Clear all (relocated Reset, confirm-gated — see fix below). "Dig deeper" stays a
     conditional follow-up button next to the explanation panel, not a menu item.
  2. Persistent bottom-anchored explanation panel (`#explain-panel`, `setExplain()` in
     `app.js`) — `position: fixed` to the viewport bottom, `body` reserves matching
     `padding-bottom`. One shared surface for hint reasoning and mistake explanations.
  3. Auto-X now runs on the hint path too, via `app.js`'s `withAutoX(changes)` /
     `applyHintDeduction` — both manual marks and hint deductions batch into one history
     entry so undo-to-point works for either. `solver.js`'s `applyDeduction` is untouched
     (still used by `solveToFixpoint`), per CLAUDE.md's "solver only produces facts" rule.
* **Post-ship bug fixes: Clear All, stray scroll/TODO text, line locking, and red
  (contradiction) numbers.** All four landed:
  1. **Fixed: "Clear all" did nothing.** Root cause was `window.confirm()` itself — several
     real browser/embedded-webview contexts silently auto-dismiss it (returns `false`, no
     dialog shown), which looks identical to "broken" rather than "not yet confirmed."
     Replaced with an in-page confirm dialog (`#confirm-modal`, `showConfirm()` in `app.js`),
     styled like the existing How-to-play/Complete modals — no dependency on a native dialog
     that can be silently suppressed.
  2. **Fixed: stray "TODO" text.** Was the page footer (`<footer class="footer">...on the
     roadmap — see README.md.</p></footer>` in `index.html`) — an internal dev note in
     player-facing UI, pointing at a file players don't have. Deleted, along with its now-
     unused `.footer` CSS. The unwanted-auto-scroll half didn't reproduce (no
     `scrollIntoView()`/`.focus()`/`autofocus` anywhere in the codebase); removing the
     footer removes one plausible scroll target regardless. **Re-open with repro steps
     (which puzzle, which action) if scrolling resurfaces.**
  3. **Added line locking on top of auto-X.** `isLineLocked(line, clue)` (`src/model.js`) =
     `isLineSatisfied` **and** fully marked (no UNKNOWN cells left) — satisfied alone isn't
     enough, since an empty clue (`[]`) reads as "satisfied" from its first all-UNKNOWN
     render, which would otherwise lock it before the player can X it out (regression-tested
     in `test/model.test.js`). Computed live off the board every render, same as
     `isLineSatisfied` — no persistent lock flag to keep in sync. `paintCell` blocks any
     change to a cell in a locked line, except clearing an existing FILLED cell back to
     UNKNOWN, which also reverts that line's auto-X'd cells (tracked in a new UI-local
     `autoXCells` set, distinguishing "auto-X put this here" from "the player deliberately
     X'd this") back to UNKNOWN in the same batched move — a deliberate manual X survives,
     an auto-X'd one doesn't.
  4. **Added red clue numbers for genuine contradictions.** Reused `isLineConsistent`
     (`src/lineSolver.js`, already a DP-based feasibility check, not brute force — was
     already exported but only used internally by `generalLineSolve`) — wired into
     `app.js`'s `syncAllCellVisuals` as a `.contradiction` class (red, `var(--danger)`) on
     the clue element. Confirmed a red line and a locked line never co-occur (as expected
     by construction), and red clears once the line becomes consistent again. Feedback
     only — never blocks the move that caused it.

  **Existing Firebase project config** (already created; used by `src/firebase.js` for the
  Cloud Function client, and later for Auth/Firestore in item 9):
  ```js
  const firebaseConfig = {
    apiKey: "AIzaSyDGKW2ZrpieqZQuL75XLjIAU0z7vovrnRM",
    authDomain: "nonogram-pro-e8a31.firebaseapp.com",
    projectId: "nonogram-pro-e8a31",
    storageBucket: "nonogram-pro-e8a31.firebasestorage.app",
    messagingSenderId: "537841607435",
    appId: "1:537841607435:web:ec0c35f40f7053ba9db80e"
  };
  ```
  Note: this config's `apiKey` is a normal public Firebase web-app identifier, not a secret
  — safe to check in. The LLM provider's API key is the one that must stay server-side
  inside the Cloud Function only.

Current Objective (Focus Area)

* **iPad verification: done, surfaced four items to address.** The app loads and plays
  correctly on iPad (Cloud Function + Netlify deploy confirmed working end-to-end). Playing
  it surfaced the four items below.

  1. **Hide the puzzle's name until completion.** Currently the puzzle name is shown during
     play, which gives away too much when the player is trying to figure out what image
     they're building. Show a generic placeholder during play (e.g. "Puzzle — 10×10"
     instead of the real name), and reveal the actual name in the completion modal
     alongside the existing stats (time, hints, mistakes).

  2. **Grid should scale to fill available screen space.** Currently undersized. The board
     should scale up to fill the available viewport while keeping cells square (no
     distortion) — account for the fixed-height Help/toolbar area and the persistent
     bottom explanation panel so the scaled board doesn't overlap either, and confirm this
     works in both portrait and landscape.

  3. **Sound effects.** Eight distinct audio assets needed. **Split into two tracks so work
     can proceed in parallel:**
     - **Build plumbing now, against placeholder/silent audio.** Code should wire up
       playback triggers, the file-loading structure, and the persistent mute toggle
       without waiting for real audio files. Expected filenames (project owner is
       generating these via ElevenLabs separately): `fill-click.mp3`, `x-click.mp3`,
       `batch-complete-chime.mp3`, `error.mp3`, `complete-fanfare.mp3`, `lock.mp3`,
       `unlock.mp3`, and `drag-sweep.mp3` (placeholder for now — see below). Suggested
       location: `assets/sounds/`.
     - **Drag-sweep needs a prototype decision first, before the project owner generates
       that one file.** Code should try both playback approaches with a placeholder sound
       — (a) a single sample stretched/scaled across the drag's duration, or (b) fast
       per-cell notes triggered as the drag crosses each cell, quick enough to blend into a
       run — and report back which feels better (or if neither does) so the project owner
       knows what kind of asset to actually generate (one long glissando sample vs. a short
       repeatable note). Don't finalize `drag-sweep.mp3` until this is resolved.
     - Trigger points: fill-click (manual fill), x-click (manual X), drag-sweep
       (click-and-drag across cells), batch-complete-chime (auto-X or a hint completing
       multiple cells at once — same sound for both), error (shared by both an
       auto-check-caught mistake and a line turning red/contradiction), complete-fanfare
       (full puzzle solve), lock (a row/column becomes fully marked and locks — item
       "Post-ship bug fixes" #3 in Completed Tasks), unlock (a fill is cleared and the line
       becomes editable again). Confirm lock/unlock don't fire redundantly alongside
       batch-complete-chime when a line locks via auto-X finishing it in the same action —
       likely want lock to play instead of (or immediately after) batch-complete-chime in
       that case, not both stacked, for review once both exist.
     - **Persistent mute toggle** — its own control, separate from the Help dropdown, state
       saved across sessions (e.g. localStorage), defaulting to unmuted.

  4. **Cross-device stats sync via pairing code (Worldly-style).** No accounts, no
     passwords — one device generates a short code, entering that code on a second device
     links the two to the same underlying identity, matching the pattern used in the
     project owner's other app (Worldly). Maps naturally onto **Firebase Anonymous Auth**:
     each device gets its own anonymous UID by default; "generate a code" creates a
     short-lived Firestore record mapping a random code to that device's UID; entering the
     code on a second device looks up the record and re-points/merges that device onto the
     same underlying user record going forward. This pulls the **stats + pairing** piece
     out of item 9 and scopes it as its own near-term item — it does not need to wait for
     the rest of item 9 (puzzle library, sharing, etc.). Per the earlier design pass, stats
     are bucketed by exact grid size (puzzles solved, avg completion time, avg hints used).
     **Resolved: a puzzle imported via item 10's scan/photo flow (a snapshot of an
     already-partially-filled puzzle) never counts toward stats** — the whole point of that
     import path is getting unstuck on a puzzle already in progress, so tracking it as a
     fast/hint-heavy solve would misrepresent the player's actual skill. If the player
     separately saves that puzzle to their own library and plays it again from a blank
     start, that fresh playthrough counts normally, same as any other in-app puzzle.
     Remaining open questions to settle before/while building: does a linking code expire,
     and after how long; if two devices already have independent stats history before
     linking, how do they merge (sum, keep the longer history, ask the user); is this
     visible to the player only, or does it tie into future friend-visible stats from item
     9.

  Items 1–2 are UI-only. Item 3 is UI wiring, blocked on audio files from the project
  owner. Item 4 is new Firebase/Firestore infrastructure (Anonymous Auth + a pairing-code
  collection) — the first real Firestore usage in the app, ahead of the rest of item 9.

Next Steps (Do Not Start Yet)

* **Item 10 — Scan-existing-puzzle flow.** Rescoped to be self-contained rather than
  dependent on item 8: reading an already-printed/existing puzzle (real grid lines, printed
  clue numbers already visible in the photo) is closer to the "already-structured image"
  case than the "arbitrary photo, threshold and guess" case — so this item brings its own
  minimal grid-detection with it instead of waiting on item 8's harder image-processing
  work. Scope: detect the existing grid from a photo/scan, OCR the printed clue numbers,
  and a user-correction step for anything misread — feeding the result into the existing
  hint/solver system as a snapshot-origin puzzle (no move history, per the earlier
  mistake-handling design). This is now the next roadmap item after the current deploy
  objective above, per the project owner.
* Item 8 — Photo → puzzle generation (arbitrary photo, thresholded/downsampled grid; the
  pre-pixelated/blocky-image direct-mapping path may now overlap with item 10's grid
  detection — worth revisiting whether these share code once item 10 exists). Still open:
  is grid size user-adjustable at generation time or fixed per image; slider vs. automatic
  threshold/contrast tuning; reject, flag, or allow non-unique-solution puzzles (solver can
  validate uniqueness once generation exists).
* Item 9 — Firestore schema + shared library UI: puzzle storage, browsing, and a
  friends/share-by-code model. Schema and permissions are undesigned. The stats-tracking
  and cross-device pairing piece has been pulled out into the Current Objective above as
  its own near-term item (including the now-resolved question of scanned puzzles never
  counting toward stats) — what's left here is the library/sharing side: puzzle storage,
  browsing, and whether stats become visible to friends.

Technical Notes / Blockers

* `phraseDeduction()` in `src/hintPhrasing.js` now calls the `phraseHint` Cloud Function
  (`functions/index.js`) by default, with `defaultPhraser`'s old deterministic templates kept
  as the fallback for when that call fails — see the comment at the top of that file.
* Firebase project exists (`nonogram-pro-e8a31`) — config above. `firebase.json` /
  `.firebaserc` at the repo root scope Firebase to Functions only (deploy target for the
  static site stays Netlify). Auth/Firestore for item 9 come later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* **Node.js 20 runtime deprecation — time-boxed fast-follow, not urgent today but do before
  2026-10-30.** `functions/package.json` pins `"engines": { "node": "20" }`. Node 20 was
  deprecated 2026-04-30 and is fully decommissioned 2026-10-30 (Google may stop accepting
  deploys on it, or disable functions still on it, after that date). Deploys still work
  fine today. Fix: bump `"engines"` to `"22"`, and run `npm install --save
  firebase-functions@latest` inside `functions/` (the deploy log has warned this package is
  outdated too, and warns of possible breaking changes on upgrade — re-test the hint flow
  after, don't assume it still works). Do this alongside any other planned redeploy rather
  than as a standalone deploy, to avoid a repeat of the IAM/build surprises hit during the
  initial Cloud Function deploy (see Completed Tasks).
* Firestore security rules: **not** needed for the hint-phrasing function — it doesn't
  read/write Firestore. Real rules design (who can read/write puzzle documents, per-user
  stats write access, etc.) belongs to item 9 when it's scoped. Update `firestore.rules` only
  if/when Code identifies an actual read/write need.
* Hint phrasing has an invisible-by-design fallback (real LLM call → deterministic template
  on any failure), which means "a hint appeared" is not proof the LLM call actually
  succeeded — a request once failed silently this way during initial deploy (see deploy
  gotchas in Completed Tasks) and only surfaced via the browser console, not via any visible
  player-facing symptom. **When verifying hint phrasing after any future Cloud Function
  change, check the console/Cloud Function logs, not just that a hint shows up.**
* A diagnostic `console.error(response.status, JSON.stringify(data))` is deliberately left
  in `functions/index.js` on the "LLM response had no text content" error path, as a
  tripwire in case that failure recurs — harmless, only logs on that one path. As of
  2026-08-30 it has not fired again since the clean redeploy; root cause (likely a stale
  build revision from the messy multi-stage first deploy) is a reasonable best guess but was
  never 100% confirmed. If it fires again, check Cloud Function logs (Firebase Console →
  phraseHint → Logs, or `firebase functions:log`) for the exact payload before assuming the
  same fix applies.