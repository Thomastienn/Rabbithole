// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

import { compare, pie, venn } from './comparisons.ts';
import { equation, grid, sequence } from './maths.ts';
import { flow } from './flow.ts';
import { plot } from './plot.ts';
import { line, quadrant, spectrum } from './quantities.ts';
import { cycle, parts, stack, timeline, tree } from './structure.ts';

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
export const NUMBER = /^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?![\d.,])/i;

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
        // One hit area per row: the whole row, label to bar track end (mockup Rabbithole-skt.6).
        rows
            .map((_, i) => `<div class="sketch-hit" data-item="${i}" style="--row:${i + 1}"></div>`)
            .join('') +
        '</dl>';
    const items = rows.map((r) => ({
        label: r.label,
        focus: r.focus,
        text: [r.label, r.value, ...(r.focus ? ['focus'] : [])].join(', '),
    }));
    return { items, markup };
}

// Shared drawing pieces: a rounded coordinate, a ring marker and one item's group.
export const at = (n: number) => +n.toFixed(1);
export const ring = (x: number, y: number, focus: boolean, p: Palette) =>
    focus
        ? `<circle cx="${at(x)}" cy="${at(y)}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
        : `<circle cx="${at(x)}" cy="${at(y)}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
// One group per item, in the items' order; `--i` is its place in the sketch's build.
export const group = (k: number, parts: string) => `<g style="--i:${k}">${parts}</g>`;

const KINDS = new Map<string, [Draw, string[]?]>([
    ['flow', [flow]],
    ['bars', [bars]],
    ['compare', [compare, ['vs: A | B']]],
    ['venn', [venn]],
    ['pie', [pie]],
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
