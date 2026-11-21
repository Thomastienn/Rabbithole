import { parse } from '../../src/markdown/markdownText.ts';

// A closed marker, an unclosed one at the end of its line or of the text, or a lone [ that may start one.
// A visual or discussion marker's fields may hold single brackets, so a stray one cannot leave its check answer as text.
const MARKER =
    /\[\[(\s*(?:visual|discussion)\s*:(?:[^\]\r\n]|\](?!\]))*|[^[\]\r\n]*)(\]\]|\]?$|(?=\r?\n))|\[$/gi;
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
// While streaming, one still arriving at the end is held back; an unclosed one at the end of its line stays as plain text,
// except a visual or discussion marker, which is removed whole and recorded with closed: false (ADR 0018).
// The reply ends at a closed discussion marker: text after it is dropped, and only the end section's markers are read.
// at(p) maps a position in text to the stripped text; marker positions are already mapped.
export function stripMarkers(text, final = false) {
    const found = [...text.matchAll(MARKER)];
    if (!found.length) return { text, markers: [], at: (p) => p };
    const spans = literal(text),
        cuts = [],
        markers = [];
    let discussed = false;
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
                if (!discussed) cuts.push([start, text.length]);
                markers.push({ kind: 'end', value: '', start });
                break;
            }
            if (discussed) {
                if (['next', 'video offer'].includes(kind?.[1].toLowerCase()))
                    markers.push({ kind: kind[1].toLowerCase(), value: kind[2].trim(), start });
                continue;
            }
            if (kind?.[1].toLowerCase() === 'discussion') {
                discussed = true;
                cuts.push([start, text.length]);
            } else if (kind) cuts.push([start, end]);
            else cuts.push([start, start + 2], [end - 2, end]);
            markers.push({
                kind: kind?.[1].toLowerCase() ?? null,
                value: (kind ? (kind[2] ?? '') : body).trim(),
                start,
            });
        } else if (discussed) continue;
        else if (end === text.length && !final) cuts.push([start, end]);
        else if (['visual', 'discussion'].includes(KIND.exec(body)?.[1].toLowerCase())) {
            cuts.push([start, end]);
            markers.push({
                kind: KIND.exec(body)[1].toLowerCase(),
                value: '',
                closed: false,
                start,
            });
        } else if (whole !== '[')
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

// A note's name, as the notes reader bounds it: trimmed, at most 200 characters, no control characters.
export const noteName = (v) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t && t.length <= 200 && !/[\u0000-\u001f]/.test(t) ? t : null;
};
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
            for (const g of m.value.split(';').map(noteName))
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

// A visual marker's fields (ADR 0018): name first, then key: value parts split by |.
const VISUAL_LIMITS = { name: 40, title: 120, shows: 280, alt: 280, check: 600 };
// The writer reads the reply so far as context; a resource bound, not a rule the tutor sees.
const VISUAL_CONTEXT = 6000;
const field = (text, limit) =>
    text
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, limit)
        .trim();

// The visual writer's request, repaired rather than refused; { cause } when it cannot be drawn.
export function readVisualMarker(value, replySoFar = '') {
    const [name, ...parts] = value.split('|');
    const fields = { name: field(name, VISUAL_LIMITS.name) };
    for (const part of parts) {
        const colon = part.indexOf(':'),
            key = part.slice(0, colon).trim().toLowerCase();
        if (colon > 0 && Object.hasOwn(VISUAL_LIMITS, key) && key !== 'name')
            fields[key] ||= field(part.slice(colon + 1), VISUAL_LIMITS[key]);
    }
    if (!fields.shows) return { cause: 'no shows' };
    const context = replySoFar.trim().slice(-VISUAL_CONTEXT);
    return {
        title: fields.title || fields.name || fields.shows.slice(0, VISUAL_LIMITS.title).trim(),
        shows: fields.shows,
        alt: fields.alt || fields.shows,
        ...(fields.check && { check_answer: fields.check }),
        ...(context && { context }),
    };
}

// A discussion marker (ADR 0018): classmates "Name (level): voice", then lines "Speaker > text", split by |.
const CLASSMATE = /^([^()>|]+?)\s*\(\s*(below|near|above)\s*\)\s*:(.*)$/i;
const LINE = /^([^>]+?)\s*>(.*)$/;

// The discussion's opening, repaired rather than refused; { cause } when it cannot start.
export function readDiscussionMarker(value) {
    const classmates = [],
        lines = [];
    for (const part of value.split('|')) {
        const c = !lines.length && CLASSMATE.exec(part.trim());
        if (c) {
            const name = field(c[1], 60),
                voice = field(c[3], 500);
            const taken = ['tutor', 'learner', ...classmates.map((p) => p.name.toLowerCase())];
            if (name && voice && !taken.includes(name.toLowerCase()) && classmates.length < 4)
                classmates.push({ name, level: c[2].toLowerCase(), voice });
            continue;
        }
        const l = LINE.exec(part.trim());
        if (!l) continue;
        const speaker = field(l[1], 60),
            text = field(l[2], 2000);
        // A line whose speaker is not a classmate or Tutor is dropped.
        if (text && (speaker === 'Tutor' || classmates.some((p) => p.name === speaker)))
            lines.push({ speaker, text });
    }
    if (classmates.length < 3) return { cause: 'fewer than three classmates' };
    if (lines.length < 4) return { cause: 'fewer than four lines' };
    return { task: { classmates, lines: lines.slice(0, 8) } };
}
