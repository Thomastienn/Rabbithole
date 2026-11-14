import { mergeArtifact, type Artifact, type ArtifactSummary } from '../media/artifacts.ts';

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  context?: { limit: number; provider: string; model: string | null };
};
export type MediaUsage = {
  task: 'diagram' | 'video';
  input: number | null;
  output: number | null;
  cacheRead: number | null;
};
export type Message = {
  id: string;
  role: string;
  text: string;
  status: string;
  phase?: 'compacting';
  stopped?: 'learner' | 'shutdown';
  usage?: Usage | null;
  mediaUsage?: MediaUsage[];
  artifacts?: ArtifactSummary[];
};
export const usageLine = (u: Usage) =>
  `${u.input.toLocaleString()} input · ${u.output.toLocaleString()} output · ${u.cacheRead.toLocaleString()} cache-read tokens`;
// The last completed call is a context snapshot, not the sum of repeated input across turns or background workers.
export function conversationContext(conversation: {
  provider: string;
  model: string | null;
  messages: Message[];
}) {
  const usage = conversation.messages
    .filter((m) => m.role === 'assistant' && m.status === 'completed')
    .at(-1)?.usage;
  if (!usage) return;
  const used = usage.input + usage.output + usage.cacheRead,
    context = usage.context;
  const limit =
    context?.provider === conversation.provider && context.model === conversation.model
      ? context.limit
      : undefined;
  return { used, limit };
}
export type Suggestions = {
  message: string;
  status: 'pending' | 'ready' | 'failed';
  passages: { start: number; end: number; text: string; child?: string; concept?: string }[];
  usage: Usage | null;
};
function taskUsageLine(task: string, calls: (Usage | MediaUsage | null)[]) {
  const reported = calls.filter((u): u is Usage => u?.input != null),
    missing = calls.length - reported.length;
  const counts = reported.length
    ? usageLine(
        reported.reduce(
          (sum, u) => ({
            input: sum.input + u.input,
            output: sum.output + u.output,
            cacheRead: sum.cacheRead + u.cacheRead,
          }),
          { input: 0, output: 0, cacheRead: 0 },
        ),
      )
    : 'not reported';
  return `${task}: ${counts}${reported.length && missing ? ` · ${missing} ${missing === 1 ? 'call' : 'calls'} not reported` : ''}`;
}

// Every media attempt counts under the reply that requested it, even while its job is running.
export function replyUsageLine(
  reply: Usage | null,
  suggestion?: Usage | null,
  media: MediaUsage[] = [],
) {
  return [
    taskUsageLine('Chat', [reply]),
    ...(suggestion !== undefined ? [taskUsageLine('Suggestions', [suggestion])] : []),
    ...(['diagram', 'video'] as const).flatMap((task) => {
      const calls = media.filter((u) => u.task === task);
      return calls.length ? [taskUsageLine(task === 'diagram' ? 'Visuals' : 'Videos', calls)] : [];
    }),
  ].join(' · ');
}

export function conversationUsageLine(messages: Message[], suggestions: Suggestions[] = []) {
  const replies = messages.filter((m) => m.role === 'assistant'),
    ids = new Set(replies.map((m) => m.id)),
    media = replies.flatMap((m) => m.mediaUsage ?? []),
    calls = suggestions.filter((s) => ids.has(s.message));
  return [
    taskUsageLine(
      'Chat',
      replies.map((m) => m.usage ?? null),
    ),
    ...(calls.length
      ? [
          taskUsageLine(
            'Suggestions',
            calls.map((s) => s.usage),
          ),
        ]
      : []),
    ...(['diagram', 'video'] as const).flatMap((task) => {
      const calls = media.filter((u) => u.task === task);
      return calls.length ? [taskUsageLine(task === 'diagram' ? 'Visuals' : 'Videos', calls)] : [];
    }),
  ].join(' · ');
}
// Underline ranges use the same raw UTF-16 offsets as manual selection; only exact, non-overlapping slices draw.
// Branches from a free selection also draw as explored passages, so every child's source stays marked.
export function underlineRanges(
  text: string,
  suggestions?: Suggestions,
  branched: { start: number; end: number; text: string; child: string }[] = [],
) {
  const suggested = suggestions?.status === 'ready' ? suggestions.passages : [];
  let end = 0;
  return [...suggested, ...branched.filter((b) => !suggested.some((p) => p.child === b.child))]
    .sort((a, b) => a.start - b.start)
    .filter((p) => {
      const ok =
        p.start >= end &&
        p.end > p.start &&
        p.end <= text.length &&
        text.slice(p.start, p.end) === p.text;
      if (ok) end = p.end;
      return ok;
    })
    .map(({ start, end, child }) => (child ? { start, end, child } : { start, end }));
}
// replaced: the failed reply a Retry streams over, dropped from the list.
export type Turn = { user?: Message; reply?: Message; artifacts?: Artifact[]; replaced?: string };

export function replyFeedback(
  message: Message,
  previous: Message | undefined,
  latest: boolean,
  active: boolean,
  overview: boolean,
  compactionError?: string,
) {
  return {
    label:
      message.status === 'streaming'
        ? 'Responding…'
        : message.status === 'failed' && latest && compactionError
          ? `${compactionError} The focused chat is kept; no reply was written without its context.`
          : `Reply ${message.status}.${message.stopped === 'learner' ? ' You stopped this reply.' : ''} You can send another question.`,
    retry:
      !overview &&
      !active &&
      latest &&
      (message.status === 'failed' || message.stopped === 'shutdown') &&
      previous?.role === 'user',
  };
}

// The current question is the last one whose top has reached the reading line; before any, the first.
export function currentQuestion(
  questions: { id: string }[],
  top: (id: string) => number | undefined,
  line: number,
) {
  let id = questions[0]?.id;
  for (const q of questions) {
    const at = top(q.id);
    if (at !== undefined && at <= line) id = q.id;
  }
  return id;
}

// Split complete SSE frames off the buffer; the unfinished tail waits for the next chunk.
export function sseFrames(buffer: string) {
  const events: any[] = [];
  let end;
  while ((end = buffer.indexOf('\n\n')) >= 0) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
  }
  return { events, rest: buffer };
}

// Fold one reply stream event into the live turn; true when the view must redraw.
export function applyStreamEvent(turn: Turn, event: any, conversation: string) {
  if (event.type === 'saved') {
    turn.user = event.user;
    turn.replaced = event.replaced;
    turn.reply = { id: event.id, role: 'assistant', text: '', status: 'streaming' };
  }
  // A focused chat's first reply waits for its inherited context: "compacting", then "thinking".
  if (turn.reply && event.type === 'status')
    turn.reply = { ...turn.reply, phase: event.status === 'compacting' ? 'compacting' : undefined };
  if (turn.reply && (event.type === 'text' || event.type === 'done'))
    turn.reply = {
      ...turn.reply,
      text: event.text ?? turn.reply.text,
      status: event.status ?? turn.reply.status,
    };
  if (event.type === 'artifact' && turn.reply)
    turn.artifacts = mergeArtifact(turn.artifacts ?? [], event.artifact, conversation, [
      turn.reply,
    ]);
  return ['saved', 'status', 'text', 'done', 'artifact'].includes(event.type);
}

// Reconcile saved checkpoints with the latest events for this conversation only.
export function withTurn<T extends { id?: string; messages: Message[]; artifacts?: Artifact[] }>(
  conversation: T,
  turn?: Turn,
): T {
  if (!turn) return conversation;
  const messages = conversation.messages.filter((m) => m.id !== turn.replaced);
  for (const message of [turn.user, turn.reply]) {
    if (!message) continue;
    const index = messages.findIndex((m) => m.id === message.id);
    if (index < 0) messages.push(message);
    else messages[index] = { ...messages[index], ...message };
  }
  let artifacts = conversation.artifacts ?? [];
  if (conversation.id)
    for (const artifact of turn.artifacts ?? [])
      artifacts = mergeArtifact(artifacts, artifact, conversation.id, messages);
  return { ...conversation, messages, ...(turn.artifacts && { artifacts }) };
}
