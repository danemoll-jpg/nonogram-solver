// Item 4: hint phrasing layer. Takes a structured deduction object (from solver.js,
// contradiction.js, or mistakes.js) and produces the natural-language text shown to the
// player. The solver never produces this text itself — it only produces facts.
//
// This file is a stand-in for the real design: an LLM call that phrases the deduction
// (varied, conversational, "the way an experienced human solver would explain it"). No
// backend/API key is wired up in this environment, so `phraseDeduction` below is a
// deterministic template-based renderer with a few varied phrasings per technique — good
// enough to use today, and it's the one function to swap out later.
//
// To add real LLM phrasing: replace the body of `phraseDeduction` with a call to your
// backend (e.g. a Firebase Cloud Function) that sends the deduction JSON to an LLM and
// returns its text — everything upstream (solver, UI) is unaffected because they only
// depend on this function's signature: (deduction) -> string. `setPhraser` lets the UI
// swap in that async implementation without editing this module.

let activePhraser = defaultPhraser;

export function setPhraser(fn) {
  activePhraser = fn;
}

export async function phraseDeduction(deduction) {
  return activePhraser(deduction);
}

function pick(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function describeLine(line) {
  if (!line) return null;
  const label = line.type === 'row' ? 'Row' : 'Column';
  return `${label} ${line.index + 1}`;
}

function describeClue(clue) {
  if (!clue || clue.length === 0) return 'empty';
  return clue.join(', ');
}

function cellsPhrase(cells) {
  if (cells.length === 1) return 'that cell';
  return `those ${cells.length} cells`;
}

function defaultPhraser(deduction) {
  const { technique, line, resultCells, resultState, meta } = deduction;
  const lineName = describeLine(line);
  const verb = resultState === 'filled' ? 'filled in' : 'marked empty';

  switch (technique) {
    case 'overlap': {
      const clueText = describeClue(meta.clue);
      return pick([
        `${lineName}'s clue is ${clueText} in a space of ${meta.length}, so no matter how the runs shift, ${cellsPhrase(resultCells)} must be filled — go ahead and fill ${resultCells.length === 1 ? 'it' : 'them'} in.`,
        `There isn't enough room in ${lineName} (length ${meta.length}) to avoid overlap for clue ${clueText}: ${cellsPhrase(resultCells)} ${resultCells.length === 1 ? 'is' : 'are'} covered by every possible arrangement, so ${resultCells.length === 1 ? 'it' : 'they'} can be ${verb} now.`,
      ]);
    }
    case 'edge': {
      return pick([
        `${lineName} already has a run of ${meta.runLength} touching the edge, matching its clue exactly — that run is done, so the next cell must be ${resultState}.`,
        `That edge run in ${lineName} is already the full ${meta.runLength} the clue asks for, so it can't extend any further: the cell right after it is ${resultState}.`,
      ]);
    }
    case 'gap-forcing': {
      return pick([
        `Given what's already known in ${lineName}, only one arrangement of the remaining clue numbers (${describeClue(meta.clue)}) fits the remaining space — that forces ${cellsPhrase(resultCells)} to be ${resultState}.`,
        `${lineName}'s known cells narrow things down enough that ${cellsPhrase(resultCells)} can only be ${resultState} for the clue ${describeClue(meta.clue)} to still fit.`,
      ]);
    }
    case 'contradiction': {
      const hyp = meta.hypothesis;
      return pick([
        `Trying "${hyp}" there makes ${lineName ? lineName + ' ' : 'a line '}impossible to satisfy, so it must actually be ${meta.forced}.`,
        `If that cell were ${hyp}, the puzzle couldn't be completed — so by elimination, it's ${meta.forced}.`,
      ]);
    }
    case 'mistake': {
      return `That cell doesn't match the solution — it should be ${meta.shouldBe}, not ${meta.markedAs}.`;
    }
    default:
      return `${lineName ?? 'This move'}: ${cellsPhrase(resultCells)} should be ${resultState}.`;
  }
}
