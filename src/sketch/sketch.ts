// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

import { compare, pie, venn } from './comparisons.ts';
import { equation, grid, sequence } from './maths.ts';
import { plot } from './plot.ts';

// The theme colours by role; the app passes CSS variables, tests pass hex values.
export type Palette = {
    ground: string;
    ink: string;
    muted: string;
    seam: string;
    hairline: string;
    focus: string;
};
// One per drawn element. `text` is what a screen reader hears for it.
export type SketchItem = { label: string; focus: boolean; text: string };
// `about` is the frame of reference a screen reader hears after the title, such as a line's range.
export type Sketch = { title: string; about: string; items: SketchItem[]; markup: string };
export type Drawing = { items: SketchItem[]; markup: string; about?: string } | { error: string };
export type Line = { text: string; at: number };
// A kind's drawing gets its item lines and, in the order its KINDS entry names them, its head lines.
type Draw = (lines: Line[], palette: Palette, heads: Line[]) => Drawing;

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const plain = (s: string) => s.replace(/\*/g, '').trim();
export const isFocus = (s: string) => /\*[^*]+\*/.test(s);
export const quoted = (line: Line) => `line ${line.at} "${line.text}"`;
const list = (parts: string[]) =>
    parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

export function drawSketch(
    kind: string,
    body: string,
    palette: Palette,
): Sketch | { error: string } {
    const entry = KINDS.get(kind.trim().toLowerCase());
    if (!entry) return { error: `unknown kind "${kind.trim()}"` };
    const [draw, syntaxes = []] = entry;
    const lines = body
        .split(/\r\n?|\n/)
        .map((text, i) => ({ text: text.trim(), at: i + 1 }))
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
    const drawing = draw(lines, palette, heads);
    return 'error' in drawing
        ? drawing
        : {
              title: title ? plain(title.text.replace(/^title\s*:/i, '')) : '',
              about: '',
              ...drawing,
          };
}

// Flow: a small line diagram. Each rank is a column; a second child forks onto the next row down.
export const WIDTH = 640,
    ROW = 84,
    LINE = 18,
    // shortcut: label width is estimated at 7px per character of the 14px reading face; measure text if labels clip.
    CHAR = 7;

export function wrap(label: string, width: number, char = CHAR) {
    const lines: string[] = [];
    for (const word of label.split(/\s+/)) {
        const last = lines.at(-1);
        if (last !== undefined && (last.length + 1 + word.length) * char <= width)
            lines[lines.length - 1] = `${last} ${word}`;
        else lines.push(word);
    }
    return lines;
}

function flow(lines: Line[], p: Palette): Drawing {
    const names: string[] = [],
        focus = new Set<string>(),
        edges: { a: string; b: string; label: string }[] = [];
    const node = (raw: string) => {
        const name = plain(raw);
        if (isFocus(raw)) focus.add(name);
        if (!names.includes(name)) names.push(name);
        return name;
    };
    for (const line of lines) {
        const steps = line.text.split(/\s*-+>\s*/);
        const last = steps.at(-1)!,
            colon = last.indexOf(':'),
            label = colon < 0 ? '' : plain(last.slice(colon + 1));
        if (colon >= 0) steps[steps.length - 1] = last.slice(0, colon);
        if (steps.length < 2 || steps.some((s) => !plain(s)))
            return { error: `${quoted(line)} is not A -> B` };
        if (edges.length + steps.length - 1 > 8) return { error: 'more than eight steps' };
        for (let i = 0; i + 1 < steps.length; i++)
            edges.push({
                a: node(steps[i]),
                b: node(steps[i + 1]),
                label: i + 2 === steps.length ? label : '',
            });
    }
    // A step's rank is its longest path from a start; edges back into the path (loops) are left out of it.
    const back = new Set<(typeof edges)[number]>(),
        state = new Map<string, number>();
    const visit = (n: string) => {
        state.set(n, 1);
        for (const e of edges.filter((e) => e.a === n))
            if (state.get(e.b) === 1) back.add(e);
            else if (!state.get(e.b)) visit(e.b);
        state.set(n, 2);
    };
    names.forEach((n) => state.get(n) || visit(n));
    const forward = edges.filter((e) => !back.has(e)),
        rank = new Map(names.map((n) => [n, 0]));
    for (let k = 0; k < names.length; k++)
        for (const e of forward) rank.set(e.b, Math.max(rank.get(e.b)!, rank.get(e.a)! + 1));
    // Each row is one path: a step stays on the row of a parent whose first child it is.
    const row = new Map<string, number>();
    let rows = 0;
    for (const n of [...names].sort((a, b) => rank.get(a)! - rank.get(b)!)) {
        const parent = forward.find((e) => e.b === n && forward.find((f) => f.a === e.a)?.b === n);
        row.set(n, parent && row.has(parent.a) ? row.get(parent.a)! : rows++);
    }
    const column = WIDTH / (Math.max(...rank.values()) + 1),
        notesAbove = edges.some((e) => e.label && row.get(e.b) === 0),
        top = notesAbove ? 40 : 24,
        x = (n: string) => column * (rank.get(n)! + 0.5),
        y = (n: string) => top + ROW * row.get(n)!;
    // Each edge turns only at 45 or 90 degrees, then runs straight along its target's row.
    const runs = edges.map((e) => {
        const [sx, sy, tx, ty] = [x(e.a), y(e.a), x(e.b), y(e.b)],
            drop = Math.abs(ty - sy);
        if (sy === ty) return { e, d: `M${sx} ${sy}H${tx}`, from: sx };
        const start = sy < ty ? tx - 32 - drop : sx + 32;
        if (start >= sx && start + drop <= tx)
            return {
                e,
                d: `M${sx} ${sy}H${start}L${start + drop} ${ty}H${tx}`,
                from: start + drop,
            };
        return { e, d: `M${sx} ${sy}V${ty}H${tx}`, from: sx };
    });
    // Steps into one station share a chevron, on the run after the last merge.
    const chevrons = new Set<string>();
    for (const n of names) {
        const into = runs.filter((r) => r.e.b === n);
        if (!into.length) continue;
        const tx = x(n),
            way = into[0].from <= tx ? 1 : -1,
            from =
                way > 0
                    ? Math.max(...into.map((r) => r.from))
                    : Math.min(...into.map((r) => r.from)),
            // Centre a short fork approach and give a chevron after a rejoin more room past the bend.
            offset = into.length > 1 ? 4 : from === x(into[0].e.a) ? 2 : 0,
            tip = (from + tx) / 2 + offset * way;
        chevrons.add(`M${tip - 5 * way} ${y(n) - 5}L${tip} ${y(n)}L${tip - 5 * way} ${y(n) + 5}`);
    }
    let bottom = 0;
    const text = (tx: number, ty: number, words: string, style: string, note = false) =>
        `<text${note ? ' class="sketch-note"' : ''} x="${tx}" y="${ty}" style="${style}">${esc(words)}</text>`;
    // One group per item, in the items' order; `--i` is its place in the sketch's build.
    const groups = names.map((n, k) => {
        const f = focus.has(n);
        const notes = runs
            .filter((r) => r.e.label && r.e.b === n)
            .map((r) =>
                text((r.from + x(r.e.b)) / 2, y(r.e.b) - 16, r.e.label, `fill:${p.muted}`, true),
            );
        const station = f
            ? `<circle cx="${x(n)}" cy="${y(n)}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
            : `<circle cx="${x(n)}" cy="${y(n)}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
        const labels = wrap(n, column - 24).map((l, i) => {
            const baseline = y(n) + (notesAbove ? 28 : 26) + LINE * i;
            bottom = Math.max(bottom, baseline);
            return text(
                x(n),
                baseline,
                l,
                `fill:${f ? p.focus : p.ink}${f ? ';font-weight:600' : ''}`,
            );
        });
        return `<g style="--i:${k}">${notes.join('')}${station}${labels.join('')}</g>`;
    });
    const markup =
        `<svg class="sketch-flow" viewBox="0 0 ${WIDTH} ${bottom + (notesAbove ? 10 : 8)}">` +
        `<path class="sketch-line" style="stroke:${p.seam}" d="${runs.map((r) => r.d).join('')}"/>` +
        `<path class="sketch-arrow" style="stroke:${p.muted}" d="${[...chevrons].join('')}"/>` +
        groups.join('') +
        '</svg>';
    const items = names.map((n) => {
        const next = edges
            .filter((e) => e.a === n)
            .map((e) => e.b + (e.label ? `: ${e.label}` : ''));
        return {
            label: n,
            focus: focus.has(n),
            text: [
                n,
                ...(next.length ? [`leads to ${list(next)}`] : []),
                ...(focus.has(n) ? ['focus'] : []),
            ].join(', '),
        };
    });
    return { items, markup };
}

// A number as written at the start of a value: 1,000 and .5 read, 1.2.3 does not.
const NUMBER = /^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?![\d.,])/i;

// `label: number`, with an optional unit after the number (bars and pie).
export type Quantity = { label: string; value: string; number: string; n: number; focus: boolean };
export function quantity(line: Line): Quantity | { error: string } {
    const colon = line.text.lastIndexOf(':'),
        label = plain(line.text.slice(0, Math.max(colon, 0))),
        value = plain(line.text.slice(colon + 1)),
        number = NUMBER.exec(value)?.[0];
    if (colon < 1 || !label) return { error: `${quoted(line)} is not label: number` };
    if (number === undefined) return { error: `${quoted(line)} has no number` };
    const n = Number(number.replace(/,/g, ''));
    if (!Number.isFinite(n)) return { error: `${quoted(line)} is out of range` };
    return { label, value, number, n, focus: isFocus(line.text) };
}

// Bars: one row per item.
function bars(lines: Line[], p: Palette): Drawing {
    const rows: Quantity[] = [];
    for (const line of lines) {
        const row = quantity(line);
        if ('error' in row) return row;
        if (row.n < 0) return { error: `${quoted(line)} is below zero` };
        rows.push(row);
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
const write = (x: number, y: number, words: string, style: string, cls = '') =>
    `<text${cls ? ` class="${cls}"` : ''} x="${at(x)}" y="${at(y)}" style="${style}">${esc(words)}</text>`;
const tone = (p: Palette, focus: boolean) =>
    focus ? `fill:${p.focus};font-weight:600` : `fill:${p.ink}`;
const station = (x: number, y: number, focus: boolean, p: Palette) =>
    focus
        ? `<circle cx="${at(x)}" cy="${at(y)}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
        : `<circle cx="${at(x)}" cy="${at(y)}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
const leader = (x: number, from: number, to: number, p: Palette) =>
    `<path class="sketch-leader" style="stroke:${p.seam}" d="M${at(x)} ${at(from)}V${at(to)}"/>`;
// One group per item, in the items' order; `--i` is its place in the sketch's build.
const group = (k: number, parts: string) => `<g style="--i:${k}">${parts}</g>`;
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
                station(o.x, axis, v.focus, p) +
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
                        : station(
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
        rows
            .map((r, i) => group(i, lower[i] + station(x(i), axis, r.focus, p) + upper[i]))
            .join('') +
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
    ['compare', [compare, ['vs: A | B']]],
    ['venn', [venn]],
    ['pie', [pie]],
    ['line', [line, ['range: min..max']]],
    ['quadrant', [quadrant, ['x: low .. high', 'y: low .. high']]],
    ['spectrum', [spectrum, ['ends: low .. high']]],
    ['plot', [plot]],
    ['sequence', [sequence]],
    ['equation', [equation]],
    ['grid', [grid]],
]);
