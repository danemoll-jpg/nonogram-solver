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

// Tesseract's PSM (page segmentation mode) enum, captured once alongside the worker module —
// see recognizeClueStrip's `singleWord` option for why a non-default mode is needed at all.
let psmEnum = null;

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
      const mod = (await import(TESSERACT_ESM_URL)).default;
      psmEnum = mod.PSM;
      const worker = await mod.createWorker('eng');
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
//
// `singleWord`: real, confirmed root cause of the "silently drops a digit" pattern (see
// TODO.md's Current Objective and ocrSegment.js's filterBorderBleedGlyphs for the OTHER real
// OCR bug found the same round) — Tesseract's default page-segmentation mode (PSM.AUTO, tuned
// for a page/block of normal text) frequently returns NOTHING AT ALL for a crop this feature
// already knows, from its own pixel geometry, contains exactly one isolated
// number/character — every column-clue crop, by construction (a column stacks one number per
// text line), plus any per-number fallback crop in the row/slow path. Confirmed directly
// against the real 25x25 ground-truth image's actual failing crops (see TODO.md): AUTO
// returned empty text for the crop behind a real, perfectly legible digit in the majority of
// the cases tested, while PSM.SINGLE_WORD (mode 8 — "treat the image as a single word", no
// page/paragraph layout assumptions to reject a single small isolated blob as noise) read
// EVERY one of those same crops correctly, including ones where PSM.SINGLE_CHAR (mode 10 —
// seemingly the more obviously "right" choice for a single digit) also still failed. Scoped to
// an explicit opt-in flag, not a global default change, so the already-reliable multi-number
// whole-line path (several numbers sharing one line, e.g. a row clue like "3, 1, 1, 3") keeps
// its existing AUTO behavior untouched — that path benefits from genuine multi-token context
// AUTO is designed for, and this project has no evidence it needs changing. Resets back to
// AUTO after the call (rather than leaving the shared, session-long worker stuck in
// single-word mode) since later calls on the same worker may need the multi-number path.
export async function recognizeClueStrip(canvas, { singleWord = false } = {}) {
  const worker = await getWorker();
  if (singleWord && psmEnum) await worker.setParameters({ tessedit_pageseg_mode: psmEnum.SINGLE_WORD });
  const { data } = await worker.recognize(canvas);
  if (singleWord && psmEnum) await worker.setParameters({ tessedit_pageseg_mode: psmEnum.AUTO });
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
