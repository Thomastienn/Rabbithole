import { collectText } from './providers/chatStream.mjs';
import { withoutPaths } from './media/video-sandbox.mjs';

const FIELDS = new Set([
    'id',
    'conversation',
    'task',
    'tool',
    'provider',
    'model',
    'input',
    'output',
    'cacheRead',
    'ms',
    'status',
    'method',
    'path',
    'cause',
    'next',
    'stage',
    'progress',
    'cut',
    'cuts',
    'engine',
    'requestId',
    'request',
    'piece',
    'choice',
    'reason',
    // Automatic merges log both names and the kept one (ADR 0022).
    'names',
    'kept',
]);

// Only diagnostic metadata reaches the terminal; unknown fields are dropped.
export function formatLog(level, area, message, fields = {}, at = new Date()) {
    const line = (value) =>
        String(value)
            .replace(/[\s\p{Cc}\p{Cf}]+/gu, ' ')
            .trim();
    return [
        at.toISOString(),
        line(level).toUpperCase(),
        line(area),
        line(message),
        ...Object.entries(fields)
            .filter(([key]) => FIELDS.has(key))
            .map(
                ([key, value]) =>
                    `${key}=${JSON.stringify(value == null ? 'unreported' : typeof value === 'number' ? value : line(errorCause(value)))}`,
            ),
    ].join(' ');
}

// A provider failure's first line for a failed card: secrets, endpoints and paths redacted, shortened.
export function providerError(error, privateText = []) {
    const line = errorCause(error, privateText)
        .split('\n')
        .map((l) => l.trim())
        .find(Boolean);
    return withoutPaths(line ?? 'Unknown failure').slice(0, 300);
}

export function stdoutLog(line) {
    (/^\S+ (?:ERROR|WARN) /.test(line) ? process.stderr : process.stdout).write(line + '\n');
}

export const privateValues = (value) => {
    if (typeof value === 'string') {
        try {
            return [value, ...privateValues(JSON.parse(value))];
        } catch {
            return [value];
        }
    }
    return value && typeof value === 'object' ? Object.values(value).flatMap(privateValues) : [];
};

export function errorCause(error, privateText = []) {
    let cause = String(error?.message ?? error ?? 'Unknown failure');
    for (const text of [...new Set(privateText)]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length))
        cause = cause
            .replaceAll(text, '[redacted]')
            .replaceAll(JSON.stringify(text).slice(1, -1), '[redacted]');
    return cause
        .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
        .replace(/(?:sk-[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g, '[redacted]')
        .replace(
            /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)["']?\s*[:=]\s*)["']?[^\s,;"'}]+/gi,
            '$1[redacted]',
        )
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[endpoint]');
}

// Shared by the existing chat, suggestion and background usage boundaries.
export function loggedProvider(log, provider, task, id, selection, detail = {}) {
    const wrapped = { models: (...args) => provider.models(...args) };
    wrapped.generate = async (tree, text, emit, saveThread, signal) => {
        const started = performance.now(),
            fields = {
                id,
                task,
                provider: selection.provider,
                model: tree.model ?? selection.model,
                ...detail,
            };
        // Tool definitions and the role are app text; their short words would redact ordinary causes.
        const { tools, textTools, role, ...data } = tree;
        const privateText = [...privateValues(data), ...privateValues(text)];
        const streamed = collectText();
        let usage = null,
            failure;
        log(formatLog('info', 'model', 'started', fields));
        try {
            return await provider.generate(
                tree,
                text,
                (event) => {
                    if (event.type === 'usage') usage = event.usage;
                    streamed.onEvent(event);
                    emit(event);
                },
                (thread, model) => {
                    fields.model = model ?? fields.model;
                    saveThread(thread, model);
                },
                signal,
            );
        } catch (error) {
            failure = error;
            throw error;
        } finally {
            const timedOut =
                signal?.reason?.name === 'TimeoutError' ||
                /timed out|ran over/i.test(signal?.reason?.message ?? '');
            // A run the server ended at the reply's end section reports completed, not stopped.
            const stopped =
                (signal?.aborted && !timedOut && streamed.status !== 'completed') ||
                streamed.status === 'interrupted';
            const failed = failure || timedOut || streamed.status === 'failed';
            const valid =
                usage &&
                ['input', 'output', 'cacheRead'].every(
                    (k) => Number.isSafeInteger(usage[k]) && usage[k] >= 0,
                );
            log(
                formatLog(
                    failed && !stopped ? 'error' : 'info',
                    'model',
                    stopped ? 'stopped' : failed ? 'failed' : 'finished',
                    {
                        ...fields,
                        input: valid ? usage.input : null,
                        output: valid ? usage.output : null,
                        cacheRead: valid ? usage.cacheRead : null,
                        ms: Math.round(performance.now() - started),
                        ...(failed &&
                            !stopped && {
                                cause: errorCause(
                                    failure ?? signal?.reason ?? 'Provider reported a failed call.',
                                    [...privateText, ...streamed.items.values()],
                                ),
                                next: 'Check provider sign-in or endpoint settings, then retry.',
                                // A custom endpoint's HTTP status, request id and request shape, to match its own logs.
                                ...(Number.isInteger(failure?.status) && {
                                    status: failure.status,
                                }),
                                ...(failure?.requestId && { requestId: failure.requestId }),
                                ...(failure?.request && { request: failure.request }),
                            }),
                    },
                ),
            );
        }
    };
    return wrapped;
}

const SEGMENTS = new Set(
    'api state usage search previews models trees messages retry stop branches prepare unprepare position layout model rename delete artifacts media videos reveal trash export generate suggestions knowledge settings auth codex claude openai endpoints profiles test connect disconnect login logout status smart chat interface graph concepts roles duplicate active default remove edit cancel regenerate'.split(
        ' ',
    ),
);
export const requestPath = (path) =>
    path
        .split('/')
        .map((part) => (!part || SEGMENTS.has(part) || /^[0-9a-f-]{36}$/.test(part) ? part : ':id'))
        .join('/');

export const logRequest = (method, path) =>
    path.startsWith('/api/') &&
    !path.endsWith('/media') &&
    !(
        method === 'GET' &&
        (['/api/state', '/api/previews'].includes(path) ||
            /^\/api\/trees\/[^/]+(?:\/artifacts\/[^/]+(?:\/cuts(?:\/\d+\/\w+)?)?)?$/.test(path) ||
            /^\/api\/videos\/[^/]+\/export$/.test(path))
    );
