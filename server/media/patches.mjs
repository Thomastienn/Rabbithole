import { parsePatch, applyPatch } from 'diff';

// A fixer's task: JSON, then the source to diff against as raw lines after a line naming its field.
export const withSource = (task, field, source) =>
  `${JSON.stringify(task)}\n\n${field}:\n${source}`;

// One unified diff applied to source; null when it does not parse or apply.
export function patched(source, raw) {
  try {
    const [patch, ...more] = parsePatch(
      raw.replace(/^\s*```[\w-]*\n/, '').replace(/\n```\s*$/, ''),
    );
    if (!patch?.hunks.length || more.length) return null;
    const result = applyPatch(source, patch);
    return result === false ? null : result;
  } catch {
    return null;
  }
}
