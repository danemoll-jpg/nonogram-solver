// Sound-effect plumbing (Current Objective item 3). Plays short SFX for player actions.
// Built against placeholder/silent audio (see assets/sounds/README.md) — every trigger
// point and the mute toggle work today, and dropping in real files at the same paths later
// needs no code changes here.
//
// playSound() never throws: a missing file, a decode error, and a browser autoplay
// restriction all just mean no sound plays. Gameplay must never depend on audio succeeding.

const SOUND_BASE = 'assets/sounds/';

const SOUND_FILES = {
  fillClick: 'fill-click.mp3',
  xClick: 'x-click.mp3',
  batchCompleteChime: 'batch-complete-chime.mp3',
  error: 'error.mp3',
  completeFanfare: 'complete-fanfare.mp3',
  lock: 'lock.mp3',
  unlock: 'unlock.mp3',
  dragSweep: 'drag-sweep.mp3', // used by the 'retrigger' drag-sweep mode — see below
};

const MUTE_STORAGE_KEY = 'nonogram:muted';

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false; // localStorage unavailable (private mode, embedded webview) — default unmuted
  }
}

let muted = loadMuted();

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
  } catch {
    // best effort — mute state just won't persist across sessions this time
  }
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

const audioCache = new Map(); // key -> HTMLAudioElement, lazily created and reused as a template

function getAudio(key) {
  let audio = audioCache.get(key);
  if (!audio) {
    audio = new Audio(SOUND_BASE + SOUND_FILES[key]);
    audio.preload = 'auto';
    audioCache.set(key, audio);
  }
  return audio;
}

// Plays a named sound (see SOUND_FILES above). Clones the cached element for each play
// rather than reusing one <audio> per key — a fast drag can trigger fill-click/drag-sweep
// several times before the first playback finishes, and reusing one element would cut the
// earlier play short instead of overlapping.
export function playSound(key) {
  if (muted) return;
  if (!SOUND_FILES[key]) return;
  const node = getAudio(key).cloneNode();
  node.play().catch(() => {}); // see file comment — never let a playback failure surface
}

// ---- drag-sweep prototyping (Current Objective item 3) ----
//
// Two candidate playback approaches for the sound while dragging across cells, both wired
// up against the same placeholder file so they can be compared before deciding what kind of
// asset to actually generate:
//
//   'retrigger' (default) — replays a short sample once per cell the drag newly touches,
//     fast enough at normal drag speed to blend into a single scraping/zipper-like run.
//     Scales naturally to drag speed and cell count: more cells crossed per second just
//     means more overlapping retriggers, with no pitch or tempo distortion.
//
//   'stretch' — plays one long sample once per drag stroke (looped for however long the
//     drag lasts) for a continuous glissando-style sweep instead of discrete ticks. Doesn't
//     actually vary with drag speed without real time-stretching (a much bigger asset-
//     pipeline lift than this prototype needs) — it can only start/stop with the stroke.
//
// Recommendation (see TODO.md for the full writeup): 'retrigger'. It's the standard pattern
// for this kind of continuous-across-discrete-units feedback (scroll ticks, minesweeper
// flood-fill, rapid-fire UI sounds) specifically because it scales with however many cells
// get crossed rather than forcing a fixed-duration sample to represent a variable-length
// action, and it needs no pitch-shifting trickery to avoid sounding wrong at different drag
// speeds. It's wired as the default below; 'stretch' stays implemented for a side-by-side
// comparison via ?dragSweep=stretch, but isn't the shipped behavior.
const DRAG_SWEEP_MODE =
  new URLSearchParams(window.location.search).get('dragSweep') === 'stretch' ? 'stretch' : 'retrigger';

let stretchAudio = null;

function startDragSweepStretch() {
  if (muted) return;
  if (!stretchAudio) {
    stretchAudio = new Audio(SOUND_BASE + SOUND_FILES.dragSweep);
    stretchAudio.loop = true;
  }
  stretchAudio.currentTime = 0;
  stretchAudio.play().catch(() => {});
}

function stopDragSweepStretch() {
  stretchAudio?.pause();
}

/** Call once per cell a drag newly touches (not the cell the drag started on). */
export function onDragSweepCell() {
  if (DRAG_SWEEP_MODE === 'retrigger') playSound('dragSweep');
  // 'stretch' mode doesn't need per-cell calls — startDragSweep/stopDragSweep bracket it.
}

/** Call once when a drag stroke begins. */
export function startDragSweep() {
  if (DRAG_SWEEP_MODE === 'stretch') startDragSweepStretch();
}

/** Call once when a drag stroke ends (pointerup/pointercancel). */
export function stopDragSweep() {
  if (DRAG_SWEEP_MODE === 'stretch') stopDragSweepStretch();
}

export function dragSweepModeInUse() {
  return DRAG_SWEEP_MODE;
}
