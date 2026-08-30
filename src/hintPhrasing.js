// Item 4/6: hint phrasing layer. Takes a structured deduction object (from solver.js,
// contradiction.js, or mistakes.js) and produces the natural-language text shown to the
// player. The solver never produces this text itself — it only produces facts.
//
// `phraseDeduction` calls a Firebase Cloud Function (`phraseHint`, see functions/index.js)
// which holds the LLM API key server-side and phrases the deduction (varied, conversational,
// "the way an experienced human solver would explain it"). If that call fails for any
// reason — offline, the Function isn't deployed yet, a transient error — it falls back to
// `defaultPhraser`, a deterministic template renderer, so a hint is never just silently
// missing. Everything upstream (solver, UI) only depends on this function's signature:
// (deduction) -> Promise<string>. `setPhraser` lets tests/dev swap in a different
// implementation (e.g. force the template renderer) without editing this module.

import { getPhraseHintCallable } from './firebase.js';

async function llmPhraser(deduction) {
  try {
    const phraseHint = await getPhraseHintCallable();
    const result = await phraseHint({ deduction });
    const text = result?.data?.text;
    if (typeof text === 'string' && text.trim()) return text.trim();
  } catch (err) {
    console.warn('LLM hint phrasing unavailable, falling back to template phrasing:', err);
  }
  return defaultPhraser(deduction);
}

let activePhraser = llmPhraser;

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
