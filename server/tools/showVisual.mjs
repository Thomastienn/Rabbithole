// show_visual: an app tool the server runs itself; never a learner-toggled tutor tool or a tool activity entry.
const LIMITS = { title: 120, shows: 280, alt: 280, check_answer: 600 };
// The writer reads the reply so far as context; a resource bound, not a rule the tutor sees.
const CONTEXT = 6000;
const AFTER = 120;

export const SHOW_VISUAL = {
  name: 'show_visual',
  description:
    'Show a visual at this point of your reply. Use it for structures, processes, quantities, comparisons and spatial ideas that land better seen than read; keep short factual answers and casual turns text-only; always show one when the learner asks for a visual. ' +
    'Call it where the visual belongs in the explanation, as early as that is; never collect visuals at the end. Use one visual per idea; for a complex idea, call it several times for small visuals in order. ' +
    'A visual is a section of your reply that the learner reads in place, so let your text carry what the visual cannot, and keep technical detail and precise terms in your text. ' +
    'Another model draws it from these arguments and your reply so far; never write visual code yourself. The result is "queued": continue your reply right after the visual without repeating any text. ' +
    'Give after: the last few words of your reply text the visual follows, quoted exactly, so it lands there even when you call it after writing more. Give side, left or right, to set the visual beside the section that follows it; leave it out to keep the visual in the flow. Never put a visual inside :::figure, which is for images only. Ready visuals appear in later history only as artifact id, title and description. ' +
    'Check yourself: at most once per reply, give check_answer to make a predict-then-reveal check when predicting the next step or an outcome would help the learner test an idea, after enough context to reason about it. Honor requests for a check and requests to skip quizzes; never quiz on short factual answers, casual turns or when the learner wants a direct explanation; never require an answer, grade the learner or hold back the explanation. Keep title, alt and your text free of the hidden answer.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: `Short title of the finished visual, at most ${LIMITS.title} characters.`,
      },
      shows: {
        type: 'string',
        description: `Exactly what the visual shows, at most ${LIMITS.shows} characters, such as "Artemis I to IV with year and status, then longer-term goals".`,
      },
      alt: {
        type: 'string',
        description: `Text alternative, at most ${LIMITS.alt} characters: say in words what the visual shows; for a check, only the starting state and the prediction question.`,
      },
      after: {
        type: 'string',
        description: `The last few words of your reply text the visual follows, quoted exactly, at most ${AFTER} characters.`,
      },
      side: {
        type: 'string',
        enum: ['left', 'right'],
        description: 'Optional: set the visual on this side of the section that follows it.',
      },
      check_answer: {
        type: 'string',
        description: `Only for a predict-then-reveal check, at most ${LIMITS.check_answer} characters: the prediction question, the correct outcome and a short reason. The answer stays hidden until the learner reveals it.`,
      },
    },
    required: ['title', 'shows', 'alt', 'after'],
  },
};

// Plain errors name the argument so the model can fix this call; unknown arguments are ignored.
export function readShowVisual(input, replySoFar = '') {
  const request = {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    const value = input?.[key];
    if (value === undefined && key === 'check_answer') continue;
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`show_visual needs ${key} as non-empty text.`);
    const text = value.trim();
    if (text.length > limit)
      throw new Error(
        `show_visual ${key} is ${text.length} characters; shorten it to at most ${limit}.`,
      );
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
      throw new Error(`show_visual ${key} contains control characters; use plain text.`);
    request[key] = text;
  }
  const context = replySoFar.trim().slice(-CONTEXT);
  return Object.freeze({ ...request, ...(context && { context }) });
}

// Which side of the following section a visual sits on; null keeps it in the flow.
export function visualSide(input) {
  const side = input?.side;
  if (side === undefined || side === null) return null;
  if (side !== 'left' && side !== 'right')
    throw new Error('show_visual side must be left or right, or left out.');
  return side;
}

// Where a visual lands: its call's position, or the end of the first match of after in this response's text (from start).
// Plain errors name after so the model can fix the call; the <tool_call> text path may omit it (required false).
export function visualPosition(input, text, start, position, required = true) {
  const after = input?.after;
  if (after === undefined && !required) return position;
  if (typeof after !== 'string' || !after.trim())
    throw new Error('show_visual needs after as non-empty text.');
  const anchor = after.trim();
  if (anchor.length > AFTER)
    throw new Error(
      `show_visual after is ${anchor.length} characters; shorten it to at most ${AFTER}.`,
    );
  const response = text.slice(start, position);
  const loose = anchor
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  // A tutor that stopped at the call quotes the text just before it: keep the call's position.
  if (new RegExp(`${loose}\\s*$`, 'i').test(response)) return position;
  const exact = response.indexOf(anchor);
  if (exact >= 0) return start + exact + anchor.length;
  const match = new RegExp(loose, 'i').exec(response);
  return match ? start + match.index + match[0].length : position;
}
