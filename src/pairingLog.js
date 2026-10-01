// Device-local breadcrumb log for the pairing flow. Real-device report: on the iPad Home
// Screen app, tapping Link closed the Stats & pairing window before "Linking…" ever showed,
// and nothing linked — not reproducible off-device. Each step is written to localStorage as
// it happens (not kept in memory), so the trail survives the app restarting or crashing
// mid-attempt; the stats modal shows it, letting the player read off exactly where an attempt
// stopped. Same "log real events on the real device instead of guessing" approach as the
// `?debug=scroll`/`?debug=taps` tools, but always on: it's a few short lines, only written
// around pairing, and the failure it exists to catch has no other way to be seen.
const STORAGE_KEY = 'nonogram.pairingLog';
const MAX_ENTRIES = 40;

export function readPairingLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function logPairingStep(message) {
  try {
    const entries = readPairingLog();
    entries.push({ t: Date.now(), message });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // localStorage unavailable — logging is best-effort and must never break pairing itself
  }
}

export function clearPairingLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Pure: formats entries as "HH:MM:SS  message" lines for display.
export function formatPairingLog(entries) {
  return entries
    .map(({ t, message }) => `${new Date(t).toTimeString().slice(0, 8)}  ${message}`)
    .join('\n');
}
