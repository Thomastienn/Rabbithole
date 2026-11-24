import { mergeArtifact, type Artifact, type ArtifactSummary } from '../media/artifacts.ts';
import type { Attachment } from './Attachments';
import type { StreamEvent } from '../serverAccess';

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
export type ToolCall = {
    id: string;
    name: string;
    input: unknown;
    status: 'running' | 'done' | 'failed';
    output: string | null;
    elapsed: number | null;
};
// Collapsed tool activity line: the running tool while streaming, else what was used.
export function toolLine(tools: ToolCall[]) {
    const running = [...tools].reverse().find((t) => t.status === 'running');
    if (running) return `Running ${running.name}…`;
    // Successful memory note edits get their own words so no update is hidden.
    const memo = (t: ToolCall) => t.name === 'update_memory_note' && t.status === 'done',
        used = tools.filter((t) => !memo(t)),
        names = [...new Set(used.map((t) => t.name))].join(', '),
        failed = used.filter((t) => t.status === 'failed').length;
    return [
        used.length &&
            `Used ${used.length} ${used.length === 1 ? 'tool' : 'tools'}: ${names}${failed ? ` · ${failed} failed` : ''}`,
        used.length < tools.length && 'Updated memory note',
    ]
        .filter(Boolean)
        .join(' · ');
}
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
    attachments?: Attachment[];
    tools?: ToolCall[];
    questions?: string[];
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
    passages: {
        start: number;
        end: number;
        text: string;
        child?: string;
        concept?: string;
    }[];
    // Background concepts the reply relies on without naming, at most three.
    groundwork?: string[];
    // Absent when the tutor's notes block supplied the suggestions and no call ran.
    usage?: Usage | null;
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
            return calls.length
                ? [taskUsageLine(task === 'diagram' ? 'Visuals' : 'Videos', calls)]
                : [];
        }),
    ].join(' · ');
}

export function conversationUsageLine(messages: Message[], suggestions: Suggestions[] = []) {
    const replies = messages.filter((m) => m.role === 'assistant'),
        ids = new Set(replies.map((m) => m.id)),
        media = replies.flatMap((m) => m.mediaUsage ?? []),
        calls = suggestions.filter((s) => ids.has(s.message) && s.usage !== undefined);
    return [
        taskUsageLine(
            'Chat',
            replies.map((m) => m.usage ?? null),
        ),
        ...(calls.length
            ? [
                  taskUsageLine(
                      'Suggestions',
                      calls.map((s) => s.usage ?? null),
                  ),
              ]
            : []),
        ...(['diagram', 'video'] as const).flatMap((task) => {
            const calls = media.filter((u) => u.task === task);
            return calls.length
                ? [taskUsageLine(task === 'diagram' ? 'Visuals' : 'Videos', calls)]
                : [];
        }),
    ].join(' · ');
}
// Underline ranges use the same raw UTF-16 offsets as manual selection; only exact slices draw.
// Explored passages may overlap each other (a branch inside a branched phrase); an unexplored suggestion
// draws only where it overlaps nothing else.
// Branches from a free selection also draw as explored passages, so every child's source stays marked.
export function underlineRanges(
    text: string,
    suggestions?: Suggestions,
    branched: { start: number; end: number; text: string; child: string }[] = [],
) {
    // The tutor's marks underline as they stream and once saved; a pending quick thinking row has none yet.
    const suggested = (suggestions?.status !== 'failed' && suggestions?.passages) || [];
    const exact = [
        ...suggested,
        ...branched.filter((b) => !suggested.some((p) => p.child === b.child)),
    ]
        .filter(
            (p) => p.end > p.start && p.end <= text.length && text.slice(p.start, p.end) === p.text,
        )
        .sort((a, b) => a.start - b.start || b.end - a.end);
    const explored = exact.filter((p) => p.child);
    let end = 0;
    return exact
        .filter((p) => {
            if (p.child) return true;
            const ok = p.start >= end && !explored.some((x) => x.start < p.end && x.end > p.start);
            if (ok) end = p.end;
            return ok;
        })
        .map(({ start, end, child }) => (child ? { start, end, child } : { start, end }));
}
// replaced: the failed reply a Retry streams over, dropped from the list.
// suggestions: the reply's notes as their markers close while it streams.
export type Turn = {
    user?: Message;
    reply?: Message;
    artifacts?: Artifact[];
    replaced?: string;
    suggestions?: Suggestions;
};

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

// Fold one reply stream event into the live turn; true when the view must redraw.
export function applyStreamEvent(turn: Turn, event: StreamEvent, conversation: string) {
    if (event.type === 'saved') {
        turn.user = event.user;
        turn.replaced = event.replaced;
        turn.reply = { id: event.id, role: 'assistant', text: '', status: 'streaming' };
    }
    // A focused chat's first reply waits for its inherited context: "compacting", then "thinking".
    if (turn.reply && event.type === 'status')
        turn.reply = {
            ...turn.reply,
            phase: event.status === 'compacting' ? 'compacting' : undefined,
        };
    if (turn.reply && event.type === 'text') turn.reply = { ...turn.reply, text: event.text };
    if (turn.reply && event.type === 'done')
        turn.reply = { ...turn.reply, status: event.status ?? turn.reply.status };
    if (event.type === 'questions' && turn.reply)
        turn.reply = { ...turn.reply, questions: event.questions };
    if (event.type === 'suggestions' && turn.reply) turn.suggestions = event.suggestions;
    if (event.type === 'tool' && turn.reply) {
        const tools = turn.reply.tools ?? [];
        const index = tools.findIndex((t) => t.id === event.tool.id);
        turn.reply = {
            ...turn.reply,
            tools:
                index < 0
                    ? [...tools, event.tool]
                    : tools.map((t, i) => (i === index ? event.tool : t)),
        };
    }
    if (event.type === 'artifact' && turn.reply)
        turn.artifacts = mergeArtifact(turn.artifacts ?? [], event.artifact, conversation, [
            turn.reply,
            // Main-thread sends also close discussion cards attached to earlier replies.
            ...(event.artifact.kind === 'discussion'
                ? [{ id: event.artifact.message, role: 'assistant' }]
                : []),
        ]);
    return event.type !== 'error';
}

// Reconcile saved checkpoints with the latest events for this conversation only.
export function withTurn<
    T extends {
        id?: string;
        messages: Message[];
        artifacts?: Artifact[];
        suggestions?: Suggestions[];
    },
>(conversation: T, turn?: Turn): T {
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
    const marked = turn.suggestions;
    return {
        ...conversation,
        messages,
        ...(turn.artifacts && { artifacts }),
        ...(marked && {
            suggestions: [
                ...(conversation.suggestions ?? []).filter((s) => s.message !== marked.message),
                marked,
            ],
        }),
    };
}
