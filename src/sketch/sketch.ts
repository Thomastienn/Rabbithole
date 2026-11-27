// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

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
// `frame` is what a screen reader hears after the title: the names, sets or whole the items belong to.
export type Sketch = { title: string; frame?: string; items: SketchItem[]; markup: string };
type Drawing = { items: SketchItem[]; markup: string; frame?: string } | { error: string };
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
): Sketch | { error: string } {
    const draw = KINDS.get(kind.trim().toLowerCase());
    if (!draw) return { error: `unknown kind "${kind.trim()}"` };
    const lines = body
        .split(/\r\n?|\n/)
        .map((text, i) => ({ text: text.trim(), at: i + 1 }))
        .filter((l) => l.text);
    const title = lines[0] && /^title\s*:/i.test(lines[0].text) ? lines.shift()! : undefined;
    if (!lines.length) return { error: 'empty body' };
    // A head line (compare's `vs:`) names the sides; it is not an item.
    if (lines.filter((l) => !/^vs\s*:/i.test(l.text)).length > 8)
        return { error: 'more than eight items' };
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

function wrap(label: string, width: number, char = CHAR) {
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

// `label: number`, with an optional unit after the number (bars and pie).
type Quantity = { label: string; value: string; number: string; n: number; focus: boolean };
function quantity(line: Line): Quantity | { error: string } {
    const colon = line.text.lastIndexOf(':'),
        label = plain(line.text.slice(0, Math.max(colon, 0))),
        value = plain(line.text.slice(colon + 1)),
        number = /^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?![\d.,])/i.exec(
            value,
        )?.[0];
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

// Compare: `vs: A | B`, then one row per aspect, `aspect: A's value | B's value` (or `aspect | a | b`).
function compare(lines: Line[], p: Palette): Drawing {
    const head = lines.find((l) => /^vs\s*:/i.test(l.text));
    if (!head) return { error: 'no "vs: A | B" line' };
    const names = head.text.replace(/^vs\s*:/i, '').split('|');
    if (names.length !== 2 || names.some((n) => !plain(n)))
        return { error: `${quoted(head)} is not vs: A | B` };
    const rows: string[][] = [];
    for (const line of lines) {
        if (line === head) continue;
        // The tutor sometimes writes `aspect | a | b`: a bar before any colon ends the aspect.
        const bar = line.text.indexOf('|'),
            colon = line.text.indexOf(':'),
            cut = bar >= 0 && (colon < 0 || bar < colon) ? bar : colon,
            cells = [line.text.slice(0, cut), ...line.text.slice(cut + 1).split('|')];
        if (cut < 1 || cells.length !== 3 || cells.some((c) => !plain(c)))
            return { error: `${quoted(line)} is not aspect: A's value | B's value` };
        rows.push(cells);
    }
    if (!rows.length) return { error: 'no aspect lines' };
    const cell = (raw: string, role: 'name' | 'aspect' | 'value') => {
        const f = isFocus(raw),
            color = f ? p.focus : role === 'aspect' ? p.muted : '';
        return (
            `<span${f ? ' class="focus"' : ''}${color ? ` style="color:${color}"` : ''}>${esc(plain(raw))}` +
            (role === 'name' ? `<s style="background:${f ? p.focus : p.seam}"></s>` : '') +
            '</span>'
        );
    };
    const [a, b] = names.map(plain);
    const markup =
        `<div class="sketch-compare" style="color:${p.ink};border-color:${p.hairline}"><span></span>` +
        names.map((n) => cell(n, 'name')).join('') +
        rows.map(([k, x, y]) => cell(k, 'aspect') + cell(x, 'value') + cell(y, 'value')).join('') +
        '</div>';
    const items = rows.map((r) => {
        const [aspect, x, y] = r.map(plain),
            focus = r.some(isFocus);
        return {
            label: aspect,
            focus,
            text: `${aspect}: ${a}, ${x}; ${b}, ${y}${focus ? ', focus' : ''}`,
        };
    });
    return { items, markup, frame: `comparing ${a} and ${b}` };
}

// Venn: two sets `name: item, item` and the items they share, `both: item, item`.
// Rings 160px wide each way and 160px apart, so the overlap is the middle third; they grow taller to fit.
const RX = 160,
    CLEAR = 8,
    ITEM_LINE = 20,
    ITEM_GAP = 6,
    // shortcut: wraps at 8px per character as the mockup does, fits the rings at flow's 7px; measure text if labels clip.
    VENN_CHAR = 8;

function venn(lines: Line[], p: Palette): Drawing {
    const sets: { name: string; focus: boolean; items: string[] }[] = [],
        both: string[] = [];
    for (const line of lines) {
        const colon = line.text.indexOf(':'),
            name = plain(line.text.slice(0, Math.max(colon, 0))),
            items = line.text
                .slice(colon + 1)
                .split(',')
                .filter((i) => plain(i));
        if (colon < 1 || !name) return { error: `${quoted(line)} is not set: item, item` };
        if (/^both$/i.test(name)) both.push(...items);
        else sets.push({ name, focus: isFocus(line.text.slice(0, colon)), items });
    }
    if (sets.length !== 2) return { error: `needs two sets, found ${sets.length}` };
    const [left, right] = sets;
    const stacks = [
        { x: 160, at: 112, rings: [240], items: left.items, where: `${left.name} only` },
        { x: 320, at: 128, rings: [240, 400], items: both, where: 'both' },
        { x: 480, at: 112, rings: [400], items: right.items, where: `${right.name} only` },
    ];
    if (stacks.every((s) => !s.items.length)) return { error: 'no items' };
    // Each stack is centred on the rings' middle; a line's top is measured from it.
    let ry = 80;
    const laid = stacks.map((s) => {
        const blocks = s.items.map((raw) => wrap(plain(raw), s.at, VENN_CHAR));
        let top =
            -(blocks.flat().length * ITEM_LINE + Math.max(blocks.length - 1, 0) * ITEM_GAP) / 2;
        const tops = blocks.map((block) => {
            const at = block.map((_, i) => top + ITEM_LINE * i);
            top += block.length * ITEM_LINE + ITEM_GAP;
            return at;
        });
        // Every line's box stays 8px inside each ring it sits in.
        blocks.forEach((block, i) =>
            block.forEach((words, j) => {
                for (const cx of s.rings)
                    for (const dy of [tops[i][j], tops[i][j] + ITEM_LINE]) {
                        const dx = Math.abs(s.x - cx) + (words.length * CHAR) / 2,
                            room = Math.sqrt(Math.max(0.05, 1 - (dx / (RX - CLEAR)) ** 2));
                        ry = Math.max(ry, CLEAR + Math.abs(dy) / room);
                    }
            }),
        );
        return { ...s, blocks, tops };
    });
    ry = Math.round(ry);
    const names = [left, right].map((s) => wrap(s.name, 224, VENN_CHAR)),
        cy = 16 + 18 * (Math.max(...names.map((n) => n.length)) - 1) + 22 + ry;
    const text = (x: number, y: number, words: string, focus: boolean, note = false) =>
        `<text${note && !focus ? ' class="sketch-note"' : ''} x="${x}" y="${y}" style="fill:${focus ? p.focus : note ? p.muted : p.ink}${focus ? ';font-weight:600' : ''}">${esc(words)}</text>`;
    const markup =
        `<svg class="sketch-venn" viewBox="0 0 ${WIDTH} ${cy + ry + 4}">` +
        [left, right]
            .map(
                (s, i) =>
                    `<ellipse class="sketch-ring" cx="${240 + 160 * i}" cy="${cy}" rx="${RX}" ry="${ry}" style="stroke:${s.focus ? p.focus : p.seam}"/>`,
            )
            .join('') +
        names
            .flatMap((n, i) =>
                n.map((words, j) =>
                    text(160 + 320 * i, 16 + 18 * j, words, [left, right][i].focus, true),
                ),
            )
            .join('') +
        laid
            .flatMap((s) =>
                s.blocks.flatMap((block, i) =>
                    block.map((words, j) =>
                        text(s.x, cy + s.tops[i][j] + 15, words, isFocus(s.items[i])),
                    ),
                ),
            )
            .join('') +
        '</svg>';
    const items = stacks.flatMap((s) =>
        s.items.map((raw) => {
            const label = plain(raw),
                focus = isFocus(raw);
            return { label, focus, text: [label, s.where, ...(focus ? ['focus'] : [])].join(', ') };
        }),
    );
    return { items, markup, frame: `sets ${left.name} and ${right.name}` };
}

// Pie: `label: number`, shares of one whole, clockwise from 12 o'clock in the order written.
function pie(lines: Line[], p: Palette): Drawing {
    const rows: Quantity[] = [];
    for (const line of lines) {
        const row = quantity(line);
        if ('error' in row) return row;
        if (row.n < 0) return { error: `${quoted(line)} is negative` };
        rows.push(row);
    }
    const total = rows.reduce((t, r) => t + r.n, 0);
    if (!total) return { error: 'no share above zero' };
    // Values with no unit (or a %) that sum to 100 are already the shares, shown as written.
    const asWritten =
        rows.every((r) => /^\s*%?$/.test(r.value.slice(r.number.length))) &&
        Math.abs(total - 100) < 1e-6;
    const share = (r: Quantity) =>
        asWritten
            ? `${r.number}%`
            : r.n && r.n / total < 0.01
              ? '<1%'
              : `${Math.round((r.n / total) * 100)}%`;
    const at = (turn: number, r: number) =>
        `${+(88 + r * Math.sin(turn * 2 * Math.PI)).toFixed(1)} ${+(88 - r * Math.cos(turn * 2 * Math.PI)).toFixed(1)}`;
    let from = 0;
    const slices = rows.map((r, i) => {
        const part = r.n / total,
            to = from + Math.min(part, 0.9999),
            big = part > 0.5 ? 1 : 0,
            d = `M${at(from, 80)}A80 80 0 ${big} 1 ${at(to, 80)}L${at(to, 48)}A48 48 0 ${big} 0 ${at(from, 48)}Z`;
        from += part;
        // Slices are told apart by the ground-coloured gap and alternating opacity, never by hue.
        const tone = r.focus ? p.focus : p.seam,
            half = !r.focus && i % 2 ? ';fill-opacity:0.5' : '';
        return r.n
            ? `<path class="sketch-slice" style="fill:${tone};stroke:${p.ground}${half}" d="${d}"/>`
            : '';
    });
    const markup =
        `<div class="sketch-pie"><svg viewBox="0 0 176 176">${slices.join('')}</svg>` +
        `<dl${asWritten ? ' class="as-written"' : ''} style="color:${p.ink}">` +
        rows
            .map((r, i) => {
                const f = r.focus ? ' class="focus"' : '',
                    ink = r.focus ? ` style="color:${p.focus}"` : '';
                return (
                    `<dt${f}${ink}><s style="background:${r.focus ? p.focus : p.seam}${!r.focus && i % 2 ? ';opacity:0.5' : ''}"></s>${esc(r.label)}</dt>` +
                    (asWritten ? '' : `<dd${f}${ink}>${esc(r.value)}</dd>`) +
                    `<dd class="share${r.focus ? ' focus' : ''}" style="color:${p.muted}">${esc(share(r))}</dd>`
                );
            })
            .join('') +
        '</dl></div>';
    const items = rows.map((r) => ({
        label: r.label,
        focus: r.focus,
        text: [
            r.label,
            ...(asWritten ? [] : [r.value]),
            share(r),
            ...(r.focus ? ['focus'] : []),
        ].join(', '),
    }));
    return { items, markup, frame: 'shares of a whole' };
}

const KINDS = new Map([
    ['flow', flow],
    ['bars', bars],
    ['compare', compare],
    ['venn', venn],
    ['pie', pie],
]);
