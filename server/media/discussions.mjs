export const DISCUSSION_RULE = `\n\nDiscussion: create one only when the learner asks for a discussion; never start one unasked or treat an ordinary question as a request. Write it yourself in a fenced rabbithole-discussion JSON block, placed where the discussion belongs in your reply, like a visual. Shape: {"classmates":[{"name":"Maya","level":"below"},{"name":"Theo","level":"near"},{"name":"Jun","level":"above"}],"lines":[{"speaker":"Maya","text":"..."}]}. Choose 3 or 4 classmates with distinct short names, never Tutor or Learner. Each hidden level is relative to the learner's familiarity with the discussion's concepts: below, near or above, with at least one below and one above. Use the available familiarity context and what the learner has shown about these concepts; when unknown, assume an ordinary starting explanation and spread the classmates around it. Keep these levels private, never mention or label them in the lines or surrounding text. Classmates have honest misunderstandings, ask each other questions and draw the learner in; only relevant classmates speak. The Tutor steps in only to untangle or confirm. Write 4 to 8 short lines, each with a speaker (an exact classmate name or Tutor) and plain text (at most 2000 characters), and end with a question to the learner. Do not write learner lines or invent the learner's answer. No tools or extra model call are needed. Classmates belong only to this discussion and keep their levels.`;

// Validate the model's output at the reply boundary; reject the whole opening instead of silently changing voices.
export function readDiscussion(task) {
  const bounded = (value, max) =>
    typeof value === 'string' &&
    !!value.trim() &&
    value.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
  if (!Array.isArray(task?.classmates) || ![3, 4].includes(task.classmates.length))
    return { error: 'choose 3 or 4 classmates' };
  const classmates = [];
  for (const c of task.classmates) {
    if (
      !bounded(c?.name, 60) ||
      /[\r\n]/.test(c.name) ||
      !['below', 'near', 'above'].includes(c.level)
    )
      return { error: 'each classmate needs a name and a relative level' };
    const name = c.name.trim();
    if (
      ['tutor', 'learner', ...classmates.map((p) => p.name.toLowerCase())].includes(
        name.toLowerCase(),
      )
    )
      return { error: 'classmate names must be distinct and cannot be Tutor or Learner' };
    classmates.push({ name, level: c.level });
  }
  if (!['below', 'above'].every((level) => classmates.some((c) => c.level === level)))
    return { error: 'include classmates below and above the learner’s familiarity' };
  if (!Array.isArray(task.lines) || task.lines.length < 4 || task.lines.length > 8)
    return { error: 'the opening needs 4 to 8 lines' };
  const speakers = ['Tutor', ...classmates.map((c) => c.name)];
  const lines = [];
  for (const line of task.lines) {
    if (!speakers.includes(line?.speaker) || !bounded(line.text, 2000))
      return { error: 'each line needs a classmate or Tutor speaker and short text' };
    lines.push({ speaker: line.speaker, text: line.text.trim() });
  }
  if (!/[?？][\s”’"')]*$/.test(lines.at(-1).text))
    return { error: 'end the opening with a question to the learner' };
  return { task: { classmates, lines } };
}

// Levels stay in the saved source for the model; the browser sees names and lines only.
export function discussionArtifact({ source, ...artifact }) {
  const discussion = source ? JSON.parse(source) : null;
  return {
    ...artifact,
    classmates: discussion?.classmates.length ?? artifact.classmates ?? 0,
    ...(discussion && {
      discussion: {
        classmates: discussion.classmates.map((c) => c.name),
        lines: discussion.lines,
      },
    }),
  };
}
