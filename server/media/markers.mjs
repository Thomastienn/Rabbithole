import { parse } from '../../src/markdown/markdownText.ts';

// A closed marker, an unclosed one at the end of its line or of the text, or a lone [ that may start one.
const MARKER = /\[\[([^[\]\r\n]*)(\]\]|\]?$|(?=\r?\n))|\[$/g;
const KIND = /^\s*([a-z]+(?: [a-z]+)*)\s*:(.*)$/i;

// Code and math keep [[ as written; the reply renderer's own parse finds them.
const literal = (text) => {
    const spans = [];
    const walk = (n) =>
        ['code', 'inlineCode', 'math', 'inlineMath'].includes(n.type)
            ? spans.push([n.position.start.offset, n.position.end.offset])
            : n.children?.forEach(walk);
    walk(parse(text));
    return spans;
};

// The streaming marker stripper (ADR 0016, 0017): [[kind: value]] leaves the text and [[words]] keeps its words.
// While streaming, one still arriving at the end is held back; an unclosed one at the end of its line stays as plain text.
// at(p) maps a position in text to the stripped text; marker positions are already mapped.
export function stripMarkers(text, final = false) {
    const found = [...text.matchAll(MARKER)];
    if (!found.length) return { text, markers: [], at: (p) => p };
    const spans = literal(text),
        cuts = [],
        markers = [];
    for (const m of found) {
        const [whole, body = '', close] = m,
            start = m.index,
            end = start + whole.length;
        if (spans.some(([s, e]) => start >= s && start < e)) continue;
        if (close === ']]') {
            if (!body.trim()) continue;
            const kind = KIND.exec(body);
            if (kind) cuts.push([start, end]);
            else cuts.push([start, start + 2], [end - 2, end]);
            markers.push({
                kind: kind?.[1].toLowerCase() ?? null,
                value: (kind?.[2] ?? body).trim(),
                start,
            });
        } else if (end === text.length && !final) cuts.push([start, end]);
        else if (whole !== '[')
            cuts.push([start, start + 2], ...(whole.endsWith(']') ? [[end - 1, end]] : []));
    }
    const at = (p) => p - cuts.reduce((n, [s, e]) => n + (e <= p ? e - s : 0), 0);
    let out = '',
        cursor = 0;
    for (const [s, e] of cuts) {
        out += text.slice(cursor, s);
        cursor = e;
    }
    return {
        text: out + text.slice(cursor),
        markers: markers.map(({ start, ...m }) => ({ ...m, position: at(start) })),
        at,
    };
}
