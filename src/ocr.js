// Lazy Tesseract.js client for reading printed clue numbers off a scanned/photographed
// puzzle (item 10). Loaded from the CDN as an ES module — no bundler/npm install, matching
// src/firebase.js's pattern — and only on first use, so importing this module never touches
// the network by itself. Not unit-tested (network + WebAssembly worker, browser-only),
// same as src/firebase.js.

const TESSERACT_VERSION = '5.1.1';
const TESSERACT_ESM_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`;

// A clue strip is only ever digits plus the punctuation/whitespace a printed clue uses
// between numbers — constraining recognition to this whitelist measurably improves accuracy
// over unconstrained text recognition, and it's the whole reason this isn't just "read the
// image" generically.
const CLUE_CHAR_WHITELIST = '0123456789 ,\n';

let workerPromise = null;

// One shared worker for the whole scan session (created lazily, on first recognizeClueStrip
// call) rather than one per strip — each worker carries real startup cost (loads the
// wasm core + language data over the network), and a puzzle scan needs one per row/column,
// easily 10-20+ calls.
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      // tesseract.js's ESM build only has a default export bundling everything (no named
      // exports) — confirmed against the actual CDN file rather than assumed, since this is
      // the kind of mismatch that only shows up at runtime otherwise.
      const { createWorker } = (await import(TESSERACT_ESM_URL)).default;
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: CLUE_CHAR_WHITELIST });
      return worker;
    })();
  }
  return workerPromise;
}

// Recognizes text from one clue-strip canvas (a row's or column's worth of printed clue
// numbers). Returns the raw recognized text — parsing it into a clue array is
// src/scanPuzzle.js's parseClueText, kept separate so that parsing logic stays unit-testable
// without a real OCR call.
export async function recognizeClueStrip(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return data.text;
}

// Releases the worker (and its wasm/network resources) once a scan session is done —
// call when the wizard closes, whether it finished or was cancelled.
export async function terminateOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
