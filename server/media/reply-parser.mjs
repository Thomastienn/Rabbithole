// The reply parser: media requests, tool calls and verdicts the tutor writes into a reply.
import { readDiscussion } from './discussions.mjs';
import { stripMarkers } from './markers.mjs';

// Resource bound on worker calls per reply, not a node limit inside a diagram.
const MAX_DIAGRAMS = 6;
export const LIMITS = { title: 120, description: 280, intent: 600, excerpt: 1200 };
// What the visual shows; required by the tutor rules but optional on read so older stored requests still parse.
const SHOWS_LIMIT = 280;

// Hide whole requests and incomplete opening fences before any reply text is persisted or streamed.
// Also tolerated: <tool_call> text, :::rabbithole-<kind> {json}, and bare request JSON inside :::figure or :::wide.
export function diagramReply(raw, final = false) {
    // Fenced form, or tag form <rabbithole-visual>{json}</rabbithole-visual> whose opening tag may carry stray quotes or spaces.
    const open =
        /(^|\r?\n)[ \t]*(`{3,}|~{3,})[ \t]*rabbithole-(diagram|video|visual|verdict|notes|discussion)\b([^\r\n]*)(?:\r?\n|$)|<[\s"']*(?:rabbithole-(diagram|video|visual|verdict|notes|discussion)|(tool_call))[\s"']*>|(?:^|\r?\n)[ \t]*:{3,}[ \t]*rabbithole-(diagram|video|visual|verdict|notes|discussion)\b|(?:^|\r?\n)[ \t]*(?=\{)/g;
    let text = '',
        cursor = 0,
        match;
    let requests = [];
    while ((match = open.exec(raw))) {
        const before = text + raw.slice(cursor, match.index);
        let kind = match[3] ?? match[5] ?? match[7] ?? (match[6] ? 'call' : 'visual'),
            start = open.lastIndex,
            end,
            next;
        if (match[2] || match[5] || match[6]) {
            const close = match[2]
                ? new RegExp(
                      '^[ \\t]*' + match[2][0] + '{' + match[2].length + ',}[ \\t]*\\r?$',
                      'gm',
                  )
                : new RegExp(`<\\/[\\s"']*${match[6] ?? 'rabbithole-' + kind}[\\s"']*>`, 'g');
            close.lastIndex = start;
            const found = close.exec(raw);
            end = found?.index;
            next = found && close.lastIndex;
        } else {
            // Colon or bare form: the request is the JSON object itself.
            start += /^\s*/.exec(raw.slice(start))[0].length;
            if (!match[7] && !inMediaLayout(before)) {
                open.lastIndex = match.index + match[0].length + 1;
                continue;
            }
            if (raw[start] === '{') {
                const after = jsonEnd(raw, start);
                if (after >= 0) end = next = after;
            } else if (start < raw.length) {
                const line = raw.indexOf('\n', start);
                end = next = line < 0 ? raw.length : line;
            }
            // Bare JSON without a title is ordinary text.
            if (!match[7] && next !== undefined) {
                let task;
                try {
                    task = JSON.parse(raw.slice(start, end));
                } catch {}
                if (typeof task?.title !== 'string') {
                    open.lastIndex = match.index + match[0].length + 1;
                    continue;
                }
            }
            // A colon block outside a layout may close with its own ::: line.
            if (match[7] && next !== undefined && !inMediaLayout(before)) {
                const closing = /[ \t]*\r?\n[ \t]*:{3,}[ \t]*(?=\r?\n|$)/y;
                closing.lastIndex = next;
                if (closing.exec(raw)) next = closing.lastIndex;
            }
        }
        text = before;
        const json = raw.slice(start, end ?? raw.length);
        // position: where the block was removed in the stored text; earlier text before it is already final.
        requests.push({
            kind: kind === 'diagram' ? 'mermaid' : kind,
            json,
            closed: end !== undefined,
            extra: match[4]?.trim() ?? '',
            position: text.length,
        });
        cursor = next ?? raw.length;
        open.lastIndex = cursor;
    }
    text += raw.slice(cursor);
    const lineStart = text.lastIndexOf('\n') + 1,
        line = text.slice(lineStart).trim();
    const fence = /^(?:`{3,}|~{3,}|:{3,})[ \t]*(.*)$/.exec(line);
    const names = [
        'rabbithole-diagram',
        'rabbithole-video',
        'rabbithole-visual',
        'rabbithole-verdict',
        'rabbithole-notes',
        'rabbithole-discussion',
    ];
    const tag = /<[\s"']*([\w-]*)[\s"']*$/.exec(text); // a streamed tag-form opening may still be arriving
    const fenceHidden =
        (!final && /^(?:`{1,2}|~{1,2}|:{1,2})$/.test(line)) ||
        !!(
            fence &&
            names.some((name) => name.startsWith(fence[1])) &&
            (!final || fence[1].startsWith('rabbithole-'))
        );
    const tagHidden = !!(
        tag &&
        [...names, 'tool_call'].some((name) => name.startsWith(tag[1])) &&
        (!final || tag[1].startsWith('rabbithole-') || tag[1] === 'tool_call')
    );
    const hidden = fenceHidden || tagHidden;
    if (hidden) text = text.slice(0, fenceHidden ? lineStart : tag.index);
    // Markers leave the text after the blocks, so every position counts in the text the learner sees.
    const marked = stripMarkers(text, final),
        markers = marked.markers;
    text = marked.text;
    for (const request of requests) request.position = marked.at(request.position);
    // Verdicts are not media: read them apart; null means no readable block.
    const verdicts = readVerdicts(requests.filter((r) => r.kind === 'verdict'));
    // Tool calls run once each in order; one still arriving is left out until it closes or the reply ends.
    const calls = requests.filter((r) => r.kind === 'call' && (r.closed || final)).map(readCall);
    requests = requests.filter((r) => !['verdict', 'notes', 'call'].includes(r.kind));
    if (!requests.length)
        return { text, requested: calls.length > 0, hidden, verdicts, calls, markers };
    // Tolerant: unknown keys are ignored and long fields trimmed; incomplete or unreadable blocks still reject with a learner-facing reason.
    // A rejected request keeps whatever fields were readable (partial) so an explicit Retry can rerun from it.
    const parse = (request) => {
        const label =
            request.kind === 'discussion'
                ? 'Discussion'
                : request.kind === 'video'
                  ? 'Video'
                  : request.kind === 'visual'
                    ? 'Visual'
                    : 'Diagram';
        const reject = (reason, partial = {}) => ({
            kind: request.kind,
            error: `${label} request could not be read: ${reason}.`,
            partial,
            position: request.position,
        });
        if (!request.closed)
            return reject('the tutor’s request block was cut off before it closed');
        if (request.extra) return reject('the request block header had unexpected text');
        let task;
        try {
            task = JSON.parse(request.json);
        } catch {
            return reject('the request was not valid JSON');
        }
        if (!task || typeof task !== 'object' || Array.isArray(task))
            return reject('the request was not a JSON object');
        if (request.kind === 'discussion') {
            const parsed = readDiscussion(task);
            return parsed.error
                ? reject(parsed.error)
                : { kind: 'discussion', task: parsed.task, position: request.position };
        }
        const partial = Object.fromEntries(
            Object.entries({ ...LIMITS, shows: SHOWS_LIMIT }).flatMap(([key, limit]) =>
                typeof task[key] === 'string' &&
                task[key].trim() &&
                !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(task[key])
                    ? [[key, task[key].trim().slice(0, limit).trim()]]
                    : [],
            ),
        );
        const missing = Object.keys(LIMITS).filter((key) => !partial[key]);
        if (missing.length) return reject(`the request is missing ${missing.join(', ')}`, partial);
        return { kind: request.kind, task: Object.freeze(partial), position: request.position };
    };
    // A video stands alone; diagrams may arrive as several ordered steps, each validated on its own.
    const groupError =
        requests.filter((r) => r.kind === 'mermaid').length > MAX_DIAGRAMS
            ? `the tutor sent more than ${MAX_DIAGRAMS} requests`
            : requests.length > 1 && requests.some((r) => r.kind === 'video')
              ? 'the tutor sent a video with other requests'
              : null;
    return {
        text,
        requested: true,
        verdicts,
        calls,
        markers,
        requests: requests.map((request) => {
            const parsed = parse(request);
            return groupError && request.kind !== 'visual'
                ? {
                      ...parsed,
                      closed: request.closed,
                      error:
                          parsed.error ??
                          `${request.kind === 'discussion' ? 'Discussion' : request.kind === 'video' ? 'Video' : request.kind === 'visual' ? 'Visual' : 'Diagram'} request could not be read: ${groupError}.`,
                  }
                : { ...parsed, closed: request.closed };
        }),
    };
}

// Index just past the JSON value opening at raw[start], or -1 while it is still arriving.
function jsonEnd(raw, start) {
    let depth = 0,
        string = false;
    for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (string) {
            if (c === '\\') i++;
            else if (c === '"') string = false;
        } else if (c === '"') string = true;
        else if (c === '{' || c === '[') depth++;
        else if ((c === '}' || c === ']') && --depth === 0) return i + 1;
    }
    return -1;
}
// Text inside an open :::figure or :::wide layout, where bare request JSON stands for a visual.
const inMediaLayout = (text) =>
    ['figure', 'wide'].includes([...text.matchAll(/^[ \t]*:{3,}[ \t]*([\w-]*)/gm)].at(-1)?.[1]);
// A Hermes-style <tool_call>{"name", "arguments"}</tool_call>; arguments may arrive as a JSON string.
export function readCall(request) {
    let call;
    try {
        call = JSON.parse(request.json);
        if (typeof call?.arguments === 'string')
            call = { ...call, arguments: JSON.parse(call.arguments) };
    } catch {
        call = null;
    }
    return typeof call?.name === 'string' && call.arguments && typeof call.arguments === 'object'
        ? { name: call.name, input: call.arguments, position: request.position }
        : {
              error: 'the tool call was not valid JSON with name and arguments',
              position: request.position,
          };
}

// Tolerant: unreadable entries are skipped; the last entry for a concept wins. Null when no closed block parses.
export function readVerdicts(blocks) {
    let verdicts = null;
    for (const block of blocks) {
        if (!block.closed || block.extra) continue;
        let entries;
        try {
            entries = JSON.parse(block.json);
        } catch {
            continue;
        }
        if (!Array.isArray(entries)) entries = entries?.verdicts;
        if (!Array.isArray(entries)) continue;
        if (!entries.length) verdicts ??= new Map();
        for (const e of entries) {
            const concept = typeof e?.concept === 'string' ? e.concept.trim() : '';
            if (
                concept &&
                concept.length <= 200 &&
                !/[\u0000-\u001f]/.test(concept) &&
                Number.isInteger(e.level) &&
                e.level >= 0 &&
                e.level <= 5 &&
                ['low', 'high'].includes(e.confidence)
            ) {
                verdicts ??= new Map();
                verdicts.set(concept.toLowerCase(), {
                    concept,
                    level: e.level,
                    confidence: e.confidence,
                });
            }
        }
    }
    return verdicts && [...verdicts.values()];
}
