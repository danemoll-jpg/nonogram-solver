// Cloud Function backing item 7.6: takes the structured "deduction" object the solver
// already produces (src/hintPhrasing.js on the client) and asks an LLM to phrase it as a
// short, conversational hint. The LLM API key lives only here (as a Secret Manager secret,
// never in client code or source control) — see functions/README.md for deploy steps.
//
// Callable (not a raw HTTPS endpoint) so the client gets request/response marshalling and
// CORS handling for free via the Firebase SDK (see src/firebase.js).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are a friendly, experienced nonogram (picross) solver helping a
player who is stuck. You'll be given one structured deduction describing a single forced
move the solver already computed — your only job is to phrase it in natural, varied,
conversational language, the way an experienced human solver would explain their reasoning
out loud.

Rules:
- 1-2 sentences. No preamble, no restating these instructions, no markdown.
- Explain the *reasoning*, not just the answer — reference the clue numbers and cells
  described, so the player learns the technique, not just this one move.
- Rows and columns are already given 1-indexed for display — use those numbers as-is.
- If the technique is "mistake", gently explain what's wrong, not how to fix everything else.
- Never mention anything beyond the single deduction you're given — no spoilers about the
  rest of the board.`;

exports.phraseHint = onCall({ secrets: [anthropicApiKey], cors: true }, async (request) => {
  const deduction = request.data?.deduction;
  if (!deduction || typeof deduction !== 'object' || typeof deduction.technique !== 'string') {
    throw new HttpsError('invalid-argument', 'Expected { deduction: { technique, ... } }.');
  }

  const apiKey = anthropicApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY secret is not configured.');
  }

  const prompt = describeDeduction(deduction);

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    throw new HttpsError('unavailable', `Could not reach the LLM API: ${err.message}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new HttpsError('internal', `LLM API returned ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.content?.find((block) => block.type === 'text')?.text?.trim();
  if (!text) throw new HttpsError('internal', 'LLM response had no text content.');

  return { text };
});

// ---- deduction -> plain-language prompt (mirrors src/hintPhrasing.js's defaultPhraser,
// but describes the facts for the LLM to phrase rather than picking a fixed template) ----

function describeLine(line) {
  if (!line) return null;
  const label = line.type === 'row' ? 'Row' : 'Column';
  return `${label} ${line.index + 1}`;
}

function describeClue(clue) {
  if (!clue || clue.length === 0) return '(empty — the whole line is blank)';
  return `[${clue.join(', ')}]`;
}

function describeCells(cells) {
  if (!cells || cells.length === 0) return 'none';
  return cells.map((c) => `(row ${c.row + 1}, col ${c.col + 1})`).join(', ');
}

function describeDeduction(deduction) {
  const { technique, line, reasoningCells, resultCells, resultState, meta = {} } = deduction;
  const lines = [
    `technique: ${technique}`,
    `line: ${describeLine(line) ?? 'n/a'}`,
    `clue for that line: ${describeClue(meta.clue)}`,
    `line length: ${meta.length ?? 'n/a'}`,
    `reasoning cells (already-known marks the deduction relies on): ${describeCells(reasoningCells)}`,
    `result cells (what the player should mark now): ${describeCells(resultCells)}`,
    `result state to mark them: ${resultState}`,
  ];
  if (technique === 'edge') lines.push(`matched run length: ${meta.runLength}`);
  if (technique === 'contradiction') {
    lines.push(`hypothesis that was tried and failed: ${meta.hypothesis}`);
    lines.push(`so the cell is forced to: ${meta.forced}`);
  }
  if (technique === 'mistake') {
    lines.push(`the player marked it: ${meta.markedAs}`);
    lines.push(`it should be: ${meta.shouldBe}`);
  }
  return lines.join('\n');
}
