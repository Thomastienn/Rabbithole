// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

import { equation, grid, sequence } from './maths.ts';
import { plot } from './plot.ts';

// The theme colours by role; the app passes CSS variables, tests pass hex values.
export type Palette = { ground: string; ink: string; muted: string; seam: string; focus: string };
// One per drawn element. `text` is what a screen reader hears for it.
export type SketchItem = { label: string; focus: boolean; text: string };
export type Sketch = { title: string; items: SketchItem[]; markup: string };
export type Drawing = { items: SketchItem[]; markup: string } | { error: string };
export type Line = { text: string; at: number };

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
    const draw = KINDS.get(kind.trim().toLowerCase());
    if (!draw) return { error: `unknown kind "${kind.trim()}"` };
    const lines = body
        .split(/\r\n?|\n/)
        .map((text, i) => ({ text: text.trim(), at: i + 1 }))
        .filter((l) => l.text);
    const title = lines[0] && /^title\s*:/i.test(lines[0].text) ? lines.shift()! : undefined;
    if (!lines.length) return { error: 'empty body' };
    // A grid's rows are cells of one item, not items.
    if (lines.length > 8 && draw !== grid) return { error: 'more than eight items' };
    const drawing = draw(lines, palette);
    return 'error' in drawing
        ? drawing
        : { title: title ? plain(title.text.replace(/^title\s*:/i, '')) : '', ...drawing };
}

// Flow: a small line diagram. Each rank is a column; a second child forks onto the next row down.
const WIDTH = 640,
    ROW = 84,
    LINE = 18,
    // shortcut: label width is estimated at 7px per character of the 14px reading face; measure text if labels clip.
    CHAR = 7;

function wrap(label: string, width: number) {
    const lines: string[] = [];
    for (const word of label.split(/\s+/)) {
        const last = lines.at(-1);
        if (last !== undefined && (last.length + 1 + word.length) * CHAR <= width)
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
    const labels = names.flatMap((n) =>
        wrap(n, column - 24).map((l, i) => {
            const baseline = y(n) + (notesAbove ? 28 : 26) + LINE * i;
            bottom = Math.max(bottom, baseline);
            const f = focus.has(n);
            return text(
                x(n),
                baseline,
                l,
                `fill:${f ? p.focus : p.ink}${f ? ';font-weight:600' : ''}`,
            );
        }),
    );
    const arrowLabels = runs
        .filter((r) => r.e.label)
        .map((r) =>
            text((r.from + x(r.e.b)) / 2, y(r.e.b) - 16, r.e.label, `fill:${p.muted}`, true),
        );
    const stations = names.map((n) =>
        focus.has(n)
            ? `<circle cx="${x(n)}" cy="${y(n)}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
            : `<circle cx="${x(n)}" cy="${y(n)}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`,
    );
    const markup =
        `<svg class="sketch-flow" viewBox="0 0 ${WIDTH} ${bottom + (notesAbove ? 10 : 8)}">` +
        `<path class="sketch-line" style="stroke:${p.seam}" d="${runs.map((r) => r.d).join('')}"/>` +
        `<path class="sketch-arrow" style="stroke:${p.muted}" d="${[...chevrons].join('')}"/>` +
        arrowLabels.join('') +
        stations.join('') +
        labels.join('') +
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

// Bars: one row per item, `label: number` with an optional unit after the number.
function bars(lines: Line[], p: Palette): Drawing {
    const rows = [];
    for (const line of lines) {
        const colon = line.text.lastIndexOf(':'),
            label = plain(line.text.slice(0, Math.max(colon, 0))),
            value = plain(line.text.slice(colon + 1)),
            number =
                /^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?![\d.,])/i.exec(
                    value,
                )?.[0];
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
            .map((r) => {
                const f = r.focus ? ` class="focus" style="color:${p.focus}"` : '';
                return (
                    `<dt${f}>${esc(r.label)}</dt>` +
                    `<dd${r.focus ? ` class="focus"` : ''} style="--v:${+(r.n / max).toFixed(4)}${r.focus ? `;color:${p.focus}` : ''}">` +
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

const KINDS = new Map([
    ['flow', flow],
    ['bars', bars],
    ['plot', plot],
    ['sequence', sequence],
    ['equation', equation],
    ['grid', grid],
]);
