// Sketches: small diagrams the tutor writes as ```sketch <kind> blocks (ADR 0027).
// The only place that knows the kinds. Plain: no React, no DOM, no model call.

// The theme colours by role; the app passes CSS variables, tests pass hex values.
export type Palette = { ground: string; ink: string; muted: string; seam: string; focus: string };
// One per drawn element. `text` is what a screen reader hears for it.
// `level` nests a tree's items for a screen reader; other kinds leave it out.
export type SketchItem = { label: string; focus: boolean; text: string; level?: number };
export type Sketch = { title: string; items: SketchItem[]; markup: string };
type Drawing = { items: SketchItem[]; markup: string } | { error: string };
type Line = { text: string; at: number; indent: number };

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
        .map((text, i) => ({
            text: text.trim(),
            at: i + 1,
            indent: /^\s*/.exec(text)![0].replace(/\t/g, '  ').length,
        }))
        .filter((l) => l.text);
    const title = lines[0] && /^title\s*:/i.test(lines[0].text) ? lines.shift()! : undefined;
    if (!lines.length) return { error: 'empty body' };
    if (lines.length > 8) return { error: 'more than eight items' };
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

function wrap(label: string, width: number, measure = (s: string) => s.length * CHAR) {
    const lines: string[] = [];
    for (const word of label.split(/\s+/)) {
        const last = lines.at(-1);
        if (last !== undefined && measure(`${last} ${word}`) <= width)
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
        const station = ring(x(n), y(n), f, p);
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

// The structure kinds (mockup Rabbithole-skt.2): rings on 3px lines, rows 28px apart.
const STEP = 28;
// Advance widths of printable ASCII in the 14px reading face, in tenths of a pixel.
const ADVANCE =
    '39,40,42,91,83,129,102,22,42,42,68,85,29,51,29,54,91,57,77,81,86,82,84,71,86,83,29,29,77,88,77,67,109,88,86,90,94,80,77,97,97,55,72,88,76,115,97,100,83,101,86,83,78,97,83,120,87,80,85,44,54,48,77,52,34,73,79,68,79,75,44,78,77,35,34,69,37,118,77,77,79,80,49,66,46,76,65,96,67,63,64,48,33,48,78'
        .split(',')
        .map(Number);
// shortcut: widths come from a weight-400 table, focus words 5% wider and other characters 7px; measure in the DOM if labels clip.
const width = (raw: string) =>
    raw
        .split(/\*([^*]+)\*/)
        .reduce(
            (sum, part, i) =>
                sum +
                [...part.replace(/\*/g, '')].reduce(
                    (w, c) => w + (ADVANCE[c.charCodeAt(0) - 32] ?? 70) / 10,
                    0,
                ) *
                    (i % 2 ? 1.05 : 1),
            0,
        );
// A label wrapped to a width in as few, evenly long lines as fit, each starred run split per word so
// its focus survives a line break.
function fit(raw: string, w: number) {
    const words = raw.replace(/\*([^*]+)\*/g, (_, run: string) =>
        run
            .trim()
            .split(/\s+/)
            .map((word) => `*${word}*`)
            .join(' '),
    );
    let lines = wrap(words, w, width);
    for (let narrower = w - 4; lines.length > 1 && narrower > 0; narrower -= 4) {
        const next = wrap(words, narrower, width);
        if (next.length > lines.length) break;
        lines = next;
    }
    return lines;
}
// A label's text with only its starred words in the focus colour at weight 600.
const rich = (raw: string, p: Palette, tag = 'tspan') =>
    raw
        .replace(/\* \*/g, ' ')
        .split(/\*([^*]+)\*/)
        .map((part, i) =>
            i % 2
                ? `<${tag} style="${tag === 'tspan' ? 'fill' : 'color'}:${p.focus};font-weight:600">${esc(part)}</${tag}>`
                : esc(part.replace(/\*/g, '')),
        )
        .join('');
const label = (x: number, y: number, words: string[], p: Palette, anchor: string, note = false) =>
    words
        .map(
            (line, i) =>
                `<text${note ? ' class="sketch-note"' : ''} x="${x}" y="${y + LINE * i}" style="fill:${note ? p.muted : p.ink};text-anchor:${anchor}">${rich(line, p)}</text>`,
        )
        .join('');
const ring = (x: number, y: number, focus: boolean, p: Palette) =>
    focus
        ? `<circle cx="${x}" cy="${y}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
        : `<circle cx="${x}" cy="${y}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
// One item's elements; `--i` is its place in the sketch's build.
const group = (k: number, body: string) => `<g style="--i:${k}">${body}</g>`;
const svg = (kind: string, height: number, d: string, body: string, p: Palette) =>
    `<svg class="sketch-${kind}" viewBox="0 0 ${WIDTH} ${height}">` +
    `<path class="sketch-line" style="stroke:${p.seam}" d="${d}"/>${body}</svg>`;
const item = (raw: string, text: string, level?: number): SketchItem => ({
    label: plain(raw),
    focus: isFocus(raw),
    text: isFocus(raw) ? `${text}, focus` : text,
    ...(level === undefined ? {} : { level }),
});
// `left: right` at the first colon not followed by a digit, so a time like 10:30 stays whole.
const pair = (text: string) => {
    const m = /^(.*?):(?!\d)(.*)$/.exec(text);
    return m && plain(m[1]) && plain(m[2]) ? [m[1].trim(), m[2].trim()] : undefined;
};

// Cycle: a loop with two rows 84px apart, the first half of the stages along the top, the rest back along the bottom.
function cycle(lines: Line[], p: Palette): Drawing {
    const n = lines.length,
        top = Math.ceil(n / 2);
    if (n < 2) return { error: '1 stage; a cycle needs at least 2' };
    const stages = lines.map((line, i) => {
        const row = i < top ? 0 : 1,
            column = WIDTH / (row ? n - top : top),
            k = row ? i - top : i;
        return {
            raw: line.text,
            row,
            x: row ? WIDTH - column * (k + 0.5) : column * (k + 0.5),
            words: fit(line.text, column - 48),
        };
    });
    // Top labels sit inside the loop; past three lines each pushes the bottom row down.
    const deep = Math.max(...stages.filter((s) => !s.row).map((s) => s.words.length)),
        ys = [24, ROW + 24 + LINE * Math.max(0, deep - 3)],
        [y0, y1] = ys,
        mid = (y0 + y1) / 2;
    const chevrons = stages.map((s, i) => {
        const t = stages[(i + 1) % n],
            way = s.row ? -1 : 1;
        if (s.row === t.row) {
            const tip = (s.x + t.x) / 2 + 2 * way,
                y = ys[s.row];
            return `M${tip - 5 * way} ${y - 5}L${tip} ${y}L${tip - 5 * way} ${y + 5}`;
        }
        const x = s.row ? 16 : WIDTH - 16,
            tip = mid + 2 * way;
        return `M${x - 5} ${tip - 5 * way}L${x} ${tip}L${x + 5} ${tip - 5 * way}`;
    });
    const bottom = Math.max(...stages.map((s) => ys[s.row] + 26 + LINE * (s.words.length - 1)));
    const markup = svg(
        'cycle',
        bottom + 10,
        `M32 ${y0}H${WIDTH - 32}L${WIDTH - 16} ${y0 + 16}V${y1 - 16}L${WIDTH - 32} ${y1}H32L16 ${y1 - 16}V${y0 + 16}Z`,
        `<path class="sketch-arrow" style="stroke:${p.muted}" d="${chevrons.join('')}"/>` +
            stages
                .map((s, k) =>
                    group(
                        k,
                        ring(s.x, ys[s.row], isFocus(s.raw), p) +
                            label(s.x, ys[s.row] + 26, s.words, p, 'middle'),
                    ),
                )
                .join(''),
        p,
    );
    const items = stages.map((s, i) =>
        item(
            s.raw,
            `${plain(s.raw)}, leads ${i + 1 < n ? '' : 'back '}to ${plain(stages[(i + 1) % n].raw)}`,
        ),
    );
    return { items, markup };
}

// Stack: one layer per line, top first, `name: note`, each on its own shelf.
function stack(lines: Line[], p: Palette): Drawing {
    const layers: string[][] = [];
    for (const line of lines) {
        const layer = pair(line.text);
        if (!layer) return { error: `${quoted(line)} has no ": note"` };
        layers.push(layer);
    }
    const markup =
        `<ol class="sketch-stack" style="color:${p.ink}">` +
        layers
            .map(
                ([name, note], k) =>
                    `<li style="--i:${k};--shelf:${isFocus(name + note) ? p.focus : p.seam}"><b>${rich(name, p, 'strong')}</b>` +
                    `<span style="color:${p.muted}">${rich(note, p, 'strong')}</span></li>`,
            )
            .join('') +
        '</ol>';
    const items = layers.map(([name, note], i) =>
        item(
            name + note,
            `${plain(name)}${i === 0 ? ', top layer' : i === layers.length - 1 ? ', bottom layer' : ''}: ${plain(note)}`,
        ),
    );
    return { items, markup };
}

// Tree: an indented outline, two spaces per level, each child branching off its parent's line at 45 degrees.
function tree(lines: Line[], p: Palette): Drawing {
    // A line nests one level below the nearest line above it with a smaller depth, as the outline reads.
    const open: number[] = [];
    let y = 12;
    const rows = lines.map((line) => {
        const depth = Math.floor(line.indent / 2);
        while (open.length && open.at(-1)! >= depth) open.pop();
        const level = open.push(depth) - 1,
            x = 10 + 24 * level,
            words = fit(line.text, WIDTH - x - 16),
            row = { raw: line.text, level, x, y, words };
        y += STEP + LINE * (words.length - 1);
        return row;
    });
    const d = rows
        .flatMap((r, i) => {
            const kids = [];
            for (const k of rows.slice(i + 1)) {
                if (k.level <= r.level) break;
                if (k.level === r.level + 1) kids.push(k);
            }
            return kids.length
                ? [
                      `M${r.x} ${r.y}V${kids.at(-1)!.y - 24}`,
                      ...kids.map((k) => `M${r.x} ${k.y - 24}L${k.x} ${k.y}`),
                  ]
                : [];
        })
        .join('');
    const last = rows.at(-1)!;
    const markup = svg(
        'tree',
        last.y + 12 + LINE * (last.words.length - 1),
        d,
        rows
            .map((r, k) =>
                group(
                    k,
                    ring(r.x, r.y, isFocus(r.raw), p) +
                        label(r.x + 16, r.y + 5, r.words, p, 'start'),
                ),
            )
            .join(''),
        p,
    );
    return { items: rows.map((r) => item(r.raw, plain(r.raw), r.level)), markup };
}

// Timeline: `when: event` down one straight line, in the order written; the app never sorts or spaces by date.
function timeline(lines: Line[], p: Palette): Drawing {
    const events: string[][] = [];
    for (const line of lines) {
        const event = pair(line.text);
        if (!event) return { error: `${quoted(line)} has no "when:"` };
        events.push(event);
    }
    const when = Math.min(192, Math.max(...events.map(([w]) => width(w)))),
        x = Math.round(when) + 18;
    let y = 12;
    const rows = events.map(([w, e]) => {
        const row = { w, e, y, ws: fit(w, when), es: fit(e, WIDTH - x - 18) };
        y += STEP + LINE * (Math.max(row.ws.length, row.es.length) - 1);
        return row;
    });
    const last = rows.at(-1)!;
    const markup = svg(
        'timeline',
        last.y + 12 + LINE * (Math.max(last.ws.length, last.es.length) - 1),
        `M${x} 12V${last.y}`,
        rows
            .map((r, k) =>
                group(
                    k,
                    ring(x, r.y, isFocus(r.w + r.e), p) +
                        label(x - 18, r.y + 5, r.ws, p, 'end') +
                        label(x + 18, r.y + 5, r.es, p, 'start'),
                ),
            )
            .join(''),
        p,
    );
    return { items: rows.map((r) => item(r.w + r.e, `${plain(r.w)}: ${plain(r.e)}`)), markup };
}

// Parts: the whole on the left, its line into a bus that each part leaves at 90 degrees.
function parts(lines: Line[], p: Palette): Drawing {
    const head = /^whole\s*:(.*)$/i.exec(lines[0].text);
    if (!head || !plain(head[1])) return { error: `line ${lines[0].at} is not "whole: name"` };
    if (lines.length < 2) return { error: 'no parts after the whole' };
    const rows: string[][] = [];
    for (const line of lines.slice(1)) {
        const part = pair(line.text);
        if (!part) return { error: `${quoted(line)} has no ": what it does"` };
        rows.push(part);
    }
    // shortcut: a whole that wraps to more lines than its parts have rows draws past the top; give it room if tutors write long wholes.
    const whole = head[1].trim(),
        wholes = fit(whole, 192),
        hub = Math.round(Math.max(...wholes.map(width))) + 16,
        bus = hub + 24,
        at = bus + 24,
        name = at + 16,
        note = name + Math.round(Math.max(...rows.map(([n]) => width(n)))) + 16,
        ys = rows.map((_, i) => 12 + STEP * i),
        last = ys.at(-1)!,
        middle = (12 + last) / 2;
    const markup = svg(
        'parts',
        last + 12,
        `M${at} 12H${bus}V${last}H${at}` +
            ys
                .slice(1, -1)
                .map((y) => `M${bus} ${y}H${at}`)
                .join('') +
            `M${hub} ${middle}H${bus}`,
        group(
            0,
            ring(hub, middle, isFocus(whole), p) +
                label(hub - 16, middle + 5 - (LINE * (wholes.length - 1)) / 2, wholes, p, 'end'),
        ) +
            rows
                .map(([n, d], i) =>
                    group(
                        i + 1,
                        ring(at, ys[i], isFocus(n + d), p) +
                            label(name, ys[i] + 5, [n], p, 'start') +
                            label(note, ys[i] + 5, [d], p, 'start', true),
                    ),
                )
                .join(''),
        p,
    );
    const items = [
        item(whole, `${plain(whole)}, made of ${rows.length} part${rows.length > 1 ? 's' : ''}`),
        ...rows.map(([n, d]) => item(n + d, `${plain(n)}: ${plain(d)}`)),
    ];
    return { items, markup };
}

const KINDS = new Map([
    ['flow', flow],
    ['bars', bars],
    ['cycle', cycle],
    ['stack', stack],
    ['tree', tree],
    ['timeline', timeline],
    ['parts', parts],
]);
