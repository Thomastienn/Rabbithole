// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

import { equation, grid, sequence } from './maths.ts';
import { flow } from './flow.ts';
import { plot } from './plot.ts';
import { cycle, parts, stack, timeline, tree } from './structure.ts';

// The theme colours by role; the app passes CSS variables, tests pass hex values.
export type Palette = { ground: string; ink: string; muted: string; seam: string; focus: string };
// One per drawn element. `text` is what a screen reader hears for it.
// `level` nests a tree's items for a screen reader; other kinds leave it out.
export type SketchItem = { label: string; focus: boolean; text: string; level?: number };
// `about` is the frame of reference a screen reader hears after the title, such as a line's range.
export type Sketch = { title: string; about: string; items: SketchItem[]; markup: string };
export type Drawing = { items: SketchItem[]; markup: string; about?: string } | { error: string };
export type Line = { text: string; at: number; indent: number };
// A kind's drawing gets its item lines and, in the order its KINDS entry names them, its head lines.
type Draw = (lines: Line[], palette: Palette, heads: Line[], width: number) => Drawing;

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const plain = (s: string) => s.replace(/\*/g, '').trim();
export const isFocus = (s: string) => /\*[^*]+\*/.test(s);
export const quoted = (line: Line) => `line ${line.at} "${line.text}"`;
export const list = (parts: string[]) =>
    parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

export function drawSketch(
    kind: string,
    body: string,
    palette: Palette,
    // The width of the box the sketch sits in; it draws at scale 1 there.
    width = 640,
): Sketch | { error: string } {
    const entry = KINDS.get(kind.trim().toLowerCase());
    if (!entry) return { error: `unknown kind "${kind.trim()}"` };
    const [draw, syntaxes = []] = entry;
    const lines = body
        .split(/\r\n?|\n/)
        .map((text, i) => ({
            text: text.trim(),
            at: i + 1,
            indent: /^\s*/.exec(text)![0].replace(/\t/g, '  ').length,
        }))
        .filter((l) => l.text);
    const title = lines[0] && /^title\s*:/i.test(lines[0].text) ? lines.shift()! : undefined;
    if (!lines.length) return { error: 'empty body' };
    const heads: Line[] = [];
    for (const syntax of syntaxes) {
        const key = syntax.slice(0, syntax.indexOf(':')),
            at = lines.findIndex((l) => new RegExp(`^${key}\\s*:`, 'i').test(l.text));
        if (at < 0) return { error: `no "${syntax}" line` };
        heads.push(...lines.splice(at, 1));
    }
    if (!lines.length) return { error: 'no items' };
    // A grid's rows are cells of one item, not items.
    if (lines.length > 8 && draw !== grid) return { error: 'more than eight items' };
    const drawing = draw(lines, palette, heads, width);
    return 'error' in drawing
        ? drawing
        : {
              title: title ? plain(title.text.replace(/^title\s*:/i, '')) : '',
              about: '',
              ...drawing,
          };
}

// The drawing width, row pitch and label line height that flow set and the other kinds share.
export const WIDTH = 640,
    ROW = 84,
    LINE = 18,
    // shortcut: label width is estimated at 7px per character of the 14px reading face; measure text if labels clip.
    CHAR = 7;

export function wrap(label: string, width: number, measure = (s: string) => s.length * CHAR) {
    const lines: string[] = [];
    // A word longer than its line breaks inside the word.
    const words = label.split(/\s+/).flatMap((word) => {
        const parts = [''];
        for (const c of word)
            if (parts.at(-1) && measure(parts.at(-1) + c) > width) parts.push(c);
            else parts[parts.length - 1] += c;
        return parts;
    });
    for (const word of words) {
        const last = lines.at(-1);
        if (last !== undefined && measure(`${last} ${word}`) <= width)
            lines[lines.length - 1] = `${last} ${word}`;
        else lines.push(word);
    }
    return lines;
}

// A number as written at the start of a value: 1,000 and .5 read, 1.2.3 does not.
const NUMBER = /^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?![\d.,])/i;

// Bars: one row per item, `label: number` with an optional unit after the number.
function bars(lines: Line[], p: Palette): Drawing {
    const rows = [];
    for (const line of lines) {
        const colon = line.text.lastIndexOf(':'),
            label = plain(line.text.slice(0, Math.max(colon, 0))),
            value = plain(line.text.slice(colon + 1)),
            number = NUMBER.exec(value)?.[0];
        if (colon < 1 || !label) return { error: `${quoted(line)} is not label: number` };
        if (number === undefined) return { error: `${quoted(line)} has no number` };
        const n = Number(number.replace(/,/g, ''));
        if (!Number.isFinite(n)) return { error: `${quoted(line)} is out of range` };
        if (n < 0) return { error: `${quoted(line)} is below zero` };
        rows.push({ label, value, n, focus: isFocus(line.text) });
    }
    const max = Math.max(...rows.map((r) => r.n)) || 1;
    const markup =
        `<dl class="sketch-bars" style="color:${p.ink}">` +
        rows
            .map((r, k) => {
                const f = r.focus
                    ? ` class="focus" style="--i:${k};color:${p.focus}"`
                    : ` style="--i:${k}"`;
                return (
                    `<dt${f}>${esc(r.label)}</dt>` +
                    `<dd${r.focus ? ` class="focus"` : ''} style="--i:${k};--v:${+(r.n / max).toFixed(4)}${r.focus ? `;color:${p.focus}` : ''}">` +
                    `<s style="background:${r.focus ? p.focus : p.seam}"></s>${esc(r.value)}</dd>`
                );
            })
            .join('') +
        '</dl>';
    const items = rows.map((r) => ({
        label: r.label,
        focus: r.focus,
        text: [r.label, r.value, ...(r.focus ? ['focus'] : [])].join(', '),
    }));
    return { items, markup };
}

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
const at = (n: number) => +n.toFixed(1);
export const write = (x: number, y: number, words: string, style: string, cls = '') =>
    `<text${cls ? ` class="${cls}"` : ''} x="${at(x)}" y="${at(y)}" style="${style}">${esc(words)}</text>`;
export const tone = (p: Palette, focus: boolean) =>
    focus ? `fill:${p.focus};font-weight:600` : `fill:${p.ink}`;
export const ring = (x: number, y: number, focus: boolean, p: Palette) =>
    focus
        ? `<circle cx="${at(x)}" cy="${at(y)}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
        : `<circle cx="${at(x)}" cy="${at(y)}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
const leader = (x: number, from: number, to: number, p: Palette) =>
    `<path class="sketch-leader" style="stroke:${p.seam}" d="M${at(x)} ${at(from)}V${at(to)}"/>`;
// One group per item, in the items' order; `--i` is its place in the sketch's build.
export const group = (k: number, parts: string) => `<g style="--i:${k}">${parts}</g>`;
const withFocus = (parts: string[], focus: boolean) =>
    [...parts, ...(focus ? ['focus'] : [])].join(', ');

// Line: a number line, `range: min..max` then `value: label`; a label crowding its neighbour rises a row.
function line(lines: Line[], p: Palette, [range]: Line[]): Drawing {
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
function quadrant(lines: Line[], p: Palette, heads: Line[]): Drawing {
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
function spectrum(lines: Line[], p: Palette, [head]: Line[]): Drawing {
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

const KINDS = new Map<string, [Draw, string[]?]>([
    ['flow', [flow]],
    ['bars', [bars]],
    ['cycle', [cycle]],
    ['stack', [stack]],
    ['tree', [tree]],
    ['timeline', [timeline]],
    ['parts', [parts]],
    ['line', [line, ['range: min..max']]],
    ['quadrant', [quadrant, ['x: low .. high', 'y: low .. high']]],
    ['spectrum', [spectrum, ['ends: low .. high']]],
    ['plot', [plot]],
    ['sequence', [sequence]],
    ['equation', [equation]],
    ['grid', [grid]],
]);
