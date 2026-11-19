// make_video: an app tool the server runs itself; the video planner gets the conversation as context.
const TOPIC = 200;
// The planner reads the conversation so far; a resource bound, not a rule the tutor sees.
const CONTEXT = 6000;

export const MAKE_VIDEO = {
  name: 'make_video',
  description:
    'Start a narrated video, only when the learner explicitly asks for a video or animation; never for an ordinary explanation, and if it is unclear whether the learner wants a video, ask first. ' +
    'A video stands alone: in a reply with make_video, call no show_visual or start_discussion and make no other video. ' +
    'Another model plans and makes the video from the topic and this conversation; never write video code yourself. The result is "queued": tell the learner in a sentence or two that the video is on its way.',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: `What the video explains, at most ${TOPIC} characters, such as "How a binary search narrows a sorted list".`,
      },
    },
    required: ['topic'],
  },
};

export function readMakeVideo(input) {
  const topic = input?.topic;
  if (typeof topic !== 'string' || !topic.trim())
    throw new Error('make_video needs topic as non-empty text.');
  const text = topic.trim();
  if (text.length > TOPIC)
    throw new Error(
      `make_video topic is ${text.length} characters; shorten it to at most ${TOPIC}.`,
    );
  if (/[\u0000-\u001f]/.test(text))
    throw new Error('make_video topic contains control characters; use plain text.');
  return text;
}

// The conversation so far as plain turns, newest last, bounded from the end.
export const videoContext = (messages, question, replySoFar = '') =>
  [
    ...messages.map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.text}`),
    `Learner: ${question}`,
    replySoFar.trim() && `Tutor: ${replySoFar.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(-CONTEXT);
