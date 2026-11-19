import { cutSource, emphasisMark } from './video-plan.mjs';
import { patched } from './patches.mjs';
import { readCall } from './reply-requests.mjs';

export const unfenced = (raw) =>
  raw.replace(/^[ \t]*(?:`{3,}|~{3,})[\w-]*[ \t]*(?:\n|$)/gm, '').trim();

const short = (v) => typeof v === 'string' && v.trim() && v.length <= 500;
const text = (description) => ({ type: 'string', description });
const FLAG_PROBLEM = {
  name: 'flag_problem',
  description: 'Report one thing wrong with this cut; call once per problem, at most 8.',
  parameters: {
    type: 'object',
    properties: {
      cut: text('Where in the cut: the sentence, object or screen area.'),
      problem: text('What is wrong, in one short line.'),
    },
    required: ['cut', 'problem'],
  },
};
const FLAG_POOR_PIECE = {
  name: 'flag_poor_piece',
  description: 'Report one saved library piece (from libraryPieces) that is itself poorly drawn.',
  parameters: {
    type: 'object',
    properties: {
      piece: text('The piece name from libraryPieces.'),
      reason: text('What is poor about the piece itself.'),
    },
    required: ['piece', 'reason'],
  },
};
const PASS_CUT = {
  name: 'pass_cut',
  description: 'Pass the cut when nothing deviates from the plan.',
  parameters: { type: 'object', properties: {} },
};
const CALLS = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g;
// Without native tool calling the audit writes its calls as text; no result comes back.
export const AUDIT_TEXT_TOOLS =
  '\nYou cannot call tools natively. Write each call as <tool_call>{"name": "<tool>", "arguments": {...}}</tool_call>; no result comes back. Tools: ';

// One audit's flag_problem, flag_poor_piece and pass_cut calls, assembled into the issue shape the fix flow takes.
// Each call is checked as it arrives; a bad one gets an error naming the field.
export function auditReport(offered) {
  const issues = [],
    pieces = [];
  let passed = false;
  const tools = [FLAG_PROBLEM, PASS_CUT, ...(offered.length ? [FLAG_POOR_PIECE] : [])];
  const run = (name, input) => {
    if (name === PASS_CUT.name) {
      passed = true;
      return 'Cut passed.';
    }
    if (name === FLAG_PROBLEM.name) {
      if (!short(input?.cut)) throw new Error('cut must name where, in at most 500 characters.');
      if (!short(input.problem))
        throw new Error('problem must say what is wrong, in at most 500 characters.');
      if (issues.length >= 8) throw new Error('At most 8 problems; keep the most important.');
      issues.push({ what: input.problem, where: input.cut });
      return 'Problem recorded.';
    }
    if (name === FLAG_POOR_PIECE.name && offered.length) {
      if (!offered.includes(input?.piece))
        throw new Error(`piece must be one of: ${offered.join(', ')}.`);
      if (!short(input.reason))
        throw new Error('reason must say what is poor, in at most 500 characters.');
      pieces.push({ name: input.piece, why: input.reason });
      return 'Piece recorded.';
    }
    throw new Error(`Use ${tools.map((t) => t.name).join(', ')}.`);
  };
  return {
    tools,
    run,
    textTools: AUDIT_TEXT_TOOLS + JSON.stringify(tools),
    // Text-mode (or leaked) calls in the answer; unusable ones are dropped.
    read(raw) {
      for (const [, json] of raw.matchAll(CALLS)) {
        const call = readCall({ json });
        try {
          if (call.name) run(call.name, call.input);
        } catch {}
      }
    },
    pieces,
    // Null passes the cut; problems outrank a pass; neither throws, which keeps the cut as written.
    issues() {
      if (issues.length) return issues;
      if (passed) return null;
      throw new Error('Audit reported no verdict.');
    },
  };
}

// A fix answers {"patch", "emphasis"?} against source; an answer that does not parse, apply or read throws.
export function auditFix(raw, brief, sentences, engine, source, dimension = '2d') {
  const answer = JSON.parse(unfenced(raw));
  const code = typeof answer?.patch === 'string' ? patched(source, answer.patch) : null;
  if (typeof code !== 'string') throw new Error('The fix patch did not apply.');
  if (
    answer.emphasis !== undefined &&
    !(
      Array.isArray(answer.emphasis) &&
      answer.emphasis.length <= 12 &&
      answer.emphasis.every((m) => emphasisMark(m, dimension) && m.sentence < sentences)
    )
  )
    throw new Error('Fix returned unreadable emphasis.');
  return {
    code: engine === 'manim' ? code.trim() : cutSource(code, brief),
    ...(answer.emphasis && { emphasis: answer.emphasis }),
  };
}
