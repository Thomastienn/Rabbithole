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
            // [[end]] closes the end section; it carries no value.
            const kind = KIND.exec(body) ?? /^\s*(end)\s*$/i.exec(body);
            // The reply ends at [[end]] (ADR 0016): text after it is dropped.
            if (kind?.[1].toLowerCase() === 'end') {
                cuts.push([start, text.length]);
                markers.push({ kind: 'end', value: '', start });
                break;
            }
            if (kind) cuts.push([start, end]);
            else cuts.push([start, start + 2], [end - 2, end]);
            markers.push({
                kind: kind?.[1].toLowerCase() ?? null,
                value: (kind ? (kind[2] ?? '') : body).trim(),
                start,
            });
        } else if (end === text.length && !final) cuts.push([start, end]);
        else if (whole !== '[')
            cuts.push([start, start + 2], ...(whole.endsWith(']') ? [[end - 1, end]] : []));
    }
    let out = '',
        cursor = 0;
    for (const [s, e] of cuts) {
        out += text.slice(cursor, s);
        cursor = e;
    }
    out += text.slice(cursor);
    // A position after [[end]] maps to the reply's end.
    const at = (p) =>
        Math.min(out.length, p - cuts.reduce((n, [s, e]) => n + (e <= p ? e - s : 0), 0));
    return {
        text: out,
        markers: markers.map(({ start, ...m }) => ({ ...m, position: at(start) })),
        at,
    };
}

const name = (v) => (v && v.length <= 200 && !/[\u0000-\u001f]/.test(v) ? v : null);
const same = (list, v) => list.some((x) => (x.text ?? x).toLowerCase() === v.toLowerCase());

// The notes the learner sees, read from the reply's markers (ADR 0016) with the notes reader's limits.
// text is the stripped text; hasMedia: the reply holds a visual, discussion or video, so no video offer joins it.
export function markerNotes(text, markers, hasMedia = false) {
    const notes = { questions: [], passages: [], groundwork: [], ended: false };
    let grounded = false,
        offered = false;
    for (const m of markers) {
        if (m.kind === 'groundwork') {
            // Only the first groundwork line counts, and only before any reply text.
            if (grounded || text.slice(0, m.position).trim()) continue;
            grounded = true;
            for (const g of m.value.split(';').map((g) => name(g.trim())))
                if (g && notes.groundwork.length < 3 && !same(notes.groundwork, g))
                    notes.groundwork.push(g);
        } else if (m.kind === null) {
            // The term stays in the text; its passage is where it landed, skipping a repeat or one over six words.
            const start = text.indexOf(m.value, m.position);
            if (
                start >= 0 &&
                !text.slice(m.position, start).trim() &&
                m.value.split(/\s+/).length <= 6 &&
                !same(notes.passages, m.value)
            )
                notes.passages.push({ start, end: start + m.value.length, text: m.value });
        } else if (m.kind === 'next' || m.kind === 'video offer') {
            if (!m.value || notes.questions.length >= 3 || same(notes.questions, m.value)) continue;
            if (m.kind === 'video offer') {
                // At most one per reply, never beside media.
                if (offered || hasMedia) continue;
                offered = true;
            }
            notes.questions.push(m.value);
        } else if (m.kind === 'end') notes.ended = true;
    }
    return notes;
}
