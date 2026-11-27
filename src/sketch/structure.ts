// Sketch kinds for structure: cycle, stack, tree, timeline and parts (mockup Rabbithole-skt.2).
import {
    esc,
    isFocus,
    LINE,
    plain,
    quoted,
    ROW,
    WIDTH,
    wrap,
    type Drawing,
    type Line,
    type Palette,
    type SketchItem,
} from './sketch.ts';
import { group, ring } from './scales.ts';

// Rings on 3px lines, rows 28px apart.
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
export function cycle(lines: Line[], p: Palette): Drawing {
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
export function stack(lines: Line[], p: Palette): Drawing {
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
export function tree(lines: Line[], p: Palette): Drawing {
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
export function timeline(lines: Line[], p: Palette): Drawing {
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
export function parts(lines: Line[], p: Palette): Drawing {
    const head = /^whole\s*:(.*)$/i.exec(lines[0].text);
    if (!head || !plain(head[1])) return { error: `line ${lines[0].at} is not "whole: name"` };
    if (lines.length < 2) return { error: 'no parts after the whole' };
    const pairs: string[][] = [];
    for (const line of lines.slice(1)) {
        const part = pair(line.text);
        if (!part) return { error: `${quoted(line)} has no ": what it does"` };
        pairs.push(part);
    }
    // shortcut: a whole that wraps to more lines than its parts have rows draws past the top; give it room if tutors write long wholes.
    const whole = head[1].trim(),
        wholes = fit(whole, 192),
        hub = Math.round(Math.max(...wholes.map(width))) + 16,
        bus = hub + 24,
        at = bus + 24,
        name = at + 16,
        names = pairs.map(([n]) => fit(n, 192)),
        note = name + Math.round(Math.max(...names.flat().map(width))) + 16;
    // A name or note too long for its column wraps and pushes the next part down.
    let y = 12;
    const rows = pairs.map(([n, d], i) => {
        const row = { n, d, y, ns: names[i], ds: fit(d, WIDTH - note) };
        y += STEP + LINE * (Math.max(row.ns.length, row.ds.length) - 1);
        return row;
    });
    const ys = rows.map((r) => r.y),
        last = ys.at(-1)!,
        middle = (12 + last) / 2;
    const markup = svg(
        'parts',
        y - STEP + 12,
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
                .map((r, i) =>
                    group(
                        i + 1,
                        ring(at, r.y, isFocus(r.n + r.d), p) +
                            label(name, r.y + 5, r.ns, p, 'start') +
                            label(note, r.y + 5, r.ds, p, 'start', true),
                    ),
                )
                .join(''),
        p,
    );
    const items = [
        item(whole, `${plain(whole)}, made of ${rows.length} part${rows.length > 1 ? 's' : ''}`),
        ...rows.map((r) => item(r.n + r.d, `${plain(r.n)}: ${plain(r.d)}`)),
    ];
    return { items, markup };
}
