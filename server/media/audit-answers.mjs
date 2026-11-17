import { cutSource, emphasisMark } from './video-plan.mjs';
import { patched } from './patches.mjs';

export const unfenced = (raw) =>
  raw.replace(/^[ \t]*(?:`{3,}|~{3,})[\w-]*[ \t]*(?:\n|$)/gm, '').trim();

// An audit answers {"ok":true} or {"issues":[{what, where}]}, never code; null means ok, anything unusable throws.
export function auditIssues(raw) {
  const answer = JSON.parse(unfenced(raw));
  if (answer?.ok === true && !answer.issues) return null;
  const issues = answer?.issues;
  if (
    !Array.isArray(issues) ||
    !issues.length ||
    issues.length > 8 ||
    !issues.every((i) =>
      [i?.what, i?.where].every((v) => typeof v === 'string' && v.trim() && v.length <= 500),
    )
  )
    throw new Error('Audit returned unreadable issues.');
  return issues;
}

// Saved pieces an audit flags as poor, limited to the offered names; anything unusable flags none.
export function poorPieces(raw, offered) {
  let list;
  try {
    list = JSON.parse(unfenced(raw))?.pieces;
  } catch {}
  return Array.isArray(list)
    ? list.filter(
        (p) =>
          offered.includes(p?.name) &&
          typeof p.why === 'string' &&
          p.why.trim() &&
          p.why.length <= 500,
      )
    : [];
}

// A fix answers {"patch", "emphasis"?} against source, or {"code", "emphasis"?} as the whole-source fallback.
// A patch answer that does not parse or apply is null; anything else unusable throws.
export function auditFix(raw, brief, sentences, engine = 'remotion', source) {
  let answer;
  try {
    answer = JSON.parse(unfenced(raw));
  } catch (e) {
    if (source === undefined) throw e;
    return null;
  }
  const code =
    source === undefined
      ? answer?.code
      : typeof answer?.patch === 'string'
        ? patched(source, answer.patch)
        : null;
  if (source !== undefined && code === null) return null;
  if (typeof code !== 'string') throw new Error('Fix returned no code.');
  if (
    answer.emphasis !== undefined &&
    !(
      Array.isArray(answer.emphasis) &&
      answer.emphasis.length <= 12 &&
      answer.emphasis.every((m) => emphasisMark(m) && m.sentence < sentences)
    )
  )
    throw new Error('Fix returned unreadable emphasis.');
  return {
    code: engine === 'manim' ? code.trim() : cutSource(code, brief),
    ...(answer.emphasis && { emphasis: answer.emphasis }),
  };
}
