import { savedVoiceLanguage } from './shell/preferences';
import type { Message, Suggestions, ToolCall } from './chat/turn';
import type { Artifact } from './media/artifacts';

// Every request to the server goes through this module, so the CSRF token and header live here only.
let csrf = '';

type Adapter = (path: string, init?: RequestInit) => Promise<Response>;
let adapter: Adapter = (path, init) => fetch(path, init);

// Tests swap in a fake server; returns the adapter it replaced.
export function setAdapter(next: Adapter) {
    const replaced = adapter;
    adapter = next;
    return replaced;
}

// The chat state sets this from /api/state once it has loaded.
export function setCsrf(token: string) {
    csrf = token;
}

// The raw response, for reads that are not JSON and for streams; a request with init carries the CSRF header.
export function serverFetch(
    path: string,
    init?: RequestInit & { headers?: Record<string, string> },
) {
    return adapter(
        path,
        init && { ...init, headers: { ...init.headers, 'X-Rabbithole-CSRF': csrf } },
    );
}

// A board's socket; a browser cannot set headers on one, so the CSRF token rides in its address.
export function boardSocket(conversation: string, guided: boolean) {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return new WebSocket(
        `${scheme}://${window.location.host}/api/trees/${conversation}/board?csrf=${encodeURIComponent(csrf)}&lang=${savedVoiceLanguage()}${guided ? '&mode=guided' : ''}`,
    );
}

// GET without a body, otherwise a JSON POST; keepalive lets a write outlive the page that sends it.
export async function request(path: string, body?: unknown, keepalive = false) {
    const response = await serverFetch(
        path,
        body === undefined
            ? undefined
            : {
                  method: 'POST',
                  keepalive,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
              },
    );
    const data = await response.json();
    if (!response.ok)
        throw Object.assign(new Error(data.error ?? 'Request failed. Reload and try again.'), {
            data,
        });
    return data;
}

// Every event the reply and discussion streams send; keep in step with server/http/routes/send.mjs and discussions.mjs.
export type StreamEvent =
    | { type: 'saved'; id: string; title: string; user: Message; replaced?: string }
    | { type: 'status'; status: 'compacting' | 'thinking' }
    | { type: 'text'; text: string }
    | { type: 'done'; status?: string }
    | { type: 'questions'; questions: string[] }
    | { type: 'suggestions'; suggestions: Suggestions }
    | { type: 'tool'; tool: ToolCall }
    | { type: 'artifact'; artifact: Artifact }
    | { type: 'error'; error: string };

// Split complete SSE frames off the buffer; the unfinished tail waits for the next chunk and keepalive comments drop.
function sseFrames(buffer: string) {
    const events: StreamEvent[] = [];
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
    }
    return { events, rest: buffer };
}

// Opens a streamed reply, failing with the server's message, then yields its events as they arrive.
// An abort or a dropped connection rejects the iteration.
export async function replyStream(
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
) {
    const response = await serverFetch(path, { method: 'POST', ...init });
    if (!response.ok) throw new Error((await response.json()).error);
    return (async function* () {
        const reader = response.body!.getReader(),
            decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const result = await reader.read();
                buffer += decoder.decode(result.value, { stream: !result.done });
                const frames = sseFrames(buffer);
                buffer = frames.rest;
                yield* frames.events;
                if (result.done) return;
            }
        } finally {
            reader.releaseLock();
        }
    })();
}
