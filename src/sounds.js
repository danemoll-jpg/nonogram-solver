// Sound-effect plumbing. Plays short SFX for notable player-facing events — a line locking
// or unlocking, a mistake, a multi-cell batch, or solving the puzzle — deliberately not for
// every routine fill/X mark or drag-sweep step (removed per the project owner's feedback
// that the per-cell dinging was annoying; see TODO.md's Completed Tasks).
// Built against placeholder/silent audio (see assets/sounds/README.md) — every trigger
// point and the mute toggle work today, and dropping in real files at the same paths later
// needs no code changes here.
//
// playSound() never throws: a missing file, a decode error, and a browser autoplay
// restriction all just mean no sound plays. Gameplay must never depend on audio succeeding.

const SOUND_BASE = 'assets/sounds/';

// Current Objective (see TODO.md): fillClick/xClick/dragSweep were removed from here (and
// every call site in app.js) on the project owner's direct feedback that the per-cell
// dinging on every routine fill/X mark or drag-sweep step was annoying. Only sounds that
// signal something notable — not ordinary clicking/dragging — remain.
const SOUND_FILES = {
  batchCompleteChime: 'batch-complete-chime.mp3',
  error: 'error.mp3',
  completeFanfare: 'complete-fanfare.mp3',
  lock: 'lock.mp3',
  unlock: 'unlock.mp3',
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
// rather than reusing one <audio> per key — a multi-cell batch (auto-X, a hint) can trigger
// the same sound more than once in quick succession, and reusing one element would cut the
// earlier play short instead of overlapping.
export function playSound(key) {
  if (muted) return;
  if (!SOUND_FILES[key]) return;
  const node = getAudio(key).cloneNode();
  node.play().catch(() => {}); // see file comment — never let a playback failure surface
}
