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

* **Post-iPad-verification pass: puzzle-name reveal, responsive board sizing, sound
  plumbing, and cross-device stats/pairing.** All four coded and tested against a local
  static server; two need a manual Firebase deploy/console step before they work live (see
  the Current Objective below) — everything else works today.
  1. **Puzzle name hidden until completion.** `#puzzle-select` now shows `Puzzle N — RxC`
     (`app.js`'s `populatePuzzleSelect`) instead of `puzzle.name`; the real name is revealed
     as a new row in the completion modal (`#stat-name`) once there's no picture left to
     spoil. Verified end-to-end (solved Heart 5x5, modal showed "Puzzle: Heart (5x5)").
  2. **Grid scales to fill available screen space.** `app.js`'s `fitBoardToViewport`
     measures live layout (board-root's top position and width, the explain panel's actual
     current height, the status line and board-panel's own padding) rather than fixed
     breakpoints, and picks the largest square cell size (clamped 18–64px) that fits both
     the puzzle's width and height budget — driven through one `--cell-size` CSS variable
     (`styles.css`) that clue font-size and the ✕ mark also scale off of. Re-fits on
     window resize/orientation change (debounced) and whenever the explain panel's content
     (and therefore height) changes. Verified at multiple viewport sizes and both a 5×5 and
     10×10 puzzle in the Browser preview — old fixed-breakpoint small-screen CSS override
     removed since it would have fought the dynamic sizing.
  3. **Sound-effect plumbing**, built against placeholder silent audio
     (`assets/sounds/*.mp3` — see `assets/sounds/README.md`; drop real files in at the same
     names, no code changes needed). `src/sounds.js` holds playback + the persistent mute
     toggle (`#mute-toggle`, `localStorage`-backed, defaults unmuted); `app.js` wires all
     eight trigger points, including the priority rule for not stacking `lock` and
     `batchCompleteChime` when auto-X completing a line also locks it (see
     `applyMoveWithSound`'s comment — lock always wins, since `isLineLocked` is a superset
     of what triggers auto-X). Verified via a full manual solve (fill/x-click/lock/complete
     all fired without console errors) and a multi-cell hint (batch-complete-chime path).
     **Drag-sweep prototype — resolved: go with 'retrigger'.** Both approaches from the
     original write-up are implemented in `src/sounds.js` (switch via `?dragSweep=stretch`
     for a side-by-side listen); **retrigger is recommended and wired as the default.**
     Reasoning: it scales naturally with drag speed and cell count (more cells crossed per
     second just means more overlapping retriggers) with no pitch/tempo distortion, matching
     the standard pattern for this kind of feedback (scroll ticks, minesweeper flood-fill).
     'stretch' can only start/stop a fixed-length sample with the stroke — it doesn't
     actually track drag speed without real time-stretching, a much bigger asset-pipeline
     lift than this warrants. **Ask for `drag-sweep.mp3` as a short, cleanly-loopable
     tick/scrape sample** (not a long glissando) — that's what 'retrigger' expects.
  4. **Cross-device stats + pairing.** `src/stats.js` (client) + two new callables in
     `functions/index.js` (`createPairingCode`, `redeemPairingCode`, using `firebase-admin`
     for `createCustomToken` + Firestore) + `firestore.rules` (new — per-uid stats access
     only; pairing codes are Admin-SDK-only, locked to the client entirely). Design:
     Anonymous Auth per device; pairing re-authenticates the second device as the first
     device's uid via a minted custom token (rather than trying to merge two separate
     Firebase Auth identities), so ordinary per-uid security rules just work afterward with
     no merge-aware special-casing. **Resolved open questions:** code expiry 10 minutes;
     pre-existing stats on redemption are summed bucket-by-bucket (cumulative counters, so
     lossless — see `mergeStatsBucket`, unit-tested in `functions/test-merge.js`); visibility
     stays player-only (friend-visible stats remain item 9's concern). New "Stats & pairing"
     Help-menu item opens a modal with the stats table and generate/redeem-code UI.
     **Verified failing gracefully, not yet verified working live** — tested against the
     real `nonogram-pro-e8a31` project with nothing deployed yet: `fetchAllStats` and
     `generatePairingCode` both surfaced clear in-modal errors
     (`auth/configuration-not-found`, then a CORS/404 once past that) instead of crashing or
     hanging, and a puzzle solve's `recordCompletion` call failed the same way silently in
     the console without affecting the completion modal — see Current Objective below for
     the deploy + enable-Anonymous-Auth steps needed to actually test the live path.
  5. **Node.js 20→22 runtime bump — bundled into this pass as requested**, since it already
     touched `functions/`. `functions/package.json`: `engines.node` now `"22"`; ran
     `npm install firebase-functions@latest firebase-admin@latest` (also needed fresh for
     item 4 above) — picked up `firebase-functions@^7.3.2` and `firebase-admin@^14.3.0`.
     **Breaking change hit and fixed**: `firebase-admin` v12+ dropped the old
     `admin.firestore()`/`admin.auth()` namespaced API from the default import — switched
     `functions/index.js` to the modular `firebase-admin/app`, `firebase-admin/firestore`,
     `firebase-admin/auth` imports. Re-tested via `node functions/test-merge.js` (passes) —
     **`phraseHint`'s actual LLM call path is untested against this dependency bump** since
     that needs a live deploy; re-verify hint phrasing after deploying, per the existing
     "check console/logs, not just that a hint shows up" guidance below.

Current Objective (Focus Area)

* **Deploy is done; re-confirm pairing works, then generate real audio.** Deploy steps
  actually taken: Anonymous sign-in enabled in the Firebase console; `functions` deployed via
  `firebase deploy --only functions` (`phraseHint`, `createPairingCode`, and
  `redeemPairingCode` all live); a Firestore database was created (it didn't exist before —
  this project had only ever used Functions/Auth) and `firestore.rules` published through the
  console's Rules tab (pasting the CLI command's rules-file content works the same as
  `firebase deploy --only firestore:rules`).
  1. **Hit and fixed: IAM permissions gap.** `createPairingCode` first failed with a generic
     client-side "internal" error; `firebase functions:log` showed the real cause —
     `7 PERMISSION_DENIED: Missing or insufficient permissions` from the Firestore Admin
     client. Cause: 2nd-gen Cloud Functions run as the **default Compute Engine service
     account** (`537841607435-compute@developer.gserviceaccount.com`), and on newer GCP
     projects that account no longer gets automatic Firestore access. **Fix applied**: added
     the **Cloud Datastore User** IAM role to that service account via
     console.cloud.google.com → IAM & Admin → IAM (not the Firebase console — this is a
     Google Cloud IAM grant, same category as the "several IAM grants" hit during the
     original `phraseHint` deploy). **Not yet re-confirmed working** — the fix was applied
     but "Generate a code" hasn't been re-tested successfully since (local dev server access
     issues interrupted the retest; next session should re-verify via **Help → Stats &
     pairing → Generate a code** on the running app before considering item 4 fully done).
  2. **Generate `drag-sweep.mp3`** as a short, loopable tick/scrape sample (not a long
     glissando) — see the resolved recommendation in Completed Tasks above — then generate
     the other seven real files (`fill-click.mp3`, `x-click.mp3`,
     `batch-complete-chime.mp3`, `error.mp3`, `complete-fanfare.mp3`, `lock.mp3`,
     `unlock.mp3`) and drop them into `assets/sounds/` at those exact filenames — no code
     changes needed.
  3. **Not yet committed/pushed.** All of this pass's code changes are sitting in the working
     tree only — confirm with the project owner before committing/pushing (Netlify
     auto-deploys `main`, so a push goes live immediately).
  4. Also re-verify `phraseHint` still phrases hints correctly post-Node-22-bump next time
     hints are used, per the existing "check console/logs" guidance below — not re-tested
     this session.

* **iPad verification (superseded by the above).** The app loads and plays correctly on
  iPad (Cloud Function + Netlify deploy confirmed working end-to-end). Playing it there
  originally surfaced the four items completed in the pass above.

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
  `.firebaserc` at the repo root now also declare Firestore (rules only — see below);
  deploy target for the static site stays Netlify regardless. Auth (Anonymous) + Firestore
  are now in use for item 4's stats/pairing (see Completed Tasks) — item 9's puzzle-library
  Firestore usage is still separate/later.
* No CI is configured — run `npm test` (or `node test/run.js`) locally before pushing.
* **Node.js 20→22 runtime bump — done in the repo, not yet deployed.** Was a time-boxed
  fast-follow (Node 20 decommissions 2026-10-30); bundled into the item-4 pass above since
  that already touched `functions/`, per instruction, rather than as a separate deploy. See
  the Completed Tasks entry above for what changed (`engines.node`, dependency versions, the
  `firebase-admin` v12+ modular-API migration) — the only thing left is the actual
  `firebase deploy`, covered by the Current Objective above.
* **Firestore security rules: now needed** — item 4 above is the first real Firestore usage
  in the app. `firestore.rules` (repo root) covers `users/{uid}/stats/*` (owning-uid only)
  and locks `pairingCodes/*` to the Admin SDK entirely (see that file's own comments). Full
  puzzle-library rules (who can read/write shared puzzle documents, etc.) still belong to
  item 9 when it's scoped — this only covers what item 4 needs.
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