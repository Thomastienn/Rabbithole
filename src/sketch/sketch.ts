// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

// The theme colours by role; the app passes CSS variables, tests pass hex values.
export type Palette = { ground: string; ink: string; muted: string; seam: string; focus: string };
// One per drawn element. `text` is what a screen reader hears for it.
export type SketchItem = { label: string; focus: boolean; text: string };
export type Sketch = { title: string; items: SketchItem[]; markup: string };
type Drawing = { items: SketchItem[]; markup: string } | { error: string };
type Line = { text: string; at: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const plain = (s: string) => s.replace(/\*/g, '').trim();
const isFocus = (s: string) => /\*[^*]+\*/.test(s);
const quoted = (line: Line) => `line ${line.at} "${line.text}"`;
const list = (parts: string[]) =>
    parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

export function drawSketch(
    kind: string,
    body: string,
    palette: Palette,
    // The width of the box the sketch sits in; it draws at scale 1 there.
    width = 640,
): Sketch | { error: string } {
    const draw = KINDS.get(kind.trim().toLowerCase());
    if (!draw) return { error: `unknown kind "${kind.trim()}"` };
    const lines = body
        .split(/\r\n?|\n/)
        .map((text, i) => ({ text: text.trim(), at: i + 1 }))
        .filter((l) => l.text);
    const title = lines[0] && /^title\s*:/i.test(lines[0].text) ? lines.shift()! : undefined;
    if (!lines.length) return { error: 'empty body' };
    if (lines.length > 8) return { error: 'more than eight items' };
    const drawing = draw(lines, palette, width);
    return 'error' in drawing
        ? drawing
        : { title: title ? plain(title.text.replace(/^title\s*:/i, '')) : '', ...drawing };
}

// Flow: a small line diagram. Each rank is a column; a second child forks onto the next row down.
// A box too narrow for its columns turns it vertical: ranks run down, rows become lanes.
const ROW = 84,
    LINE = 18,
    // shortcut: label width is estimated at 7px per character of the 14px reading face and 6.4px of the
    // 13px arrow labels; measure text if labels clip.
    CHAR = 7,
    NOTE = 6.4;

function wrap(label: string, width: number, char = CHAR) {
    const lines: string[] = [],
        most = Math.max(Math.floor(width / char), 1);
    // A word longer than its line breaks inside the word.
    for (const word of label
        .split(/\s+/)
        .flatMap((w) => w.match(new RegExp(`.{1,${most}}`, 'gu'))!)) {
        const last = lines.at(-1);
        if (last !== undefined && (last.length + 1 + word.length) * char <= width)
            lines[lines.length - 1] = `${last} ${word}`;
        else lines.push(word);
    }
    return lines;
}

function flow(lines: Line[], p: Palette, width: number): Drawing {
    const names: string[] = [],
        focus = new Set<string>(),
        edges: Edge[] = [];
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
    const back = new Set<Edge>(),
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
    const column = width / (Math.max(...rank.values()) + 1);
    if (column < (rows > 1 ? 160 : 120))
        return { items, markup: down({ names, edges, forward, rank, row, rows, focus }, width, p) };
    const noteLines = Math.max(
            0,
            ...edges
                .filter((e) => e.label && row.get(e.b) === 0)
                .map((e) => wrap(e.label, column - 24, NOTE).length),
        ),
        notesAbove = noteLines > 0,
        top = 24 + 16 * noteLines,
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
    // One group per item, in the items' order; `--i` is its place in the sketch's build.
    const groups = names.map((n, k) => {
        const notes = runs
            .filter((r) => r.e.label && r.e.b === n)
            .flatMap((r) => {
                const words = wrap(r.e.label, column - 24, NOTE);
                return words.map((l, i) =>
                    text(
                        (r.from + x(r.e.b)) / 2,
                        y(r.e.b) - 16 * (words.length - i),
                        l,
                        `fill:${p.muted}`,
                        true,
                    ),
                );
            });
        const labels = wrap(n, column - 24).map((l, i) => {
            const baseline = y(n) + (notesAbove ? 28 : 26) + LINE * i;
            bottom = Math.max(bottom, baseline);
            return text(x(n), baseline, l, ink(focus.has(n), p));
        });
        return `<g style="--i:${k}">${notes.join('')}${station(focus.has(n), x(n), y(n), p)}${labels.join('')}</g>`;
    });
    const markup =
        `<svg class="sketch-flow" viewBox="0 0 ${width} ${bottom + (notesAbove ? 10 : 8)}">` +
        paths(runs.map((r) => r.d).join(''), [...chevrons].join(''), p) +
        groups.join('') +
        '</svg>';
    return { items, markup };
}

type Edge = { a: string; b: string; label: string };
type Graph = {
    names: string[];
    edges: Edge[];
    forward: Edge[];
    rank: Map<string, number>;
    row: Map<string, number>;
    rows: number;
    focus: Set<string>;
};
const text = (tx: number, ty: number, words: string, style: string, note = false) =>
    `<text${note ? ' class="sketch-note"' : ''} x="${tx}" y="${ty}" style="${style}">${esc(words)}</text>`;
const station = (focused: boolean, cx: number, cy: number, p: Palette) =>
    focused
        ? `<circle cx="${cx}" cy="${cy}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
const ink = (focused: boolean, p: Palette) =>
    focused ? `fill:${p.focus};font-weight:600` : `fill:${p.ink}`;
const paths = (lines: string, chevrons: string, p: Palette) =>
    `<path class="sketch-line" style="stroke:${p.seam}" d="${lines}"/>` +
    `<path class="sketch-arrow" style="stroke:${p.muted}" d="${chevrons}"/>`;

// Vertical flow: stations in reading order down a line 8px from the left, each row on a lane 24px further right,
// labels beside them from 20px right of the last lane. Mockup Rabbithole-skt.5.
function down({ names, edges, forward, rank, row, rows, focus }: Graph, width: number, p: Palette) {
    const lane = (n: string) => 8 + 24 * row.get(n)!,
        left = 8 + 24 * (rows - 1) + 20,
        room = width - left,
        order = [...names].sort((a, b) => rank.get(a)! - rank.get(b)! || row.get(a)! - row.get(b)!),
        labels = new Map(names.map((n) => [n, wrap(n, room)])),
        notes = new Map(edges.map((e) => [e, e.label ? wrap(e.label, room, NOTE) : []])),
        y = new Map<string, number>();
    // 44px a step, 72px before a rejoin, plus room for the previous label's extra lines and an arrow label.
    order.forEach((n, k) => {
        const into = edges.filter((e) => e.b === n),
            prev = order[k - 1],
            note = Math.max(0, ...into.map((e) => notes.get(e)!.length));
        y.set(
            n,
            k === 0
                ? 12
                : y.get(prev)! +
                      (into.some((e) => lane(e.a) > lane(n)) ? 72 : 44) +
                      LINE * (labels.get(prev)!.length - 1) +
                      (note ? 20 + 16 * (note - 1) : 0),
        );
    });
    const forks = (n: string) => forward.filter((e) => e.a === n).length > 1;
    // A step changing lanes leaves its station 12px down and turns 45 degrees onto the target's lane.
    const runs = edges.map((e) => {
        const [sx, sy, tx, ty] = [lane(e.a), y.get(e.a)!, lane(e.b), y.get(e.b)!];
        if (sx === tx) return { e, d: `M${sx} ${sy}V${ty}`, from: sy + (forks(e.a) ? 12 : 0) };
        const bend = sy + 12 + Math.abs(tx - sx);
        return { e, d: `M${sx} ${sy}V${sy + 12}L${tx} ${bend}V${ty}`, from: bend };
    });
    let bottom = 0,
        right = 0;
    const chevrons: string[] = [],
        groups = names.map((n, k) => {
            const cx = lane(n),
                cy = y.get(n)!,
                // Steps into one station share a chevron, pointing down the run after the last merge.
                into = runs.filter((r) => r.e.b === n && r.from < cy),
                tip = into.length && (Math.max(...into.map((r) => r.from)) + cy) / 2 + 2;
            if (into.length)
                chevrons.push(`M${cx - 5} ${tip - 5}L${cx} ${tip}L${cx + 5} ${tip - 5}`);
            const lines = [
                ...into
                    .flatMap((r) => notes.get(r.e))
                    .map((l, i) => text(left, tip + 2 + 16 * i, l!, `fill:${p.muted}`, true)),
                ...labels.get(n)!.map((l, i) => {
                    bottom = Math.max(bottom, cy + 5 + LINE * i);
                    return text(left, cy + 5 + LINE * i, l, ink(focus.has(n), p));
                }),
            ];
            right = Math.max(
                right,
                ...[...labels.get(n)!, ...into.flatMap((r) => notes.get(r.e)!)].map(
                    (l) => l.length * CHAR,
                ),
            );
            return `<g style="--i:${k}">${station(focus.has(n), cx, cy, p)}${lines.join('')}</g>`;
        });
    // Every station has a label, so the last baseline sets the height.
    const w = Math.min(width, left + right),
        tall = bottom + 7;
    return (
        `<svg class="sketch-flow sketch-down" width="${w}" height="${tall}" viewBox="0 0 ${w} ${tall}">` +
        paths(runs.map((r) => r.d).join(''), chevrons.join(''), p) +
        groups.join('') +
        '</svg>'
    );
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

const KINDS = new Map<string, (lines: Line[], p: Palette, width: number) => Drawing>([
    ['flow', flow],
    ['bars', bars],
]);
