import { randomUUID } from 'node:crypto';
import { EndpointError } from './endpointSettings.mjs';

export const STALLED =
    'The model stopped responding for 5 minutes. Partial reply saved; try again.';

// Each model call stops after ms without a streamed event, never at a fixed time; tool runs between calls keep their own limits.
export function idleLimit(signal, ms = 300000) {
    const idle = new AbortController();
    let timer;
    const call = AbortSignal.any([signal, idle.signal]);
    call.alive = () => {
        clearTimeout(timer);
        timer = setTimeout(
            () => idle.abort(new DOMException('The model stopped responding.', 'TimeoutError')),
            ms,
        );
        // An unfinished request never holds the process open.
        timer.unref?.();
    };
    call.stop = () => clearTimeout(timer);
    call.alive();
    return call;
}

// Reads server-sent events, passing each event's joined data lines to frame until it returns true; each event keeps an idleLimit call alive.
export async function streamEvents(body, call, frame) {
    try {
        await readEvents(body, (data) => (call?.alive(), frame(data)));
    } finally {
        call?.stop();
    }
}

async function readEvents(body, frame) {
    let buffer = '';
    for await (const part of body.pipeThrough(new TextDecoderStream())) {
        buffer += part;
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const event = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const data = event
                .split(/\r?\n/)
                .filter((line) => line === 'data' || line.startsWith('data:'))
                .map((line) => line.slice(5).replace(/^ /, ''));
            if (data.length && frame(data.join('\n'))) return;
        }
        if (buffer.length > 1024 * 1024)
            throw new EndpointError(
                'Custom endpoint returned an oversized stream event. Try another model.',
            );
    }
}

// Saved completed turns; with tools offered, earlier tool calls replay with their saved outputs so the model never re-runs them.
export const history = (messages, replayTools) =>
    messages
        .filter((m) => m.status === 'completed')
        .flatMap((m) => [
            ...(replayTools && m.tools?.length
                ? [
                      {
                          role: 'assistant',
                          content: null,
                          tool_calls: m.tools.map((t) => ({
                              id: t.id,
                              type: 'function',
                              function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
                          })),
                      },
                      ...m.tools.map((t) => ({
                          role: 'tool',
                          tool_call_id: t.id,
                          content: t.output ?? '',
                      })),
                  ]
                : []),
            { role: m.role, content: m.text },
        ]);

// Reply text across tool rounds: a later round starts a new paragraph, and one that starts by
// repeating shown text or the last round's text (exactly, after leading space) has that prefix dropped.
// A round is held while it could still be a repeat; a partial repeat that ends is shown as written.
export function roundText(output) {
    let shown = '',
        previous = '',
        round;
    const show = (text) => {
        if (!text) return;
        if (round.separate) output('\n\n');
        round.separate = false;
        shown += text;
        output(text);
    };
    return {
        get shown() {
            return shown;
        },
        start() {
            const repeats = [shown, previous]
                .map((r) => r.trim())
                .filter(Boolean)
                .sort((a, b) => b.length - a.length);
            round = { separate: !!shown, content: '', held: repeats.length ? '' : null, repeats };
        },
        write(text) {
            round.content += text;
            // After a dropped repeat, the text resumes at its first non-space character.
            if (round.resume) text = text.trimStart();
            if (round.held === null) {
                if (text) round.resume = false;
                return show(text);
            }
            round.held += text;
            const start = round.held.trimStart(),
                repeat = round.repeats.find((r) => start.startsWith(r));
            if (repeat) {
                round.held = null;
                text = start.slice(repeat.length).trimStart();
                round.resume = !text;
                show(text);
            } else if (!round.repeats.some((r) => r.startsWith(start))) {
                [text, round.held] = [round.held, null];
                show(text);
            }
        },
        end() {
            if (round.held?.trim()) show(round.held);
            round.held = null;
            previous = round.content;
        },
    };
}

// One call's reported usage in Rabbithole's counts (cache reads apart from input), or null.
export function chunkUsage(u) {
    if (![u?.prompt_tokens, u?.completion_tokens].every((n) => Number.isSafeInteger(n) && n >= 0))
        return null;
    const cached = u.prompt_tokens_details?.cached_tokens;
    const cacheRead =
        Number.isSafeInteger(cached) && cached >= 0 ? Math.min(cached, u.prompt_tokens) : 0;
    const reasoning = u.completion_tokens_details?.reasoning_tokens;
    return {
        input: u.prompt_tokens - cacheRead,
        output: u.completion_tokens,
        cacheRead,
        ...(Number.isSafeInteger(reasoning) && reasoning >= 0 && { reasoning }),
    };
}

// Adds two usage counts key by key; reasoning stays absent until some round reports it.
export const addUsage = (a, b) =>
    Object.fromEntries(Object.keys({ ...a, ...b }).map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));

// Runs one model tool call through the turn's runner and emits its tool events; a failure goes back to the model as text.
export async function runTool(tree, call, emit, signal, key) {
    const id = randomUUID(),
        started = performance.now();
    const redact = (text) =>
        String(text)
            .replaceAll(key, '[redacted]')
            .replaceAll(JSON.stringify(key).slice(1, -1), '[redacted]');
    const name = redact(call.name);
    let credentials = name !== call.name;
    const clean = (value) => {
        if (typeof value === 'string') {
            const safe = redact(value);
            credentials ||= safe !== value;
            return safe;
        }
        if (Array.isArray(value)) return value.map(clean);
        return value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([k, v]) => [clean(k), clean(v)]))
            : value;
    };
    let input;
    try {
        input = clean(JSON.parse(call.arguments || '{}'));
    } catch {
        input = clean(call.arguments);
    }
    const event = (status, output) =>
        emit({
            type: 'tool',
            tool: {
                id,
                name,
                input,
                status,
                output,
                elapsed: Math.round(performance.now() - started),
            },
        });
    event('running', null);
    const timer = setInterval(() => event('running', null), 1000);
    try {
        signal.throwIfAborted();
        if (credentials)
            throw new Error('Tool call contained endpoint credentials; it was refused.');
        if (!tree.tools.some((tool) => tool.name === name))
            throw new Error(`Tool ${name} is not available for this turn.`);
        const output = redact(await tree.runTool(name, input, signal));
        event('done', output);
        return output;
    } catch (error) {
        if (signal.aborted) throw error;
        const output = `Error: ${redact(error.message)}`;
        event('failed', output);
        return output;
    } finally {
        clearInterval(timer);
    }
}

// Only exact key echoes are filtered; hold a matching suffix across stream chunks.
export function redactStream(key, emit) {
    let pending = '';
    return (text, final = false) => {
        pending = (pending + text).split(key).join('[redacted]');
        let hold = final ? 0 : Math.min(key.length - 1, pending.length);
        while (hold && !key.startsWith(pending.slice(-hold))) hold--;
        const safe = pending.slice(0, pending.length - hold);
        pending = pending.slice(pending.length - hold);
        if (safe) emit({ type: 'delta', item: 'reply', text: safe });
    };
}
