// Readers for the reply parser's request blocks: tool calls, broken media forms and verdicts.
// Index just past the JSON value opening at raw[start], or -1 while it is still arriving.
export function jsonEnd(raw, start) {
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
export const inMediaLayout = (text) =>
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

export const VERDICT_SHAPE =
    'It holds a JSON array of objects {"concept": name, "level": 0-5, "confidence": "low" or "high"}. Levels: 0 misconception (states it wrongly), 1 heard of it (names it, no grasp), 2 partial (right idea, gaps or fuzzy), 3 explains it correctly in own words, 4 applies it to a new case, 5 teaches it (corrects someone, spots edge cases). Judge only what the message shows, never what your reply explains. Use "high" only when the message clearly shows the level.';
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
