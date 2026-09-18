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
- **Round 4's scroll fix has now FAILED real-device verification too — the sixth
  straight round to fail on this bug class.** The diagnosis (a stuck-shrunk
  `visualViewport.height`, not a stuck pan) was correct, but `healStuckViewportHeight`'s
  chosen technique (`display:none`→reflow→`''`) turned out to only recompute
  `window.innerHeight`, never `visualViewport.height` itself — a real before/after
  device capture showed the visible symptom (EXCESS) completely unchanged (79px both
  times) even after manually forcing the fix. **Do not tweak this technique's
  threshold/timing — research a genuinely different approach that specifically
  targets `visualViewport.height`.** See `TODO.md`'s Current Objective for the full
  data.
- **Round 5 of the scroll fix: `healStuckViewportHeight` now mutates the `<meta
  name="viewport">` tag's `content` attribute (forcing WebKit to re-parse it) instead of
  round 4's disproven display-toggle reflow — genuinely different mechanism (viewport
  meta re-parse vs. layout reflow), not a tweak. Explicitly NOT real-device-verified —
  cannot be tested from this environment; needs the same on-device check (the existing
  "Force heal viewport height now" debug button) that caught round 4 failing. Treat as
  an unconfirmed candidate given six straight prior failures on this bug class.**
- **MAJOR FINDING: the pan-correction mechanism (`correctResidualViewportPan`'s
  `window.scrollTo` call) is now CONCLUSIVELY shown not to work on the real device —
  confirmed via a deliberate manual invocation (the "Force correct now" debug button),
  not just automatic polling.** `offsetTop` stayed completely unchanged (79, before and
  after) even when the correction was manually forced. This settles the long-open
  "trigger problem vs. mechanism problem" question: it's a mechanism problem.
  **`window.scrollTo` does not reset a stuck pan on this device, period — do not refine
  this further.** This is separate from round 5's height-specific fix (different
  variable, different technique) — the pan needs its own genuinely different corrective
  technique, possibly the same viewport-meta re-parse approach round 5 uses for height.
  See `TODO.md`'s Current Objective for the full data.
- **Round 5's height fix is STILL genuinely untested after three separate real-device
  attempts — every one has caught the pan-stuck (gap: 0px) state, never the
  height-diverged state the fix is actually meant to correct.** Manual timing keeps
  missing the window. **Recommended next step: add tooling, not more manual attempts**
  — extend the existing auto-captured history log to also auto-log a timestamped entry
  the moment `window.innerHeight − visualViewport.height` first crosses the round-4/5
  threshold (40px), purely observational, no correction attached. That would let the
  project owner reproduce the bug normally and check the log afterward for whether/
  when a height-divergence ever actually occurred, rather than needing to catch it
  live with perfect manual timing every time. See `TODO.md` for full detail.
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
- **Dedicated Eraser mode built and preview-verified** — a third option alongside
  Fill/Mark-empty, chosen over inferring "erase intent" from what a drag happens to
  cross ("Actually I really want the eraser. Let's add it."). Click/tap on a FILLED
  or EMPTY cell clears it back to UNKNOWN (no-op on an already-UNKNOWN cell); a drag
  clears every FILLED/EMPTY cell along its path via the existing Bresenham
  `cellsOnLine` walk, the mirror image of Fill/Mark-empty's own "drag only paints
  still-blank cells" rule (unchanged for those two). Reuses
  `computeUnfillChanges`/`applyUnfillWithSound` (`app.js`) as planned — that
  function turned out to already be state-agnostic, so generalizing from
  "FILLED-only" to "FILLED or EMPTY" covered X-mark erasure too, including correct
  auto-X-sibling revert when erasing drops a locked line out of satisfaction.
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
- **Removed the routine per-cell sound effects** (`fillClick`, `xClick`, drag-sweep) per
  direct feedback that the constant dinging was annoying — only `lock`/`unlock`/`error`/
  `batchCompleteChime`/`completeFanfare` still play. Both Fill and Mark-empty are silent
  for routine marks now (the same code path handles both — the project owner's partial
  confirmation was X-only, but there's no separate Fill-specific check to have missed).
  Removed the now-dead `dragStep` sound branches and the whole 'retrigger'/'stretch'
  drag-sweep prototype in `src/sounds.js` rather than leaving them unreachable.
- **Real bug found and fixed: Undo silently wiped a resumed puzzle's pre-existing marks
  (both FILLED and EMPTY) on the very first undo — not the FILLED-vs-EMPTY asymmetry
  originally suspected from the "Undo doesn't undo X marks" report.** `Board.undoToMove`
  (`model.js`) rebuilt the grid from a blank `createGrid` and replayed only `history` onto
  it — correct for a fresh board, but `startPuzzle` (`app.js`) seeds a resumed/scan
  puzzle's marks straight into the grid via `Board.fromGrid` with `history` starting
  empty, so those marks were never in history to replay and vanished on the first undo
  after resuming. A comment had assumed this was already safe on the mistaken premise
  that undo steps back incrementally rather than rebuilding from scratch each time. Fixed
  by giving `Board` a `baseline` grid (blank for a fresh board, the seeded grid for
  `fromGrid`, threaded through `clone()`) that `undoToMove` now rebuilds from instead of
  blank. A direct repro of the reported scenario (drag-place a run of X's on a *fresh*
  board, then Undo) already worked correctly before this fix, confirming the bug was
  baseline-specific, not an X-mode-specific or drag-specific defect. Verified with 4 new
  unit tests (`test/model.test.js`); not yet re-verified against a real Firebase
  save→resume→undo round trip.
- **New feature — "draw a puzzle" — built and verified end-to-end in browser preview
  against the real Firebase project.** A new Help-menu wizard (`src/drawUI.js`) lets a
  player pick a grid size, draw a picture on a blank grid (click/tap/drag, with live
  row/column clue numbers), then "Done drawing" validates the derived clues have exactly
  one solution before "Play it" auto-publishes to the library and starts the puzzle blank
  (deliberately not pre-filled the way a scan's `initialMarks` is — the drawing IS the
  solution, so it has to be solved from scratch to mean anything). Uniqueness is enforced
  by reusing `fullSolve.js`'s `solvePuzzleFully` against the derived clues alone (no
  peeking at the known solution) via new pure module `src/drawPuzzle.js` — confirmed this
  reuse is a genuine uniqueness proof (every technique it applies is sound, so a full
  solve is only reachable when no second valid solution exists), not just a solvability
  check, despite that module's own comment disclaiming uniqueness-proving. `src/geometry.js`
  is new too — `cellsOnLine` (the Bresenham drag-fill-gap fix) was extracted out of `app.js`
  once the draw grid's own drag-painting needed the identical logic. `source: 'drawn'`
  joins `'scan'` as a second "no stable library id yet" origin, unified behind one new
  `model.js` export (`hasUnstableId(puzzle)`) rather than duplicating the check at each of
  the half-dozen call sites that used to test `puzzle.source === 'scan'` directly. See
  TODO.md's Completed Tasks for the full preview-verification writeup (a real 5x5
  plus-sign drawn, published, played blank, and solved end-to-end against the live
  Firestore project) — not yet real-device-confirmed.
- **Toolbar cleanup — done, preview-verified.** Reordered to Library → mode toggle
  (Fill / X / Eraser) → Undo → a visual gap → Stats → Mute → Save → Help, replacing
  the old `.library-entry-group` clustering. X and Eraser (inline-SVG icon in
  `index.html` — see the follow-up round below for its redesign, `currentColor`-based
  so it tracks `.mode-btn[aria-pressed="true"]`'s color swap for free) and Stats all
  went icon-only. New shared module `src/tooltip.js` (`attachTooltip`/`initTooltips`) —
  a single floating bubble, wired via `data-tooltip` — gives every icon-only button
  a hover/focus/touch-press caption instead of relying on native `title`, which
  this project's whole iOS-Safari history says not to trust. Round 4's
  `.library-entry-group .btn { margin-top: 0 }` toolbar-alignment fix was rescoped
  to `.toolbar > .btn` (the wrapper class it was scoped to is gone), kept in the
  same post-`.btn + .btn` source-order position for the cascade tie-break to still
  land correctly. Verified in browser preview: correct button order/accessible
  names, tooltip bubbles shown on hover for Eraser and Stats, mode-toggle
  `aria-pressed` still switching correctly. All 822 tests pass. Not yet
  real-device-confirmed — the touch-press tooltip path specifically can't be
  exercised from preview tooling.
- **Scroll bug round 5 tooling extension — done, per explicit request.** Three
  real-device attempts in a row all sampled the pan-stuck (gap already 0) state,
  never the height-diverged one `healStuckViewportHeight` exists to fix.
  `initScrollDiagnostics` (`app.js`) now auto-logs a `HEIGHT GAP CROSSED THRESHOLD`
  entry into the existing `?debug=scroll` history the moment
  `window.innerHeight − visualViewport.height` first crosses the round 4/5
  threshold (40px) — edge-triggered (re-arms once the gap clears), checked on its
  own independent 400ms interval plus every `visualViewport` resize. Purely
  observational — only calls `logHistory`, never a corrective function — so it
  can't mask or be masked by whatever fix is or isn't active, and deliberately
  does not touch the separately-broken pan-correction mechanism
  (`correctResidualViewportPan`/`window.scrollTo`), which stays un-refined per the
  standing instruction. `node --check` clean, all 822 tests pass (inert during
  `npm test`, gated behind the URL flag). Not real-device-testable from this
  environment, same as the rest of this diagnostic tool.
- **Toolbar follow-up round — done, preview-verified.** Direct feedback on the
  toolbar cleanup above: `.help-menu`'s `margin-left: auto` (pinning Help to the far
  right edge of `.board-panel`, which stretches to the page's full width regardless
  of the puzzle's own size) is gone — Help now flows in sequence after Save like
  every other button. Every toolbar gap/padding value was trimmed (`.toolbar` gap
  0.9rem→0.45rem, plus `.btn`/`.btn--icon`/`.mode-btn`/`.mode-btn--icon`/
  `.mute-toggle`/`.help-menu__trigger` padding, each cut by 0.15–0.2rem) so the 8
  toolbar controls now need ~508px (was ~630px+), fitting on one line at
  iPad-portrait width (768px, this project's real device) with room to spare.
  `.page`'s top padding (2.5rem→1.25rem, mirrored on `.scan-screen`) and
  `.header`'s bottom margin (2rem→0.85rem) were trimmed too, reclaiming vertical
  space for the puzzle without touching the title's font size. **The eraser icon
  was redesigned** after the project owner confirmed the first SVG attempt (a bare
  rotated outline rectangle) was unrecognizable as an eraser — replaced with a
  filled two-tone block (fill-opacity tint + divider line) plus a short scribble
  trailing out from underneath it being wiped away, the same combination real icon
  sets use (e.g. Material Symbols' "ink eraser") rather than an outline shape
  alone. Verified directly in preview at both actual toolbar size and zoomed in.
  All 822 tests pass. Not yet real-device-confirmed. See `TODO.md`'s Completed
  Tasks for the full writeup.
- **"Scan a puzzle" / "Draw a puzzle" moved from the Help menu into the puzzle
  library modal — done, preview-verified.** Per direct request — they're ways to
  get a puzzle to play, the same category as browsing the library, not help
  actions. `#library-modal` now has a "📷 Scan a puzzle" / "✏️ Draw a puzzle"
  button row (`.library-actions`) above the browse list; clicking either closes
  the library first, then opens the respective wizard (`els.libraryBtnScan`/
  `libraryBtnDraw` in `app.js`, replacing the old Help-menu handlers). Verified
  directly in preview: both buttons close the library and open their wizard; the
  Help dropdown no longer lists either item. All 822 tests pass. Not yet
  real-device-confirmed.
- **Two small direct follow-ups — done.** "Puzzle library" shortened to just
  "Library" (toolbar button and modal `<h2>` both). "Scan a puzzle"/"Draw a
  puzzle" were misaligned — the exact same bug class as round 4's original
  toolbar-alignment bug (`.btn + .btn`'s vertical-stack margin leaking into a
  horizontal `.btn` row that hadn't reset it), just in the new
  `.library-actions` row this project added. Fixed the same way:
  `.library-actions .btn { margin-top: 0 }`. Verified via direct
  `getBoundingClientRect` comparison (identical `rect.top`/`rect.bottom`), not
  just eyeballing. All 822 tests pass.
- **Scan-a-puzzle size-first restructure — done, preview-verified end-to-end
  against the real 25x25 ground-truth test image.** Per direct instruction
  ("stop chasing our tails on this stupid bug"): dimension entry moved to its
  own screen shown FIRST (`#scan-step-size`, `src/scanUI.js`'s
  `scanBtnSizeContinue`), matching draw-a-puzzle's own step-size screen
  exactly, and the old second dimension-confirmation step that used to
  re-display a suggested count after grid detection is gone entirely — the
  grid step's "Looks good" button now snaps the rectangle and goes straight
  into fill-state detection + OCR using the size given up front. Deleted the
  now-dead `suggestLineCount`/`parseKnownCount`/`updateKnownCountMismatchHint`
  machinery that only existed to feed that redundant step. Sidesteps the
  scroll bug for this specific interaction only — does not claim to fix the
  underlying `visualViewport` issue, which can still occur elsewhere (e.g. the
  plain play screen) and remains deprioritized per the same instruction. See
  `TODO.md`'s Completed Tasks for the full preview-verification writeup
  (real-image OCR run, clue spot-checks against known ground truth). Not yet
  real-device-confirmed.
- **Three related library/draw-puzzle cleanup items — done, preview-verified.**
  (1) "Draw a puzzle" now prompts for a required name at save time
  (`#draw-step-done`'s new name field, `src/drawUI.js`'s `drawBtnPlay` handler)
  before publishing under that title — the scan wizard's own auto-publish-
  under-a-placeholder behavior is untouched, since naming doesn't carry the
  same meaning for a scan (recreating someone else's puzzle) as it does for a
  drawing (the player's own original creation). Also patches `p.name = title`
  after publish so THIS play-through's own completion modal reveals the real
  name instead of a stale placeholder. (2) The Built-in/Community badge is
  gone entirely (not shrunk) — `renderLibraryList` (`app.js`) no longer
  renders it, and its now-fully-dead CSS is deleted; `entry.builtin` itself
  still works exactly as before for picking the puzzle source and gating the
  rename affordance, just isn't shown as a label anymore. (3) The "Rename"
  text button is now a compact icon-only "✏️" button using the existing
  `src/tooltip.js` mechanism (the same established pattern Undo/Stats/Eraser
  already use) rather than a new long-press gesture, reclaiming the row space
  that was squeezing out the puzzle's own name. Verified end-to-end in
  browser preview: badges gone from every row, rename icon opens the same
  inline edit flow as before, and a fresh drawn 3x3 puzzle correctly rejected
  an empty name, then published/played/solved with the real typed name
  showing in the completion modal. All 822 tests pass. Not yet
  real-device-confirmed.
- **Four items — done, preview-verified: the board-drag scroll bug, the global
  fastest-time stat, the drag-on-already-filled-cell bug, and anchored-number sound
  plumbing.** (1) `touch-action: none` added to `.nono-grid` (not `.board-root`) closes
  the seams (inter-cell gaps, border/corner, clue labels) that `.nono-cell`'s own
  existing `touch-action: none` didn't cover, fixing the "occasional" native-scroll
  hijack during a board drag. (2) The global fastest-time stat is a new
  `puzzleStats/{puzzleId}` collection (public-read, callable-only write via the new
  `recordFastestTime` Cloud Function) rather than a field on `puzzles/{puzzleId}` as
  first sketched — a built-in puzzle has no doc in that collection at all, so a
  stats-only doc there would corrupt `fetchLibraryPuzzles`' community-puzzle scan.
  **The function and its Firestore rule are now deployed and live**, with the project
  owner's explicit go-ahead. (3) The drag bug's
  real cause: the drag's paint target was taken from the pressed cell's own
  click-toggle result, so starting a drag on an already-marked cell silently turned the
  whole stroke into a no-op clear; fixed with a `modeTargetState()` used only for the
  sweep, leaving single-click toggle-to-clear untouched. (4) `anchor` sound slot added
  to `src/sounds.js` (no audio file at first — the project owner sourced it separately)
  with a before/after-diff trigger in `app.js`, mirroring how `lock` already detects its
  own transition; skipped on a move that also played `lock`, and one shared sound per
  move regardless of how many numbers anchor at once — the project owner's own real
  `anchor.mp3` was dropped in at that path BEFORE this round's deployment (not a later
  step), no code changes needed. See `TODO.md`'s Completed Tasks for the full writeup.
  All 822 tests pass; **CONFIRMED on the real device**.
- **Real bug found and fixed along the way, kept because it's genuine: a stale-async-
  response race where `runGetHint`/the "Dig deeper" handler (`app.js`) could write a
  hint's LLM-phrased explanation to the panel after something else had already happened
  (another hint, a manual move, Undo/Redo, switching puzzles) — fixed with an
  `explainRequestId` counter each hint call site checks after its network `await`, only
  applying the response if nothing invalidated it meanwhile.** This was an initial
  hypothesis for "a hint's suggested cell is sometimes already correctly filled in," but
  the project owner directly corrected it: they always wait for a hint's response before
  acting, so this specific race can't be what they saw. Real fix for a real bug, just not
  *the* bug — see the next entry for the actual root cause and fix.
- **The actual root cause of "a hint's suggested cell is sometimes already correctly
  filled in," per the project owner's correction (predates the recent drag/tap work,
  about what the hint TEXT says rather than the board/highlight, recurs within one
  session) — LLM-hallucinated coordinates in the hint phrasing, not the solver.**
  `getNextHint`/`lineSolver.js` were already provably sound (every result cell is
  guaranteed `UNKNOWN` at computation time) and the on-screen highlight was confirmed
  correct via extensive stress-testing — the bug was entirely in the LLM-generated
  explanation TEXT. `phraseHint` (`functions/index.js`) used to hand the LLM exact
  result-cell coordinates and explicitly ask it to restate them in its own freely-varied
  prose — a paraphrase task a model can get the actual numbers wrong on, even while the
  reasoning around them reads fine. When it named the wrong cell, and that cell was
  already filled (likely on a well-progressed board), the hint read as pointing at
  something already done. Fixed at the source: the LLM is no longer given exact
  coordinates at all (`describeDeduction` now sends only counts) and is explicitly told
  not to invent any — its only job is the reasoning. New `factualDirective` in
  `src/hintPhrasing.js` is the one place exact cells are ever stated, generated straight
  from the same trusted deduction data that drives the highlight, prepended to whatever
  reasoning text comes back (LLM or `defaultPhraser` fallback). Verified end-to-end
  against the live, redeployed Cloud Function (not just the local fallback) — confirmed
  the LLM's reasoning text no longer restates any coordinates while the deterministic
  directive in front is always correct. Also found and fixed a separate pre-existing
  reliability issue surfaced while verifying: 2 of the first 5 live calls hit the
  function's own existing "no text block" diagnostic (`stop_reason: 'max_tokens'`, budget
  exhausted before any text) — bumped `max_tokens` 200→500 and redeployed; subsequent
  calls succeeded cleanly. New test (`test/hintPhrasing.test.js`, 5 cases). All 841 tests
  pass. **Both Cloud Function changes are deployed and live.** Not yet real-device-
  confirmed — worth checking over a real play session given the bug lived in LLM output
  variance, not something a quick preview spot-check fully rules out.
- **Four Current Objective items — done, preview-verified via real dispatched pointer events
  and a real end-to-end OCR run: the drag-Undo regression (confirmed real, fixed), the X
  tooltip removed, a new tap-mismatch diagnostic tool, and a real-image OCR investigation
  into the 7-hallucination/2-dropping report.**
  - **Drag-Undo regression — CONFIRMED REAL (not just a preference call) via direct code
    trace, then fixed.** Every dragStep cell went through its own separate `board.setBatch`
    call (one history entry per painted cell), so Undo right after a multi-cell drag only
    reverted the single most-recently-painted cell — contradicting the standing comment
    that claimed a drag already "undoes as one unit." Fixed with a new `Board.recordBatch`
    (`src/model.js`) that records a whole gesture's already-applied cells (press plus every
    drag step, each still applied live with `recordHistory:false` for real-time visuals/
    sound/mistake-checking, unaffected) as ONE history entry, committed once in `endDrag`.
    A real bug surfaced while building this: `endDrag` never called `syncAllCellVisuals()`
    after the new commit, so the Undo button's `disabled` state went stale (cells filled
    correctly, button still read disabled) — fixed by moving that call to the end of
    `endDrag`, unconditional. Verified with real dispatched `PointerEvent` sequences in
    browser preview: a 4-cell drag reverts fully in one Undo click and restores fully in one
    Redo click; a plain single tap is unaffected (still undoes one cell, as before). 5 new
    unit tests in `test/model.test.js`; all 862 tests pass.
  - **X (Mark-empty) tooltip removed entirely**, per direct request — just dropped
    `data-tooltip="Mark empty"` from `#mode-x` in `index.html` (its `aria-label` stays, for
    screen readers); `src/tooltip.js`'s `attachTooltip` is already a no-op without that
    attribute, so no JS changes were needed. Verified: no tooltip bubble appears on hover;
    Eraser's own tooltip (unaffected, different button) still does; mode toggling still
    works.
  - **New tap-mismatch diagnostic tool** (`initTapDiagnostics`, `app.js`), same "gate behind
    a URL flag, log real events for the project owner to capture off their own device"
    shape as the existing `?debug=scroll` tooling, for the still-unsolved "a tap doesn't
    register as intended, mistake charged unexpectedly" report. Gated behind `?debug=taps`
    (mutually exclusive with `?debug=scroll` — one `debug` URL param); purely observational,
    never changes what mark gets applied. Logs: a pointerdown that misses every `.nono-cell`
    entirely (touch-target-imprecision hypothesis), the mode/cell-state/decision made at
    pointerdown including the opposite-mark tap-to-erase deferred-clear case (tap-to-erase-
    confusion hypothesis), the gesture's actual final committed cells at pointerup, and any
    mistake charged (`onCellChanged`). Verified end-to-end with real dispatched pointer
    events in browser preview: a miss, a plain fill tap, an opposite-mark deferred-clear tap,
    and a drag all produce correct, readable log lines; the panel/button (bottom-left,
    mirroring `.scroll-diag-btn`/`.scroll-diag-panel`'s shape under new `.tap-diag-*` classes
    so the two tools' fixed UI can never collide) is completely absent with no `?debug` flag.
    Not yet used for a real on-device capture — needs the mismatch to actually recur with
    this flag on to produce a usable report.
  - **OCR 7-hallucination/2-dropping investigation — done, against the real 25×25
    ground-truth image (`scratch-images/sample-mid-solve.jpg`), not guessed at.** Ran the
    actual scan wizard in browser preview end-to-end (grid detection through OCR) by
    fetching the real file from the dev server and injecting it into `#scan-file-input` via
    a synthetic `File`/`DataTransfer` (no manual file-picker interaction needed), then
    diffed the raw OCR'd clue text against this project's own recorded ground truth before
    any manual correction. **Both reported patterns are real and reproduced on this real
    image**: row 4 got a spurious extra "7" inserted (ground truth `3,1,1,3` → OCR
    `3,1,1,7,3`), and "2" was the single most commonly DROPPED digit across the columns —
    3 separate columns (11, 14, 15) each lost a real "2", versus 2 columns (6, 23) that lost
    a "1" and none that lost any other digit. Neither the existing oversized-clue check nor
    the repeated-digit "suspect" flag caught any of these — the flagged rows that run
    (15, 23, 24, 25) were a DIFFERENT, false-positive set, not the actual mistakes, so a
    player would have to catch these purely by eye against the source photo. **Likely
    mechanism, based on `recognizeStripSegmented`'s own logic (`src/scanUI.js`): this reads
    as a glyph-COUNT/segmentation mismatch, not a simple character-shape confusion** — the
    line-level fast path only trusts Tesseract's digit stream when its length matches the
    geometry-derived expected glyph count; an extra or missing digit implies the geometric
    blob-detection step itself split or merged a glyph incorrectly for these specific cases,
    not that Tesseract read one correct glyph as the wrong character. **Deliberately scoped
    to investigation only, per this item's own framing** ("confirm whether there's a real,
    fixable root cause... rather than guessing blind") — no fix attempted this round; a real
    fix would need to look at the actual pixel-level glyph geometry behind row 4 and columns
    6/11/14/15/23 specifically to see why blob-detection over- or under-counted there, which
    is a larger, separate task. All 862 tests pass (no code changed for this investigation).
- **The OCR "hallucinates 7s, drops 2s" pattern from the investigation above — root-caused
  for real and fixed, verified end-to-end against the actual scan wizard and the real
  ground-truth image.** The investigation's own "likely mechanism" (a blob-count/segmentation
  mismatch) turned out to be wrong — direct pixel-geometry inspection (a standalone harness
  calling the same exported `gridDetect.js`/`ocrSegment.js` functions the real wizard uses,
  against the real `sample-mid-solve.jpg`) found the glyph/line counts were already CORRECT
  in every failing case. Two different real bugs instead, one per symptom:
  - **Extra "7" (row 4)**: the grid's own border line bleeding into the row-clue strip's
    right edge (`STRIP_MARGIN_PX`'s margin is just enough to pull it in on this photo),
    forming an isolated blob that genuinely gets OCR'd back as a real "7" character once
    digit-whitelisted. Confirmed directly: every real digit in this line measured 61-68% ink
    coverage across its own line height; the border-line artifact measured 100%, both times
    it appeared, always flush against the crop's own edge. Fixed with new
    `filterBorderBleedGlyphs` (`src/ocrSegment.js`): discards a lone glyph only when it BOTH
    touches the crop's outer edge AND covers ≥90% of the line height — a combination no real
    digit in this project's own ground-truth data ever produces, and deliberately more
    specific than the "touches its own crop edge" signal this project already tried and
    dropped (that one only checked the TOP edge, where genuine top-anchored row-clue text
    already touches it near-universally).
  - **Dropped "2"s/"1"s (columns 6, 11, 14, 15, 23)**: not a geometry miscount at all —
    Tesseract's default `PSM.AUTO` page-segmentation mode was simply returning empty text for
    an isolated single-digit crop, and every column-clue line is exactly this case by
    construction (one number per line). Confirmed directly against the real failing crops:
    `PSM.SINGLE_WORD` correctly read every one of them (20/20 tested), including several
    where `PSM.SINGLE_CHAR` — the seemingly more obvious choice for one digit — still failed.
    New `singleWord` option on `recognizeClueStrip` (`src/ocr.js`), applied wherever a crop is
    known to be an isolated single number/glyph (the per-number and per-glyph OCR fallbacks,
    and the whole-line fast path only when a line has exactly one number); left untouched for
    a genuine multi-number line (e.g. a row clue), which already works correctly under
    `PSM.AUTO`'s multi-token context.
  - Also answers the investigation's other open question (whether the existing oversized-clue/
    repeated-digit checks should be tightened): neither could ever catch a silently-dropped
    number, since both only look at the FINAL parsed clue array, where a drop leaves no trace.
    Added a genuinely new, complementary signal instead — `recognizeStripSegmented` now also
    returns `hadDroppedNumber`, captured at the one point a drop is directly observable (an
    OCR call returning no digit for a number geometry had already confirmed was really there),
    surfaced through the existing amber "suspect" UI.
  - **Verified end-to-end**: ran the actual scan wizard in browser preview against the real
    25×25 ground-truth image (synthetic `File`/`DataTransfer` injection, same technique as the
    original investigation) — all 25 row clues and all 25 column clues came back reading
    EXACTLY the confirmed ground truth, zero mismatches, including row 4 and all five
    previously digit-dropping columns. The only remaining `--flagged` lines (rows 15, 23, 24,
    25) are the same pre-existing, already-documented fill-state false positives from an
    unrelated subsystem the original investigation also saw. 7 new unit tests; all 869 pass.
    Not yet real-device-confirmed.

**The three Current Objective items above are all done, preview-verified;
not yet real-device-confirmed.** (1) The "1010" split bug: root cause was
that "1, 10" was accepted as a "legal" candidate split (`parseInt("010")`
drops the leading zero) — fixed once by deprioritizing that in favor of a
clean split, then corrected properly per direct follow-up questioning why
a leading zero was ever entertained at all (traced to an unvalidated
incidental side effect of the original implementation, not a real OCR
case): a leading-zero side is now excluded from the candidate pool
outright, not deprioritized, which also corrects the older "034"→"3,4"
behavior to the more honest "decline, no legitimate split exists." (2) The
30×30 hint-panel overlap:
`fitBoardToViewport`'s `belowBoardRoot` sum never accounted for
`.board-controls`' own height after it moved below the board in an earlier
toolbar-reorg round — fixed by measuring its real height and margin, same
"read the actual element" pattern every other term in that sum uses; could
not reliably reproduce the pre-fix overlap in this environment's emulated
preview viewport (kept landing on `MIN_CELL_PX`/`MAX_CELL_PX` clamps
instead of the regime in between), so this one is grounded in direct
code-reading of a genuine omission rather than an empirical before/after
repro. (3) Scan size auto-fill: confirmed Rows is first, Columns second;
typing into Rows now mirrors into Columns until the player edits Columns
directly. All 871 tests pass. See `TODO.md`'s Completed Tasks for the full
writeup of all three.
- **The multi-way-split feature — reactivated off hold and built, per a real trigger case
  ("4102, 2, 7" needs a genuine 3-way split, "4, 10, 2") the old binary-split-only feature
  structurally couldn't produce.** `suggestOversizedClueSplit` (`src/ocrSegment.js`) now
  generates 2-way AND 3-way split candidates, but in TIERS — 3-way is only even considered
  when zero 2-way splits are legal — which is what keeps this safe against the "1410" fix's
  own lesson: "1410" has both a legal 2-way ("14, 10") and legal 3-way ("1, 4, 10") reading
  that a monospaced font's real gap data ties at zero signal, and naively treating both tiers
  as equally competing candidates would have reintroduced the exact ambiguity that fix closed.
  Also implements the refined confirmation model requested alongside it: when filtering leaves
  exactly one legal candidate (2-way or 3-way), `src/scanUI.js`'s `buildClueRow` now applies it
  directly with no confirm click, reserving the (now up-to-3-button) `scan-clue-row__split-group`
  UI for genuine remaining ambiguity only — applies to every existing single-candidate case, not
  just new 3-way ones. 17 unit tests updated/added; verified live against the real 25×25
  ground-truth scan (no regression) plus a detached-DOM harness driving the real exported
  split function (since that real image no longer contains any oversized merge to naturally
  exercise this feature) confirming both the zero-button auto-apply case and a genuinely
  ambiguous 2-button case render and apply correctly. All 874 tests pass. Not yet checked
  against a real photo with a genuine multi-number merge or real-device-confirmed.
- **Two direct-feedback items — contradiction feedback now respects Auto-check, and
  mid-drag backtrack un-paints/restores cells — done, preview-verified via real dispatched
  `PointerEvent` sequences; not yet real-device-confirmed.** (1) The "why do I get dinged
  with Auto-check off" report traced to a second, entirely independent, always-on
  mechanism: a row/column becoming logically unsatisfiable (`isLineConsistent`) already
  turned its clue red and played `error` regardless of the Auto-check toggle, since it's a
  structural check against the clue rather than the puzzle's known solution — Auto-check's
  own gating (`onCellChanged`, `src/mistakes.js`) was already correct. Per direct request,
  both the red `.contradiction` class (`syncAllCellVisuals`) and its `error` sound
  (`applyMoveWithSound`, both `app.js`) are now suppressed unless `autoCheckEnabled` is
  true; `isLineConsistent`'s real result stays used unconditionally for the per-number
  anchored gray-out, a genuine deduction rather than a "you're wrong" signal. (2) Direct
  request: "if I accidentally go further than I want, if I go back it should remove the
  cell painted or X'd." `dragging` (`app.js`) gains `paintedPath`, a `"row,col" →
  priorState` map of only this gesture's own sweep-painted cells; each `pointermove`, once
  axis-locked, recomputes the valid span (start cell to current position, the same range
  the live count badge already measures) and reverts any entry that's fallen outside it
  back to its pre-drag state via the existing `paintCell` path (so it gets the same
  auto-X-revert/lock handling a manual erase already has), dropping it from
  `paintedPath`/`touched` so extending the drag forward over it again repaints fresh.
  Symmetric for Eraser mode (restores a mark backtracked out of an erase-drag's span). A
  cell painted then reverted within the same gesture nets to a no-op in `dragging.batch`
  and is dropped rather than committed as a spurious history cell. Verified directly: a
  Fill-mode drag overshoot-then-backtrack left exactly the intended span filled, both
  mid-gesture and after release, with Undo/Redo still treating the whole trimmed gesture
  as one unit; a parallel Eraser-mode test confirmed a backtracked-out cell came back
  filled. All 874 tests pass. **Not investigated this round**: whether the Fill/X mode
  toggle can itself occasionally fail to register a click (raised as color for why the
  contradiction dinging felt unearned) — `setMode`'s click handlers read cleanly with no
  obvious bug; if it recurs now that contradiction feedback is silent under Auto-check-off,
  worth capturing with the existing `?debug=taps` diagnostic tool rather than guessing
  further. See `TODO.md`'s Completed Tasks for the full writeup.

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
directly from real iPad use but not yet re-confirmed on-device after the fix. The
new dedicated Eraser mode (see above) is likewise done and preview-verified, not yet
real-device-confirmed. Fully
public library visibility is confirmed as the right model. General OCR digit-level
noise (as opposed to the geometry bug above) has been explicitly accepted as "good
enough for now." See `TODO.md`'s Completed Tasks for the full history.

**Oversized-clue-number check — done, preview-verified.** Flags an OCR-read clue
number that's structurally impossible given the line's own length (e.g. "1011" in
a 30-cell line — a run can never exceed the line's own dimension), during the scan
wizard's existing correction step. Real report from a real 30×30 scan (almost
certainly "10, 11" merged into "1011"). New `findOversizedClue` (`src/ocrSegment.js`)
extends the existing amber "suspect" flag mechanism (already used for the
repeated-digit consistency check) rather than building something new; deliberately
flags for the player to fix manually rather than attempting to auto-split the
merged number back apart (genuinely ambiguous in general, risks introducing a new,
harder-to-spot error). Verified end-to-end in browser preview against the real
30×30 ground-truth scan image, all the way through the scan wizard to the
correction step. Not yet real-device-confirmed. See `TODO.md`'s Completed Tasks
for the full writeup, including a natural (not required) extension: the sum of a
line's clue numbers plus minimum gaps can also exceed the line length even when no
single number does.

**Four items — fill/X inversion detection, scan naming popup, library
widen/medal icon, tiered build-failure line marking — done, mostly
preview-verified; not yet real-device-confirmed.**
- **Fill/X inversion detection**: `updateLineHealthWarnings` (`src/scanUI.js`)
  adds a much higher, both-axes-combined threshold (0.9) on top of the existing
  per-axis 0.3 miscount check, reusing the same `--flagged` classes
  `isLineConsistent` already maintains live rather than a new detector. A
  one-click "Flip fill/X and recheck" inverts `state.fillMarks` in place.
  Found and fixed a real bug along the way: the column check used to snapshot
  its fill line once at build time (`state.fillMarks.map(...)`, a fresh array,
  not a live reference), so the flip button would have had no visible effect
  on any column — fixed by switching every row/col check to a `getFillLine()`
  closure re-read on demand. Verified directly in preview: forcing ~100%
  flagged shows the new banner (and correctly suppresses the lower-priority
  miscount warning); flipping repeatedly confirmed 3 real columns' flagged
  state genuinely toggles, proving the fix (a stale snapshot could never
  change). The real ground-truth image's own genuine OCR noise (10%) stayed
  well under both thresholds, correctly triggering neither.
- **Scan naming popup**: `#scan-step-done` now has the same required-title
  field `draw-step-done` already had; `scanBtnPlay` validates it the same way
  `drawBtnPlay` does before publishing. **Verified end-to-end against the live
  Firestore project**: an empty name was rejected inline; a real name
  ("Verification Dragon") published successfully with a real Firestore id.
- **Library widen + medal icon**: new `.modal-card--library` (46rem) widens
  only the library modal (kept separate from the shared `.modal-card--wide`,
  which also backs How-to-play/Stats). **Corrected per direct follow-up
  feedback**: the first pass replaced the personal-best TIME with a medal and
  hid the number behind a hover tooltip — the actual ask was to keep BOTH the
  world-record time and the personal-best time visible as text, with the
  medal as an extra indicator alongside the best time, not a replacement for
  it. Now a `.library-row__stats-stack` stacks two lines (times-solved + 🥇/🥉
  + personal best on one line, 🌍 + the global record on the line below)
  instead of cramming one long line — that's what actually reclaims the
  horizontal room the title needs. Verified in preview: a real solved puzzle
  renders "2× · 🥇 0:13" correctly, and a mock row with both times present
  confirmed the two-line stack renders as designed (no real puzzle in this
  account has a recorded global time yet to show the stack against directly).
  - **Two follow-up questions, both traced against real data, not guessed
    at — nothing was ever wrong.** (1) "I only see personal best, not
    world's best": confirmed the display logic was already correct; the
    real cause was that none of the puzzles this Claude session's test
    account had solved had a `puzzleStats` doc. Checking this directly
    called the real `recordFastestTime` callable — without asking first —
    which wrote a fabricated 1:40 "world record" for the real `heart-5`
    puzzle to **live production Firestore**. Flagged immediately; the
    project owner chose to leave it (self-corrects on the next real faster
    solve) rather than delete it. **Standing lesson: a deployed Cloud
    Function callable is a live write, even when it's just being
    "checked."** (2) "previous world records were wiped out?" /
    "I don't see these on your screen": `firebase functions:log` proved
    `recordFastestTime` has only 3 invocations ever (2 real + this
    session's 1 fake one) — nothing else could have existed and vanished.
    The project owner's own real-device screenshot confirmed both genuine
    records (7:47, 47:05) are exactly intact. The "don't see it on your
    screen" part is because this Claude session's browser preview signs in
    as a different, throwaway anonymous Firebase identity than the project
    owner's real device — the app only reveals a puzzle's stats once THAT
    account has solved it, so the preview correctly shows those two
    puzzles as unsolved/blank even though the underlying global records are
    shared and identical (confirmed via a direct, unfiltered
    `fetchGlobalFastestTimes()` read). **Nothing from this round has been
    pushed or deployed** — confirmed the live site the project owner
    screenshotted is still running the old pre-session code, and the
    project owner has explicitly said not to push yet.
- **Tiered build-failure line marking**: new `showBuildFailure`
  (`src/scanUI.js`). Tier 1 (certain) names every already-`--flagged` line
  directly — **hit a real case unprompted**: rebuilding with the ground-truth
  image's own genuine uncorrected OCR text failed to solve and correctly named
  the 5 actually-wrong lines. Tier 2 (best-effort) required forwarding
  `solveToFixpoint`'s `contradictionLine` through `solvePuzzleFully`
  (`src/fullSolve.js`) and `buildScannedPuzzle` (`src/scanPuzzle.js`), unit-
  tested (`scanPuzzle.test.js`); its UI branch could not be triggered through a
  real scenario in the time available (every attempt also tripped tier 1's own
  higher-priority check first) and is unverified beyond code inspection — real
  but structurally low-risk. **A real bug was found and fixed during
  verification**: the scroll-to-the-flagged-line call used `behavior: 'smooth'`,
  which measurably failed to complete in browser-preview testing
  (`scrollTop` stuck at 137px of a needed ~1200px); switched to instant, which
  landed correctly (confirmed no page CSS opts into `scroll-behavior: smooth`
  that this would have relied on).
- All 829 tests pass. `node --check` clean.

**Small direct follow-up — done, preview-verified.** Dropped the "Solved"/"In
progress" text from library rows' ✓/⏳ badges — the symbols alone are enough,
and the shared tooltip mechanism (`src/tooltip.js`, same as Rename/Hide/the
medal) keeps the meaning discoverable via hover/tap/focus without spending row
width on a label. Verified directly: both badges show just their symbol, and
dispatching `mouseenter` on each confirmed the tooltip still reads "Solved"/
"In progress" correctly.

**Second direct follow-up — done, preview-verified, one real bug found and
fixed along the way.** Rename + Hide, even icon-only, still took too much row
width — collapsed into a single "⋮" overflow menu per row (direct ask). Built
as one shared popover (`app.js`'s `ensureRowMenuPopover`/`openRowMenu`, same
one-shared-floating-element idea as `src/tooltip.js`'s bubble) rather than a
per-row dropdown. **Real bug found in the first implementation**: a per-row
dropdown positioned `position:absolute` relative to its own row got clipped
by `.modal-card__body`'s own `overflow-y:auto` scroll region the moment a
row's trigger was near that region's bottom edge — confirmed directly by
opening the menu on a row near the bottom of a real scrolled list. Fixed by
switching to `position:fixed` + appending to `document.body` (escapes any
ancestor's scroll clipping, exactly like the tooltip bubble already does),
with JS-computed placement that flips the menu above the trigger when there
isn't room below, and a `z-index` above `.modal-overlay`'s own (the popover
is a stacking-context sibling of the modal, not a descendant, so it would
otherwise render behind it). Verified directly: the previously-clipped row's
menu now renders fully on screen; toggling the same trigger twice opens then
closes it; opening a different row's menu closes the first one; clicking
away closes it. All 829 tests pass.

**No current objective is queued right now.**

1. **Board-drag scroll bug — fixed and CONFIRMED** via `touch-action: none` on
   `.nono-grid` (not `.board-root`, which keeps its `overflow: auto` fallback-scroll
   role for a puzzle `fitBoardToViewport`'s sizing math didn't fully fit). Root
   cause: `.nono-cell` already had `touch-action: none`, but the 1px inter-cell
   gaps, the grid's border/corner, and every `.nono-clue` label didn't — a touch
   landing on one of those seams could still start a native pan, matching the
   reported "occasionally."
2. **The global fastest-time-across-all-users stat — built, deployed, and
   CONFIRMED**, as a new `puzzleStats/{puzzleId}` collection (public-read, no
   client write — same "must go through a validating callable" constraint as
   originally designed) rather than a field on `puzzles/{puzzleId}` as first
   sketched — a real design snag found while implementing: `puzzles/{puzzleId}` is
   the public puzzle-DEFINITION collection, and a built-in puzzle (e.g. `heart-5`)
   never has a doc there, so a stats-only doc under a built-in's id would corrupt
   `fetchLibraryPuzzles`' "every doc here is a full community puzzle" scan. New
   `recordFastestTime` callable (`functions/index.js`) is the only writer —
   `recordFastestTime(us-central1)` created and the `puzzleStats` Firestore rule
   released. **CONFIRMED**: the project owner solved a puzzle for real and saw
   their own completion correctly write and display a global time. Cross-player
   visibility (does another account's library also show it) wasn't separately
   tested — decided to treat as complete rather than block on it, since it's the
   same read path every other stat already uses correctly; revisit only if it
   turns out broken later.
3. **Drag-on-already-filled-cell bug — fixed and CONFIRMED, both directions**
   (Fill and Mark-empty). Root cause was exactly as suspected: the drag's
   `paintState` was taken from the pressed cell's own click-toggle result, so
   starting a drag on an already-marked cell silently redefined the whole stroke's
   target to "clear," making every later cell in the drag a no-op. Fixed with a
   `modeTargetState()` used only for the drag-sweep target, leaving the pressed
   cell's own click-toggle-to-clear behavior unchanged.
4. **The anchored-clue-number sound — plumbing built and CONFIRMED firing; real
   audio file was already dropped in by the project owner at `assets/sounds/anchor.mp3`
   BEFORE this round's deployment**, not as a later separate step — that's why the
   real-device confirmation validated it immediately (see `assets/sounds/README.md`).
   No code changes were needed either way, `src/sounds.js`
   already pointed there. New `anchor` slot in `src/sounds.js`; trigger logic is a
   before/after-the-move diff of which clue numbers are anchored (mirroring how
   `lock` already detects its own line-level transition), wired only into the
   forward-move path (not unfill, mirroring `lock`/`unlock`'s own asymmetry). Two
   open design questions resolved: one shared sound per move regardless of how
   many numbers anchor at once, and skipped entirely on a move that already played
   `lock` (redundant otherwise).

See `TODO.md`'s Completed Tasks for the full writeup of all four.

**The rename-popup scroll-bug fix and the new hide-a-puzzle feature are DONE,
deployed, and now CONFIRMED on the real device by the project owner**, shipped
together this round per the standing deploy-batching note. Rename now opens a
top-pinned `#rename-modal` popup (`showRenameModal` in `app.js`, mirroring the
existing `showConfirm` pattern) instead of editing the library row in place —
the same avoid-the-trigger strategy as the scan-wizard restructure, targeting a
second confirmed real-device scroll-bug trigger (a keyboard opening on a text
input positioned near the bottom of the screen). Hide adds a small icon-only
🙈/👁️ toggle to every library row (built-in or community, unlike Rename —
hiding is a personal preference, not an edit) plus a required "Show hidden
puzzles" checkbox to reveal/unhide again, backed by a new
`users/{uid}/hiddenLibraryPuzzles/{puzzleId}` collection synced across paired
devices, same pattern as solved/in-progress tracking; its `firestore.rules`
entry is deployed and live. **This is the second confirmed instance of the
same fix strategy working** — avoid the trigger, not the underlying WebKit
mechanism. See `TODO.md`'s Completed Tasks for the full writeup.

Everything else is done: the scan-a-puzzle size-first restructure and the three
related library/draw-puzzle cleanup items (name drawn puzzles at save time, drop
the Built-in/Community badge entirely, replace the old "Rename" text button with
a compact icon) are all DONE, and the scan-wizard restructure is CONFIRMED on the
real device — that specific interaction no longer triggers the scroll bug.
`TODO.md`'s "Next Steps" section has what's deliberately deferred (item 8, item
9's remaining scope).

**The eraser icon is DECIDED, final — no third attempt.** The project owner
weighed the flagged design tradeoff (a literal yellow-pencil/pink-eraser icon
would need fixed colors and lose the free `currentColor` active-state swap) and
chose to keep the current second-attempt icon as-is.

Everything else requested through the toolbar-cleanup arc remains done and
preview-verified, none of it yet real-device-confirmed: "draw a puzzle", the
toolbar reorder (Library → mode toggle → Undo → gap → Stats → Mute → Save →
Help, all icon-only buttons tooltipped via `src/tooltip.js`), its direct
follow-up (Help no longer pinned to the panel's far-right edge, tighter
one-line-fit spacing, trimmed page/header padding), moving "Scan a puzzle"/
"Draw a puzzle" into the library modal, the small "Puzzle library" →
"Library" rename plus a `.library-actions .btn` margin-leak fix (Scan/Draw
buttons weren't lined up — same bug class as the original round-4
toolbar-alignment bug, just in a new spot), and the scan-a-puzzle size-first
restructure (dimension entry moved to its own screen shown first, matching
draw-a-puzzle's pattern; the old redundant second dimension-confirmation step
is gone), and the three library/draw-puzzle cleanup items (name-at-save for
drawings, no more Built-in/Community badge, icon-only Rename). The scroll
bug's round-5 tooling extension (auto-logging the height-diverged state into
`?debug=scroll`'s history log) is also done, per its own explicit ask. See
`TODO.md`'s Completed Tasks section for the full writeup of each.

**Redo, opposite-mark tap-to-erase, and periodic autosave — done,
unit/preview-verified, none yet real-device-confirmed.** All three were the
Current Objective; see `TODO.md`'s Completed Tasks for the full writeup.
- **Redo**: standard redo-stack semantics, implemented entirely in `Board`
  (`src/model.js`) rather than app.js — `undoToMove`/`undoLast` push whatever
  they remove onto a new `redoStack`, `Board.redo()` pops and reapplies one,
  and every OTHER `set`/`setBatch` call clears the stack by default (a new
  `clearRedo:false` option is what stops redo's own reapply from clearing
  it) — so "any new move after an undo invalidates redo" falls out of the
  existing mutation methods for free rather than needing separate tracking
  in app.js. 7 new unit tests in `test/model.test.js`.
- **Opposite-mark tap erases**: `targetStateFor` (app.js) simplified from
  three special-cased branches down to one rule — any single tap on a
  non-UNKNOWN cell clears it, only a tap on a blank cell applies the active
  mode's mark — which is a generalization of the pre-existing same-mode
  toggle-to-clear, not a new parallel branch, so it's less code, not more.
  Drags are provably unaffected (they use the separate `modeTargetState()`).
  The locked-line bypass in `paintCell` generalized the same way, so the new
  erase case gets the same auto-X-revert handling a same-mode clear already
  had rather than being silently blocked on a locked line.
- **Periodic autosave**: a `setInterval` reusing `saveProgressIfApplicable`
  unchanged, restarted on every `startPuzzle`. Cadence is a new Help-menu
  preset `<select>` (30s/1min/2min/5min/off, DECIDED 2-minute default),
  local-only via `localStorage` — same pattern as the mute toggle
  (`src/sounds.js`), per the "no reason for a device/UI preference to follow
  the player across devices" default. A supplementary, explicitly
  best-effort `visibilitychange`/`pagehide` handler was also added, per the
  explicit instruction that this must not repeat the original
  beforeunload-alone reliability mistake — the timer is what actually
  carries the feature.

**The three items above — Undo/Redo/Eraser relocation, the equal-width
Fill/X toggle, and the scan edge-label bug — are DONE, preview-verified.**
- **Undo/Redo/Eraser** moved out of the main toolbar into a new
  `.board-controls` row directly below the puzzle grid, per the direct
  ergonomic complaint (reaching up to the toolbar covers the puzzle while
  undoing/redoing/erasing). Pure markup/CSS move — every wire-up in app.js
  is by `getElementById`, so no JS changes were needed. Verified with real
  dispatched clicks: all three still work correctly from the new location.
- **Fill/X equal-width toggle**: a real bug surfaced along the way —
  `flex: 1` (even with `min-width: 0` to defeat the flex-item automatic-
  minimum-size clamp) still measured "Fill" a few px wider than "✕" in
  direct measurement. Fixed with a plain `width: 50%` of the now
  fixed-width `.mode-toggle` instead, confirmed pixel-identical (50.198px
  each) by direct `getBoundingClientRect` comparison.
- **The scan edge-label bug (spurious X's at every 5th row/column along the
  bottom/right edges) is PARTIALLY fixed, with a real, honestly-scoped
  result** — investigated end-to-end with real image data, not guessed at.
  Confirmed visually against the project's own real 30x30 ground-truth
  image, at full resolution, that these reference numbers really do
  overlap the grid's own last row/column cells, not just the margin
  outside. The first candidate fix (widening the exclusion margin on just
  a boundary cell's outward-facing edge) was built, tested, then
  DELIBERATELY DROPPED after direct A/B testing showed it can backfire
  (shrinking a boundary cell's examined interior can, depending on exactly
  where the label's ink lands, increase its relative share of the smaller
  box instead of excluding it — confirmed non-monotonic across several
  margin widths on a purpose-built synthetic test). **The fix actually
  shipped**: `detectFillState` (`src/scanUI.js`) now classifies from the
  already-loaded higher-resolution `state.fullCanvas` instead of the
  coarser `state.analysisCanvas` (roughly doubling pixels per cell, so the
  same real-world bleed is a much smaller fraction of each boundary cell's
  crop). Confirmed on a purpose-built synthetic blank grid carrying the
  same labeling convention (the real ground-truth image turned out to
  already be a genuine mid-solve puzzle, not the clean blank test case
  first assumed): false positives dropped from 3 to 1, with the single
  remaining case (the grid's own corner cell, contaminated from two
  directions at once) an accepted, documented residual limitation — same
  precedent as the existing OCR-noise "good enough for now" call. All 841
  tests pass; not yet real-device-confirmed. See `TODO.md`'s Completed
  Tasks for the full writeup, including the real-image investigation
  details.

**Current objective has four new items**:

1. **Confirmed requirement: Undo right after a drag should undo the WHOLE drag
   in one action, not cell-by-cell.** Worth verifying the actual current
   behavior first, though — Redo's original design already documented a
   drag-paint batch as undoing "as one unit," so this may already work, or it
   may be a real regression from that intended design rather than a net-new
   feature. Confirm before assuming either way.
2. **Real-world OCR finding worth investigating specifically, not just
   general noise**: consistent 7-hallucination and 2-dropping across several
   real imports — meaningfully more specific than the vague noise the
   original "accepted limitation" decision was based on. Worth testing
   against real images showing this pattern if available, per this
   project's usual practice. Not a reversal of the general OCR-noise
   acceptance — scoped to this specific pattern only.
3. **Remove the tooltip popup for X (Mark-empty) entirely** — resolves the
   previously-open "should this even show" question. Fill's own tooltip is
   unaffected unless separately requested.
4. **Hard-to-pin-down bug: an occasional tap doesn't register as the player
   intended, resulting in an unexpected mistake charge.** Genuinely uncertain
   cause — touch-target imprecision and the recent opposite-mark tap-to-erase
   behavior (requiring a second tap in some cases) are both plausible.
   Recommended: build lightweight diagnostic logging (same spirit as the
   `?debug=scroll` tooling that eventually cracked the scroll bug) rather
   than keep guessing, since real data would likely settle this quickly.

See `TODO.md` for full detail on all four.

**ON HOLD, per the project owner directly: the multi-candidate split-buttons
feature is not being built right now.** The "1410" bug is fixed and
CONFIRMED working on a real subsequent scan with the single-suggestion
approach — rather than build the multi-candidate extension immediately, the
project owner wants to see how single-suggestion holds up across more real
use first. Revisit only if that proves insufficient. Original idea for
reference: offer MULTIPLE candidate split buttons for genuinely ambiguous
merged numbers, capped at 3 (the project owner's own suggested bound, backed
by real reasoning: realistic puzzle sizes rarely produce more than a couple
of plausible multi-number merges at once). Generalizes
`suggestOversizedClueSplit`'s existing single-widest-gap approach to also
consider near-tied gaps and genuine 3-way splits (two cut points), not just
one. See `TODO.md` for full detail.

**New real bug (NOT a genuinely ambiguous case, per direct correction) in the
just-shipped oversized-clue-split feature: a confirmed fresh, untouched OCR
read of "1410" in a 25-wide line was correctly flagged, but no split-
suggestion button appeared at all.** "1410" has essentially one sensible
reading ("14, 10") — a real three-way split would need a visible gap between
the "1" and "4" that isn't there in a cleanly-merged block, so this isn't a
legitimately low-confidence case declining to guess; something is producing
a wrong (empty) result. Investigate directly which safety condition is
firing incorrectly (gap-count mismatch, tied gap widths, untrusted `geoms`
entry) vs. a plainer indexing/alignment bug between the flagged position and
its `geoms` entry. See `TODO.md` for full detail.

- **The "1410" bug above — fixed, CONFIRMED both by direct reproduction (a
  realistic synthetic recreation, not the original photo, which wasn't
  available this round) and by a real subsequent scan producing a genuine
  merged-number case the fix handled correctly.** Real cause: a monospaced/
  tabular digit font
  renders "1410" with genuinely IDENTICAL pixel gaps between every digit
  ([7, 7, 7], confirmed by rendering it and measuring — and confirmed
  against the deployed code directly: `suggestOversizedClueSplit('1410',
  [7,7,7])` returned `null`) — a real tie with zero signal, not stale/absent
  geometry. Fix: `suggestOversizedClueSplit` (`src/ocrSegment.js`) now takes
  an optional `lineLength` and first filters every possible split down to
  ones where both sides are legal clue values (≤ the line length) — for
  "1410" in a 25-wide line that leaves only "14, 10", resolved with zero gap
  data needed; gap evidence only breaks a tie when more than one split
  survives that filter (a genuinely longer line), which is the real scope
  for the next queued multi-candidate feature, not every monospaced-font
  tie. `scanUI.js`'s `suggestSplitFor` passes `oversized.lineLength` through
  and no longer bails when `gaps` is missing. Fully backward compatible
  (`lineLength` optional, every existing caller/test unaffected). 9 new/
  updated tests; all 857 pass. **Deliberately scoped to just this fix** —
  the multi-candidate feature above was not started this round, per the
  standing instruction to fix the known-broken single-guess case first.

- **The "Mark empty" tooltip-never-dismisses bug — fixed, root-caused, and
  verified via a direct reproduction of the real failure mechanism, not just
  patched to the symptom.** Real cause: iOS Safari fires a synthetic
  "compatibility" mouseenter roughly 300ms after a real touchend (documented
  WebKit behavior) — indistinguishable from a genuine hover, so it re-ran
  `showTooltip()` shortly after every tap, and `showTooltip()`
  unconditionally clears any pending auto-hide timer, leaving the tooltip
  stuck open with no `mouseleave` (touch never fires one) to close it until
  an unrelated blur happened (switching to Fill) — exactly the reported
  symptom. Fixed in `src/tooltip.js`: a `lastTouchAt` timestamp set on
  `touchstart`, checked by `mouseenter` to ignore a ghost hover event
  arriving within 700ms of a real touch on the same element. Verified by
  reproducing the exact bug on the pre-fix code in browser preview (dispatch
  `touchstart` then a `mouseenter` ~350ms later — tooltip still visible at
  +1950ms), then confirming the fixed code auto-hides in the same scenario,
  plus confirming genuine desktop hover (no preceding touch) is unaffected.
  All 857 tests pass. **Item 2 (whether to suppress the tooltip entirely for
  Fill/Mark-empty) was deliberately left for a future round** — the ask this
  round was to fix the bug, which the auto-dismiss fix alone satisfies.
  **CONFIRMED on the real device by the project owner.** See `TODO.md` for
  the full writeup.

**New: further toolbar reorganization — move Fill/X down to join Undo/Redo/
Eraser in the existing `.board-controls` row below the board, move Library
into Fill/X's now-vacated main-toolbar spot, and center both rows.** A gap
should separate the Fill/X cluster from the Undo/Redo/Eraser cluster within
`.board-controls`, matching the existing gap pattern used elsewhere; exact
left-right order between the two clusters isn't strictly specified (Code's
call). Library takes over the main toolbar position Fill/X used to occupy
rather than leaving a gap; the rest of that row (Stats/Mute/Save/Help)
otherwise stays as-is, just centered as a whole. See `TODO.md` for full
detail.

- **The toolbar reorganization above — done, preview-verified via direct
  `getBoundingClientRect` measurements.** Fill/X moved into `.board-controls`
  (Fill/X → gap → Undo → Redo → gap → Eraser, the literal reading of the
  request order); Library took over the vacated main-toolbar slot; both rows
  gained `justify-content: center` (`.board-controls` already had it from an
  earlier round). Verified directly that each row's buttons are centered as a
  group, not just individually, and that the mode-toggle's click wiring
  (looked up by id in `app.js`) survived the DOM move unchanged. All 852 tests
  pass. Not yet real-device-confirmed. See `TODO.md`'s Completed Tasks for
  the full writeup.

**New: revisit the earlier "flag, don't auto-split" decision for oversized
clue numbers — better evidence is available than the final merged string
alone.** `ocrSegment.js` already measures real glyph gap widths to decide
where numbers separate (~10-12px within a number, ~18-27px between numbers)
— if that raw data is still recoverable at the point a number gets flagged
as impossible, the widest internal gap in the merged digits is a much
stronger signal for the true split than blind string-splitting was. Real
open question for Code to check directly: is that gap data actually still
available at the point `findOversizedClue` runs, or does it need to be
threaded through/re-derived? Suggested UX: pre-fill a suggested split as an
editable starting point, not a silent auto-apply — keeps player oversight
while giving a real head start. See `TODO.md` for full detail.

- **The auto-split-suggestion revisit above — done, preview-verified; not yet
  checked against a real end-to-end OCR scan.** Answering the ask's own "real
  open question" directly: the raw per-glyph gap data is NOT still available
  at `findOversizedClue` time — it had to be threaded through explicitly.
  `recognizeStripSegmented` (`src/scanUI.js`) now also returns `geoms` (the
  real per-glyph gap list behind each recognized number, or `null` when that
  correspondence can't be trusted), captured at the one point this geometry
  still exists. New pure `suggestOversizedClueSplit(valueText, gaps)`
  (`src/ocrSegment.js`) picks the widest gap as the split point; a new
  alignment gate (`buildClueRow`'s `suggestSplitFor`) refuses to suggest a
  split if the player has since edited that value, rather than guessing from
  stale geometry. UX exactly as suggested: a new amber button pre-fills the
  field with the suggested split as an editable starting point — never a
  silent auto-apply. 7 new unit tests; all 852 pass. Verified live via
  dynamic import and a direct DOM/CSS render check; not yet run against a
  real photo with a genuine OCR merge (this project's own "prefer real image
  data" rule). See `TODO.md`'s Completed Tasks for the full writeup.

**A much sharper, decisive fix for the scan margin-numbers bug, directly
proposed by the project owner.** "If there are literally no squares filled
and just X's, just erase the X's. I would never just put X's in a puzzle and
scan it." Sidesteps the pixel-precision problem entirely: a detected fill
state of zero FILLED cells and only EMPTY/X marks isn't a realistic scan
result, so treat it as 100% false positives from margin-number bleed and
reset the whole grid to blank. Keep last round's higher-resolution-canvas fix
too — it handles puzzles with genuine partial fill progress, a different
case this new heuristic doesn't cover. See `TODO.md` for full detail,
including the one theoretical edge case (X's-only scratch marks before any
fills) the project owner has explicitly accepted as a tradeoff.

- **The scan margin-numbers sharper fix above — done, unit- and
  preview-verified; not yet re-checked against a real photo.** New pure
  `suppressAllXNoFillFalsePositive(grid)` (`src/cellStateDetect.js`): a grid
  with zero FILLED and at least one EMPTY cell resets entirely to UNKNOWN,
  otherwise passes through unchanged. Wired into `detectFillState`
  (`src/scanUI.js`) as a post-processing pass over `classifyGridCells`' own
  output — the higher-resolution-canvas fix from last round is untouched and
  still active alongside it. 4 new unit tests; all 852 pass. Verified live via
  dynamic import against both the "all X, no fill" and "genuine partial
  progress" cases. Not yet re-run against the real ground-truth scan image
  this fix is meant to resolve the residual corner-cell case for. See
  `TODO.md`'s Completed Tasks for the full writeup.

**HIGH PRIORITY — new real bug: a hint's actual suggested NEW cell (not the
reasoning cells shown alongside it) is sometimes already correctly filled
in** — directly confirmed with the project owner, not a UI-clarity mix-up
between "reasoning" and "result" highlighting. This hits the core value
proposition of the whole app (genuinely new, correct guidance), so treat as
top priority, ahead of the elapsed-time bug below. Two concrete places to
investigate, not a prescribed fix: (1) whether `getNextHint`/the line
techniques in `lineSolver.js` properly guarantee every `resultCells` entry is
currently UNKNOWN on the live board right before returning; (2) given how
much drag/tap/board-mutation logic has changed very recently (opposite-mark
erase, deferred-clear pass-through, axis-lock), whether a cell's actual board
state could have gotten out of sync with what's visually rendered. A specific
repro would help a lot if reconstructable. See `TODO.md` for full detail.

**The elapsed-time bug — FIXED, preview-verified with a controlled fake
clock, not yet real-device-confirmed.** `puzzleStartTime` (a fixed
`Date.now()` baseline) replaced with a pause/resume active-time accumulator
(`activeElapsedMs`/`activeSegmentStart`, `getElapsedMs()`), driven by the
same `visibilitychange` listener already wired up for autosave — exactly the
reuse originally recommended. Verified with a monkey-patched clock (pause,
jump the fake clock forward 1 simulated hour, resume, solve `heart-5` for
real via real dispatched pointer events) — the completion modal correctly
showed only the genuine foreground time, not the hour-plus a pre-fix build
would have shown. **Worth knowing**: that verification (a real puzzle
completion, even under a simulated clock) triggered real fire-and-forget
writes to live production Firestore, including a genuine global-fastest-time
submission for `heart-5` — checked immediately via a read-only fetch and
confirmed it did NOT beat the real ~15.2s record (this test's ~52s lost
fairly), so no corruption happened this time, but it's the same class of
"a verification step turned into an unplanned live write" as the earlier
fabricated-record incident. See `TODO.md` for full detail.

**Two related drag-behavior refinements — done, preview-verified (real
dispatched pointer events, not synthetic unit calls); not yet
real-device-confirmed.**
1. **Starting a drag on a cell already in the SAME state the drag is about to
   paint no longer clears it — it's a pass-through, and the drag continues
   normally.** Refines (not reverses) the earlier drag fix, which deliberately
   preserved toggle-to-clear for a plain single tap — that tap behavior is
   untouched; only the *start of a drag* skips it now. Since a tap and the
   start of a drag are indistinguishable until real movement happens, the
   toggle-clear decision for exactly this case is deferred
   (`dragging.pendingClearEl`, `app.js`) — `pointermove`'s existing axis-lock
   detection discards it once a genuine drag is confirmed, or `endDrag`
   applies it if the gesture turns out to have been a plain tap after all.
   Symmetric for Fill/Mark-empty; Eraser is unaffected (its own target is
   always UNKNOWN, so the case can't arise for it).
2. **The live drag cell-count badge now counts the drag's actual span (start
   to current position along the locked axis), not just newly-painted cells.**
   An already-correctly-filled cell the drag passes over now counts toward a
   clue's run length. Simple calculation thanks to the recent axis-lock
   feature: `dragging.count = |current − start| + 1` along the one locked
   axis, recomputed every `pointermove` once `lockAxis` is set.

Verified directly in browser preview (real `PointerEvent`s dispatched on grid
cells): pressing an already-FILLED cell to start a Fill drag left it FILLED
throughout while the badge correctly read the full span (2, then 3) across
already-filled plus newly-filled cells; symmetric in Mark-empty mode; a
genuine plain tap (no movement) on an already-marked cell still cleared it as
before; the pre-existing opposite-mark tap-to-erase and Eraser mode were both
re-checked unaffected. All 836 tests pass (pure `app.js` DOM-event change). See
`TODO.md` for the full writeup.

**Drag-axis lock — done, preview-verified (real dispatched pointer events, not
synthetic unit calls).** A drag now locks to the row or column it started on
for the whole gesture, per direct request ("if I started filling on one row,
I should stay on that row the whole time"). `attachPointerHandlers`'s
`dragging` state (`app.js`) gains `startRow`/`startCol`/`startClientX`/
`startClientY` at `pointerdown` and a `lockAxis` (`'row' | 'col' | null`) that
`pointermove` sets, once, from raw pointer/pixel movement (dx vs. dy since the
drag started, not which grid cell was first reached — a fast movement can
land on a diagonal cell on its very first sample) once that movement clears a
small `AXIS_LOCK_THRESHOLD_PX` (6px) noise floor. Once locked, the sampled
cell is clamped to the starting row/column BEFORE the existing Bresenham
`cellsOnLine` line-walk runs, so the interpolated path between samples stays
on-axis too rather than cutting diagonally — this is what makes it correct
for a fast/diagonal-first-sample drag, not just a slow one. Sits in the one
shared `pointermove` path all three modes (Fill, Mark-empty, Eraser) already
funnel through, so no per-mode duplication was needed; confirmed directly for
all three in browser preview, plus that the lock persists even when a later
sample in the same gesture drifts hard the other way. No automated test added
— same "no jsdom in this project, DOM/pointer features are browser-preview-
verified" precedent the crosshair-highlight and drag-fill-counter features
already established. All 836 tests still pass (pure `app.js` change).
**CONFIRMED on the real device by the project owner** — real touch-drag
behavior matches the intended axis-lock. See `TODO.md` for the full writeup.

**The OCR "hallucinates 7s, drops 2s" pattern is now fixed and verified — see
the Completed Tasks entry above for the full writeup.** The previous round's
own "likely mechanism" guess (pixel-level glyph-blob-counting) turned out to
be wrong once actually investigated: it was two different real bugs, a
border-line-bleed geometry issue (the "7") and an isolated-single-digit OCR
page-segmentation-mode issue (the "2"s/"1"s), both root-caused against the
real ground-truth image and confirmed fixed by re-running the actual scan
wizard end-to-end — every row and column clue now reads exactly correct.
No current objective is queued on this front.

**Taking the multi-way-split feature OFF HOLD, plus a refinement to when
confirmation is required.** Real trigger: "4102, 2, 7" — "4102" needs a
THREE-way split ("4, 10, 2"), which the current binary-split-only feature
structurally cannot produce. Reactivating the original on-hold spec (see
`TODO.md`'s Completed Tasks for the full original spec, preserved
unchanged). New refinement per direct feedback ("I don't even understand
really why I even need to verify something like this case"): when
structural filtering narrows a case down to exactly ONE legal candidate
(2-way or 3-way), apply it directly with no confirm click — reserve the
"show buttons, let the player choose" UX specifically for cases where
genuine ambiguity remains after filtering. Applies to the existing
binary-split path too, not just new multi-way cases. See `TODO.md` for full
detail.

The scroll bug's original scan-wizard trigger remains genuinely fixed and
confirmed, and the library-rename trigger is now ALSO confirmed on the real
device — the underlying `visualViewport` mechanism was never actually fixed,
but both specific triggers are gone by design, both confirmed. **The bug as a
general class is still NOT fully closed** — a text input positioned near the
bottom of the screen anywhere else in the app remains a theoretical risk (see
`TODO.md`'s general-principle note on this) — but there is no further active
work on it right now beyond the item above. The section below is kept purely for historical
reference on the underlying mechanism itself:
- The double-tap-zoom and fast-drag-cell-skipping fixes are CONFIRMED on the
  real device.
- Round 4's scroll fix FAILED real-device verification — the sixth straight
  round to fail on this bug class. A real before/after capture (manually
  forcing the "heal" button) proved the technique only recomputes
  `window.innerHeight`, never `visualViewport.height` — the visible symptom
  (EXCESS) was completely unchanged, 79px both before and after.
- Round 5 (viewport-meta re-parse) is implemented but NOT real-device-verified —
  needs a real on-device check via the "Force heal viewport height now" debug
  button before it can be trusted, same as every prior round.
- The pan-correction mechanism (`correctResidualViewportPan`/`window.scrollTo`)
  is conclusively proven broken on the real device and should not be refined
  further — a genuinely different technique is needed if that gets picked up.

Item 8 (arbitrary-photo puzzle generation) is DECIDED WON'T BE BUILT — see `TODO.md`'s
Next Steps for the full reasoning (genuinely hard image-processing problem, limited
realistic use even if built well). Item 9's remaining scope is now just richer browsing
(search, sort, pagination) — the friends-sharing question is resolved.
