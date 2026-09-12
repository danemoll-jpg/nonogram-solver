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
//
// Real bug found and fixed (Current Objective — see TODO.md): "the hint's suggested cell is
// sometimes already correctly filled in." The solver and the on-screen highlight were both
// already provably correct (every resultCell is guaranteed UNKNOWN at computation time — see
// lineSolver.js), and extensive stress-testing found no board/DOM desync either — the actual
// cause was this file's own LLM path. `phraseHint` used to be hand the exact result-cell
// coordinates and be asked to restate them in its own freely-varied prose — a paraphrase task
// an LLM can get numbers wrong on, unlike a template render. When it named the wrong cell, and
// that cell happened to already be filled (likely on a board that's mostly filled in already),
// the hint read as pointing at something already done. Confirmed by the project owner: this
// predates the recent drag/tap work entirely, is intermittent, and is specifically about what
// the hint *says*, not the mechanics — all consistent with LLM output variance, not a
// deterministic code bug. Fixed at the source (functions/index.js's SYSTEM_PROMPT/
// describeDeduction): the LLM is no longer given exact cell coordinates at all and is told not
// to invent any — its only job now is the reasoning. `factualDirective` below is the one place
// exact cells are ever stated, and it's plain code, not a paraphrase — prepended to whatever
// reasoning text comes back (LLM or fallback).

import { getPhraseHintCallable } from './firebase.js';

// The authoritative, code-generated statement of exactly which cells to mark and how — see
// this file's header comment. Built straight from the same deduction data that drives the
// on-screen highlight, so it can't diverge from what's actually correct. Exported for direct
// unit testing (test/hintPhrasing.test.js) — everything else in this file either needs a live
// network call (llmPhraser) or is randomized (defaultPhraser's pick()), neither of which are
// as cleanly testable as this pure, deterministic formatter.
export function factualDirective(deduction) {
  const { line, resultCells, resultState } = deduction;
  if (!resultCells || resultCells.length === 0) return null;
  const lineName = describeLine(line);
  const verb = resultState === 'filled' ? 'Fill' : 'Mark empty';
  const cells = resultCells.map((c) => `(row ${c.row + 1}, col ${c.col + 1})`).join(', ');
  return `${lineName ? `${lineName}: ` : ''}${verb} ${cells}.`;
}

async function llmPhraser(deduction) {
  const directive = factualDirective(deduction);
  try {
    const phraseHint = await getPhraseHintCallable();
    const result = await phraseHint({ deduction });
    const reasoning = result?.data?.text;
    if (typeof reasoning === 'string' && reasoning.trim()) {
      return directive ? `${directive} ${reasoning.trim()}` : reasoning.trim();
    }
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
