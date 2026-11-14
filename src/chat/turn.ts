import { mergeArtifact, type Artifact, type ArtifactSummary } from '../media/artifacts.ts';

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  context?: { limit: number; provider: string; model: string | null };
};
export type Message = {
  id: string;
  role: string;
  text: string;
  status: string;
  phase?: 'compacting';
  stopped?: 'learner' | 'shutdown';
  usage?: Usage | null;
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
// A reply's token line includes its suggestion call, so background cost is never hidden.
export function replyUsageLine(reply: Usage | null, suggestion?: Usage | null) {
  if (!suggestion)
    return reply
      ? `${usageLine(reply)}${suggestion === null ? ' · suggestion usage unavailable' : ''}`
      : 'Token usage unavailable';
  if (!reply) return `Reply usage unavailable · suggestions: ${usageLine(suggestion)}`;
  return `${usageLine({ input: reply.input + suggestion.input, output: reply.output + suggestion.output, cacheRead: reply.cacheRead + suggestion.cacheRead })}, including suggestions`;
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
    else messages[index] = message;
  }
  let artifacts = conversation.artifacts ?? [];
  if (conversation.id)
    for (const artifact of turn.artifacts ?? [])
      artifacts = mergeArtifact(artifacts, artifact, conversation.id, messages);
  return { ...conversation, messages, ...(turn.artifacts && { artifacts }) };
}
