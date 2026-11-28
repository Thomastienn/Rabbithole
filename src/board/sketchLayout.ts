import type { Op } from './player';
import type { Part } from './layout.ts';
import { rowParts } from './sketchRows.ts';

// Board sketches (docs/board-sketches-spec.md, mockup Rabbithole-bsk.4): cycle, stack, timeline and parts, laid out
// from their box and every child drawn so far, in board pixels. Stations are 14-radius circles in the board's
// ground, labels 32 and notes 28; past eight children both shrink to 26/32 of that so the pieces still share the box.
type Box = { left: number; top: number; w: number; h: number };
type Parts = Map<string, Part[]>;

// A character is about 0.52 of its font size wide.
const EM = 0.52;
const r1 = (v: number) => Math.round(v * 10) / 10;
const widest = (texts: (string | undefined)[], size: number) =>
    Math.max(0, ...texts.map((text) => (text ?? '').length * EM * size));
const scaleOf = (n: number) => (n > 8 ? 26 / 32 : 1);
const station = (x: number, y: number, r: number, t: [number, number]): Part => ({
    key: 'station',
    t,
    kind: 'circle',
    look: 'station',
    x,
    y,
    r,
});
const edge = (
    key: string,
    d: string,
    t: [number, number],
    look: 'edge' | 'rule' = 'edge',
): Part => ({
    key,
    t,
    kind: 'line',
    look,
    d,
});
const text = (
    key: string,
    x: number,
    y: number,
    words: string,
    size: number,
    t: [number, number],
    anchor?: 'start' | 'end',
    note?: boolean,
): Part => ({
    key,
    t,
    kind: 'text',
    x,
    y: Math.round(y),
    text: words,
    size: r1(size),
    anchor,
    look: note ? 'note' : undefined,
});
// Rows share the box's height, at most `most` apart, as a block centred on `cy`.
const rows = (n: number, most: number, h: number, cy: number) => {
    const gap = Math.min(most, h / n);
    return (i: number) => r1(cy + gap * (i - (n - 1) / 2));
};

export function sketchParts(parent: Op, children: Op[], box: Box, parts: Parts) {
    if (parent.kind === 'cycle') cycle(parent, children, box, parts);
    if (parent.kind === 'stack') stack(children, box, parts);
    if (parent.kind === 'timeline') timeline(children, box, parts);
    if (parent.kind === 'parts') whole(parent, children, box, parts);
    rowParts(parent, children, box, parts);
}

// A rounded loop 40 inside the box's sides, its top run 50 below the top and its bottom run 90 above the bottom. The
// top run holds the first half of the stages, rounded up, left to right; the bottom run the rest, right to left. A
// chevron sits midway between each stage and the one before, or midway down the side where the loop turns.
function cycle(c: Op, stages: Op[], { left, top, w, h }: Box, parts: Parts) {
    const n = stages.length;
    const k = scaleOf(n);
    const [x0, x1, yt, yb] = [left + 40, left + w - 40, top + 50, top + h - 90];
    const mid = (yt + yb) / 2;
    const R = 48;
    if (n > 1)
        parts.set(c.id, [
            edge(
                'loop',
                `M${x0 + R} ${yt}H${x1 - R}A${R} ${R} 0 0 1 ${x1} ${yt + R}V${yb - R}` +
                    `A${R} ${R} 0 0 1 ${x1 - R} ${yb}H${x0 + R}A${R} ${R} 0 0 1 ${x0} ${yb - R}` +
                    `V${yt + R}A${R} ${R} 0 0 1 ${x0 + R} ${yt}Z`,
                [0, 1],
            ),
        ]);
    const upper = Math.ceil(n / 2);
    const spot = (i: number): [number, number] =>
        i < upper
            ? [r1(x0 + ((x1 - x0) * (i + 0.5)) / upper), yt]
            : [r1(x1 - ((x1 - x0) * (i - upper + 0.5)) / (n - upper)), yb];
    // Chevron arms are 16 long; each points the way the loop runs.
    const right = (x: number, y: number) => `M${x - 8} ${y + 16}L${x + 8} ${y}L${x - 8} ${y - 16}`;
    const leftward = (x: number, y: number) =>
        `M${x + 8} ${y - 16}L${x - 8} ${y}L${x + 8} ${y + 16}`;
    const down = `M${x1 - 16} ${mid - 8}L${x1} ${mid + 8}L${x1 + 16} ${mid - 8}`;
    const up = `M${x0 + 16} ${mid + 8}L${x0} ${mid - 8}L${x0 - 16} ${mid + 8}`;
    const chevron = (i: number) => {
        const between = r1((spot(i - 1)[0] + spot(i)[0]) / 2);
        if (i < upper) return right(between, yt);
        return i === upper ? down : leftward(between, yb);
    };
    const r = r1(14 * k);
    stages.forEach((stage, i) => {
        const [x, y] = spot(i);
        const at = i ? 1 / 3 : 0;
        parts.set(stage.id, [
            ...(i ? [edge('chevron', chevron(i), [0, at])] : []),
            station(x, y, r, [at, at + (1 - at) * 0.4]),
            text('label', x, y + 55 * k, stage.text ?? '', 32 * k, [at + (1 - at) * 0.4, 1]),
            // The last stage leads back to the first.
            ...(n > 1 && i === n - 1 ? [edge('close', up, [at + (1 - at) * 0.4, 1])] : []),
        ]);
    });
}

// Layers top first in equal rows, at most 100 apart: the name at the box's left, the note in a column 48 past the
// widest name, and a shelf across the box 6 above the row's bottom.
function stack(layers: Op[], { left, top, w, h }: Box, parts: Parts) {
    const n = layers.length;
    const k = scaleOf(n);
    const gap = Math.min(100, h / n);
    const row = rows(n, 100, h, top + h / 2);
    const noteX = r1(
        left +
            widest(
                layers.map((l) => l.text),
                32 * k,
            ) +
            48,
    );
    layers.forEach((layer, i) => {
        // Text sits midway between the row's top and its shelf.
        const mid = row(i) - 3;
        parts.set(layer.id, [
            text('name', left, mid + 10 * k, layer.text ?? '', 32 * k, [0, 0.4], 'start'),
            ...(layer.note
                ? [
                      text(
                          'note',
                          noteX,
                          mid + 8.75 * k,
                          layer.note,
                          28 * k,
                          [0.4, 0.8],
                          'start',
                          true,
                      ),
                  ]
                : []),
            edge('shelf', `M${left} ${r1(row(i) + gap / 2 - 6)}H${left + w}`, [0.8, 1], 'rule'),
        ]);
    });
}

// Events down one line in the order given, in rows at most 110 apart. The line runs 40 right of the widest date;
// dates end and labels start 24 from the station's edge. Each event draws the line down from the one before.
function timeline(events: Op[], { left, top, h }: Box, parts: Parts) {
    const n = events.length;
    const k = scaleOf(n);
    const r = r1(14 * k);
    const row = rows(n, 110, h, top + h / 2);
    const x = r1(
        left +
            widest(
                events.map((e) => e.when),
                32 * k,
            ) +
            40,
    );
    events.forEach((event, i) => {
        const y = row(i);
        const at = i ? 1 / 3 : 0;
        const writes = at + (1 - at) * 0.4;
        parts.set(event.id, [
            ...(i ? [edge('line', `M${x} ${r1(row(i - 1) + r)}V${r1(y - r)}`, [0, at])] : []),
            station(x, y, r, [at, writes]),
            text('when', r1(x - r - 24), y + 11 * k, event.when ?? '', 32 * k, [writes, 1], 'end'),
            text(
                'label',
                r1(x + r + 24),
                y + 11 * k,
                event.text ?? '',
                32 * k,
                [writes, 1],
                'start',
            ),
        ]);
    });
}

// The whole's station 40 past its name at the box's middle, a bus 80 right of it and each part's station 80 right of
// the bus, in rows at most 110 apart centred on the whole. Names start 24 past a part's station, notes 40 past the
// widest name. The first part draws the stub and the bus; each later one lengthens the bus.
function whole(p: Op, list: Op[], { left, top, h }: Box, parts: Parts) {
    const n = list.length;
    const k = scaleOf(n);
    const r = r1(14 * k);
    const cy = top + h / 2;
    const name = p.whole ?? '';
    const wx = r1(left + widest([name], 32) + 40);
    const bus = r1(wx + 80);
    const px = r1(bus + 80);
    const nameX = r1(px + r + 24);
    const noteX = r1(
        nameX +
            widest(
                list.map((part) => part.text),
                32 * k,
            ) +
            40,
    );
    const row = rows(n, 110, h, cy);
    parts.set(p.id, [
        station(wx, cy, 14, [0, 0.4]),
        text('whole', r1(wx - 38), cy + 11, name, 32, [0.4, 1], 'end'),
    ]);
    list.forEach((part, i) => {
        const y = row(i);
        const at = i ? 0 : 0.2;
        parts.set(part.id, [
            ...(i
                ? []
                : [
                      edge('bus', `M${r1(wx + 14)} ${cy}H${bus}M${bus} ${row(0)}V${row(n - 1)}`, [
                          0,
                          at,
                      ]),
                  ]),
            edge('branch', `M${bus} ${y}H${r1(px - r)}`, [at, 0.35]),
            station(px, y, r, [0.35, 0.5]),
            text(
                'name',
                nameX,
                y + 11 * k,
                part.text ?? '',
                32 * k,
                [0.5, part.note ? 0.8 : 1],
                'start',
            ),
            ...(part.note
                ? [text('note', noteX, y + 10 * k, part.note, 28 * k, [0.8, 1], 'start', true)]
                : []),
        ]);
    });
}
