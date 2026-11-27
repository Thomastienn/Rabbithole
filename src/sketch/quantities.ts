// Sketch kinds for quantities: line, quadrant and spectrum (ADR 0027).
import {
    at,
    CHAR,
    esc,
    group,
    isFocus,
    NUMBER,
    plain,
    quoted,
    ring,
    wrap,
    type Drawing,
    type Line,
    type Palette,
} from './sketch.ts';

// Shared by line, quadrant and spectrum: a 592px run from x 24 to 616 in a 640px view.
const LEFT = 24,
    RUN = 592;
const after = (l: Line) => l.text.slice(l.text.indexOf(':') + 1).trim();
// `low .. high` from a head line, or undefined when it has not two ends.
const ends = (l: Line) => {
    const parts = after(l)
        .split(/\s*(?:\.\.+|…)\s*/)
        .map(plain);
    return parts.length === 2 && parts.every(Boolean) ? (parts as [string, string]) : undefined;
};
const minus = (s: string) => s.replace(/^-(?=[\d.])/, '−');
const write = (x: number, y: number, words: string, style: string, cls = '') =>
    `<text${cls ? ` class="${cls}"` : ''} x="${at(x)}" y="${at(y)}" style="${style}">${esc(words)}</text>`;
const tone = (p: Palette, focus: boolean) =>
    focus ? `fill:${p.focus};font-weight:600` : `fill:${p.ink}`;
const leader = (x: number, from: number, to: number, p: Palette) =>
    `<path class="sketch-leader" style="stroke:${p.seam}" d="M${at(x)} ${at(from)}V${at(to)}"/>`;
const withFocus = (parts: string[], focus: boolean) =>
    [...parts, ...(focus ? ['focus'] : [])].join(', ');

// Line: a number line, `range: min..max` then `value: label`; a label crowding its neighbour rises a row.
export function line(lines: Line[], p: Palette, [range]: Line[]): Drawing {
    const written = ends(range),
        bounds = written?.map((e) => ({ e, m: NUMBER.exec(e.replace(/^−/, '-'))?.[0] }));
    const [lo, hi] = bounds?.map((b) => Number(b.m?.replace(/,/g, '') ?? NaN)) ?? [];
    if (!bounds || !(lo < hi) || !Number.isFinite(hi - lo))
        return { error: `${quoted(range)} is not range: min..max` };
    const values = [];
    let unit = '';
    for (const l of lines) {
        const colon = l.text.indexOf(':'),
            raw = plain(l.text.slice(0, Math.max(colon, 0))),
            label = plain(l.text.slice(colon + 1)),
            number = NUMBER.exec(raw.replace(/^−/, '-'))?.[0];
        if (colon < 1 || number === undefined || !label)
            return { error: `${quoted(l)} is not value: label` };
        const n = Number(number.replace(/,/g, ''));
        if (!(n >= lo && n <= hi)) return { error: `${quoted(l)} is outside ${after(range)}` };
        unit ||= raw.slice(number.length);
        values.push({ n, value: minus(raw), label, focus: isFocus(l.text) });
    }
    values.sort((a, b) => a.n - b.n);
    // shortcut: text width is estimated at 0.6em (8.4px) per character, as the mockup does; measure text if labels collide.
    const span = (x: number, words: string) => {
        const w = words.length * 8.4,
            c = Math.min(Math.max(x, w / 2), 640 - w / 2);
        return { c, x0: c - w / 2, x1: c + w / 2 };
    };
    const placed: { x: number; c: number; x0: number; x1: number; row: number }[] = [];
    for (const v of values) {
        const x = LEFT + ((v.n - lo) / (hi - lo)) * RUN,
            s = span(x, v.label);
        // A row is free when no label on it comes within 12px and no leader crosses a label.
        const fits = (row: number) =>
            placed.every((o) =>
                o.row === row
                    ? o.x1 + 12 <= s.x0 || s.x1 + 12 <= o.x0
                    : o.row < row
                      ? x < o.x0 || x > o.x1
                      : o.x < s.x0 || o.x > s.x1,
            );
        // shortcut: a fourth crowded label shares the top row; the tutor rule keeps lines short.
        placed.push({ x, ...s, row: [0, 1, 2].find(fits) ?? 2 });
    }
    const axis = 34 + 22 * Math.max(...placed.map((o) => o.row)),
        under = axis + 26;
    const marks = values.map((v, i) => {
        const o = placed[i],
            top = axis - 18 - 22 * o.row;
        return group(
            i,
            (o.row ? leader(o.x, top + 6, axis - 9, p) : '') +
                ring(o.x, axis, v.focus, p) +
                write(o.c, top, v.label, tone(p, v.focus)) +
                write(span(o.x, v.value).c, under, v.value, `fill:${p.muted}`, 'sketch-note'),
        );
    });
    // Each range end is written under its tick unless a value comes within 12px of it.
    const [low, high] = bounds.map((b) => minus(b.e) + (b.e.length > b.m!.length ? '' : unit));
    const spans = values.map((v, i) => span(placed[i].x, v.value)),
        endMarks = [
            spans.every((s) => s.x0 >= LEFT + low.length * CHAR + 12)
                ? write(LEFT, under, low, `fill:${p.muted}`, 'sketch-note sketch-start')
                : '',
            spans.every((s) => s.x1 <= LEFT + RUN - high.length * CHAR - 12)
                ? write(LEFT + RUN, under, high, `fill:${p.muted}`, 'sketch-note sketch-end')
                : '',
        ];
    const markup =
        `<svg class="sketch-line-kind" viewBox="0 0 640 ${axis + 32}">` +
        `<path class="sketch-line" style="stroke:${p.seam}" d="M${LEFT} ${axis}H${LEFT + RUN}"/>` +
        `<path class="sketch-arrow" style="stroke:${p.muted}" d="M${LEFT} ${axis - 7}V${axis + 7}M${LEFT + RUN} ${axis - 7}V${axis + 7}"/>` +
        marks.join('') +
        endMarks.join('') +
        '</svg>';
    const items = values.map((v) => ({
        label: v.label,
        focus: v.focus,
        text: withFocus([v.label, v.value], v.focus),
    }));
    return { items, markup, about: `from ${low} to ${high}` };
}

// Quadrant: `x: low .. high`, `y: low .. high`, then `item: x, y` on a 400 x 240 field from 0 to 10.
export function quadrant(lines: Line[], p: Palette, heads: Line[]): Drawing {
    const [xs, ys] = heads.map(ends);
    for (const [i, axis] of [xs, ys].entries())
        if (!axis) return { error: `${quoted(heads[i])} is not ${'xy'[i]}: low .. high` };
    const spots = new Map<
        string,
        { x: number; y: number; names: { label: string; focus: boolean; k: number }[] }
    >();
    const items = [];
    for (const l of lines) {
        const colon = l.text.lastIndexOf(':'),
            label = plain(l.text.slice(0, Math.max(colon, 0))),
            xy = /^(\S+)\s*,\s*(\S+)$/.exec(plain(l.text.slice(colon + 1)));
        if (colon < 1 || !label || !xy || !xy.slice(1).every((v) => Number.isFinite(+v)))
            return { error: `${quoted(l)} is not item: x, y` };
        for (const [i, v] of xy.slice(1).entries()) {
            if (+v < 0) return { error: `${quoted(l)} has ${'xy'[i]} ${v}, below 0` };
            if (+v > 10) return { error: `${quoted(l)} has ${'xy'[i]} ${v}, above 10` };
        }
        const [x, y] = [+xy[1], +xy[2]],
            focus = isFocus(l.text),
            spot = spots.get(`${x},${y}`) ?? { x, y, names: [] };
        spots.set(`${x},${y}`, spot);
        spot.names.push({ label, focus, k: items.length });
        items.push({ label, focus, text: withFocus([label, `x ${xy[1]}`, `y ${xy[2]}`], focus) });
    }
    const X = (v: number) => 120 + v * 40,
        Y = (v: number) => 276 - v * 24,
        note = `fill:${p.muted}`;
    // Items at one spot share a station; their labels stack 20px apart, upward past the field's bottom.
    const marks = [...spots.values()].map((s) => {
        const rows = s.names.flatMap((n) => wrap(n.label, 150).map((words) => ({ ...n, words }))),
            right = s.x > 7,
            first = Math.min(Y(s.y) + 5, 281 - 20 * (rows.length - 1));
        const texts = rows.map((r, i) => ({
            k: r.k,
            markup: write(
                X(s.x) + (right ? -12 : 12),
                first + 20 * i,
                r.words,
                tone(p, r.focus),
                right ? 'sketch-end' : 'sketch-start',
            ),
        }));
        // The spot's first item brings the shared station.
        return s.names
            .map((n, j) =>
                group(
                    n.k,
                    (j
                        ? ''
                        : ring(
                              X(s.x),
                              Y(s.y),
                              s.names.some((m) => m.focus),
                              p,
                          )) +
                        texts
                            .filter((t) => t.k === n.k)
                            .map((t) => t.markup)
                            .join(''),
                ),
            )
            .join('');
    });
    const side = (words: string, x: number, cls: string) => {
        const rows = wrap(words, 88);
        return rows
            .map((r, i) =>
                write(x, 160 - 8 * (rows.length - 1) + 16 * i, r, note, `sketch-note ${cls}`),
            )
            .join('');
    };
    const markup =
        `<svg class="sketch-quadrant" viewBox="0 0 640 308" style="stroke:${p.ground}">` +
        `<path class="sketch-line" style="stroke:${p.seam}" d="M120 156H520M320 276V36"/>` +
        `<path class="sketch-arrow" style="stroke:${p.muted}" d="M515 151L520 156L515 161M315 41L320 36L325 41"/>` +
        write(320, 22, ys![1], note, 'sketch-note') +
        write(320, 300, ys![0], note, 'sketch-note') +
        side(xs![0], 108, 'sketch-end') +
        side(xs![1], 532, 'sketch-start') +
        marks.join('') +
        '</svg>';
    return { items, markup, about: `across ${xs![0]} to ${xs![1]}, up ${ys![0]} to ${ys![1]}` };
}

// Spectrum: `ends: low .. high`, then `item: note` in order, evenly spaced; from five, every second drops a row.
export function spectrum(lines: Line[], p: Palette, [head]: Line[]): Drawing {
    const sides = ends(head);
    if (!sides) return { error: `${quoted(head)} is not ends: low .. high` };
    const rows: { name: string; note: string; focus: boolean }[] = [];
    for (const l of lines) {
        const colon = l.text.indexOf(':'),
            name = plain(colon < 0 ? l.text : l.text.slice(0, colon)),
            note = colon < 0 ? '' : plain(l.text.slice(colon + 1));
        if (!name) return { error: `${quoted(l)} has no name` };
        rows.push({ name, note, focus: isFocus(l.text) });
    }
    const n = rows.length,
        slot = RUN / n,
        two = n >= 5,
        width = (two ? 2 * slot : slot) - 16,
        sideRows = sides.map((s) => wrap(s, 220)),
        axis = 30 + 16 * (Math.max(...sideRows.map((r) => r.length)) - 1),
        x = (i: number) => LEFT + slot * (i + 0.5),
        note = `fill:${p.muted}`;
    let bottom = 0;
    // The name's first line sits at `top`; the note follows 17px under the name's last line.
    const block = (i: number, top: number) => {
        const r = rows[i],
            names = wrap(r.name, width),
            notes = r.note ? wrap(r.note, width) : [],
            noteTop = top + 18 * (names.length - 1) + 17;
        bottom = Math.max(bottom, notes.length ? noteTop + 16 * (notes.length - 1) : noteTop - 17);
        return (
            names.map((w, j) => write(x(i), top + 18 * j, w, tone(p, r.focus))).join('') +
            notes.map((w, j) => write(x(i), noteTop + 16 * j, w, note, 'sketch-note')).join('')
        );
    };
    const upper = rows.map((_, i) => (two && i % 2 ? '' : block(i, axis + 30))),
        lowerTop = bottom + 32,
        lower = rows.map((_, i) =>
            two && i % 2 ? leader(x(i), axis + 9, lowerTop - 18, p) + block(i, lowerTop) : '',
        );
    const markup =
        `<svg class="sketch-spectrum" viewBox="0 0 640 ${at(bottom + 10)}">` +
        `<path class="sketch-line" style="stroke:${p.seam}" d="M${LEFT} ${axis}H${LEFT + RUN}"/>` +
        sideRows[0]
            .map((w, j) => write(LEFT, 16 + 16 * j, w, note, 'sketch-note sketch-start'))
            .join('') +
        sideRows[1]
            .map((w, j) => write(LEFT + RUN, 16 + 16 * j, w, note, 'sketch-note sketch-end'))
            .join('') +
        rows.map((r, i) => group(i, lower[i] + ring(x(i), axis, r.focus, p) + upper[i])).join('') +
        '</svg>';
    const items = rows.map((r) => ({
        label: r.name,
        focus: r.focus,
        text: withFocus([r.name, ...(r.note ? [r.note] : [])], r.focus),
    }));
    return { items, markup, about: `from ${sides[0]} to ${sides[1]}` };
}
