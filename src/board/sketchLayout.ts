import type { Op } from './player';
import type { Part } from './layout.ts';
import { EM, r1, rowParts, scaleOf } from './sketchRows.ts';

// Board sketches (docs/board-sketches-spec.md, mockups Rabbithole-bsk.4 and bsk.5): cycle, stack, timeline, parts,
// bars, pie, spectrum and quadrant, laid out
// from their box and every child drawn so far, in board pixels. Stations are 14-radius circles in the board's
// ground, labels 32 and notes 28; past eight children both shrink to 26/32 of that so the pieces still share the box.
type Box = { left: number; top: number; w: number; h: number };
type Parts = Map<string, Part[]>;

const widest = (texts: (string | undefined)[], size: number) =>
    Math.max(0, ...texts.map((text) => (text ?? '').length * EM * size));
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
    look: Extract<Part, { kind: 'line' }>['look'] = 'edge',
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
    if (parent.kind === 'bars') bars(children, box, parts);
    if (parent.kind === 'pie') pie(children, box, parts);
    if (parent.kind === 'spectrum') spectrum(parent, children, box, parts);
    if (parent.kind === 'quadrant') quadrant(parent, children, box, parts);
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

// Bars in rows at most 96 apart, centred in the box: the label at the box's left, the bar 40 past the widest label and
// the value 24 past the bar's end. The largest value so far reaches 220 short of the box's right, so a larger one
// rescales the rest. Bars are 44 high, 36 past eight.
function bars(list: Op[], { left, top, w, h }: Box, parts: Parts) {
    const n = list.length;
    const k = scaleOf(n);
    const row = rows(n, 96, h, top + h / 2);
    const x = r1(
        left +
            widest(
                list.map((b) => b.text),
                32 * k,
            ) +
            40,
    );
    const full = left + w - 220 - x;
    const most = Math.max(...list.map((b) => b.value ?? 0)) || 1;
    const bh = n > 8 ? 36 : 44;
    list.forEach((b, i) => {
        const y = row(i);
        const len = r1((full * (b.value ?? 0)) / most);
        const said = `${b.value ?? ''}${b.unit ? ` ${b.unit}` : ''}`;
        parts.set(b.id, [
            text('label', left, y + 11 * k, b.text ?? '', 32 * k, [0, 1 / 3], 'start'),
            {
                key: 'bar',
                t: [1 / 3, 2 / 3],
                kind: 'box',
                x,
                y: r1(y - bh / 2),
                w: len,
                h: bh,
                rx: bh / 2,
            },
            text('value', r1(x + len + 24), y + 11 * k, said, 32 * k, [2 / 3, 1], 'start'),
        ]);
    });
}

// A ring 20 inside the box's left and 36 inside its top and bottom, its hole 0.55 across. Slices sweep clockwise from
// the top in the order given, each its value's share of the slices so far, their fills alternating. The legend sits
// 110 right of the ring in rows at most 80 apart: a 36 swatch, the label 60 past it, the share 32 past the widest label.
function pie(list: Op[], { left, top, w, h }: Box, parts: Parts) {
    const n = list.length;
    const k = scaleOf(n);
    const labels = widest(
        list.map((s) => s.text),
        32 * k,
    );
    // The ring shrinks in a narrow box so the legend (swatch, label, a "100%" share) still ends inside it.
    const R = r1(Math.min(h / 2 - 36, (w - 130 - (60 + labels + 32 + 4 * EM * 28 * k)) / 2));
    const r = r1(R * 0.55);
    const [cx, cy] = [left + 20 + R, top + h / 2];
    const total = list.reduce((sum, s) => sum + (s.value ?? 0), 0) || 1;
    const on = (a: number, rad: number) =>
        `${r1(cx + rad * Math.sin(a))} ${r1(cy - rad * Math.cos(a))}`;
    const ring = (rad: number, sweep: 0 | 1) =>
        `M${r1(cx - rad)} ${cy}A${rad} ${rad} 0 1 ${sweep} ${r1(cx + rad)} ${cy}` +
        `A${rad} ${rad} 0 1 ${sweep} ${r1(cx - rad)} ${cy}Z`;
    const row = rows(n, 80, h, cy);
    const sx = r1(cx + R + 110);
    const labelX = sx + 60;
    const shareX = r1(labelX + labels + 32);
    let from = 0;
    list.forEach((s, i) => {
        const share = (s.value ?? 0) / total;
        const to = from + share * 2 * Math.PI;
        const big = to - from > Math.PI ? 1 : 0;
        const d =
            share >= 1
                ? ring(R, 1) + ring(r, 0)
                : `M${on(from, R)}A${R} ${R} 0 ${big} 1 ${on(to, R)}L${on(to, r)}` +
                  `A${r} ${r} 0 ${big} 0 ${on(from, r)}Z`;
        from = to;
        const look = i % 2 ? 'slice-alt' : 'slice';
        const y = row(i);
        const size = r1(36 * k);
        parts.set(s.id, [
            edge('slice', d, [0, 0.5], look),
            {
                key: 'swatch',
                t: [0.5, 0.65],
                kind: 'box',
                x: sx,
                y: r1(y - size / 2),
                w: size,
                h: size,
                rx: 8,
                look,
            },
            text('label', labelX, y + 11 * k, s.text ?? '', 32 * k, [0.65, 0.85], 'start'),
            text(
                'share',
                shareX,
                y + 10 * k,
                `${Math.round(share * 100)}%`,
                28 * k,
                [0.85, 1],
                'start',
                true,
            ),
        ]);
    });
}

// A line across the box 100 below its top, its ends written 40 above it at either end. Places share the line in equal
// slots in the order given: a station on the line, the name 64 below it and the note 40 under that. From five places
// every second one drops 126 to a lower row on a leader, so names never collide.
function spectrum(p: Op, list: Op[], { left, top, w }: Box, parts: Parts) {
    const n = list.length;
    const k = scaleOf(n);
    const y = top + 100;
    const [low, high] = p.ends ?? [];
    parts.set(p.id, [
        edge('line', `M${left} ${y}H${left + w}`, [0, 0.6]),
        text('low', left, y - 40, low ?? '', 28, [0.6, 1], 'start', true),
        text('high', left + w, y - 40, high ?? '', 28, [0.6, 1], 'end', true),
    ]);
    list.forEach((place, i) => {
        const x = r1(left + (w * (i + 0.5)) / n);
        const lower = n >= 5 && i % 2 === 1;
        const nameY = y + 64 * k + (lower ? 126 : 0);
        const at = lower ? 0.2 : 0;
        parts.set(place.id, [
            ...(lower
                ? [edge('leader', `M${x} ${y + 22}V${r1(nameY - 40 * k)}`, [0, at], 'leader')]
                : []),
            station(x, y, r1(14 * k), [at, 0.4]),
            text('name', x, nameY, place.text ?? '', 32 * k, [0.4, place.note ? 0.75 : 1]),
            ...(place.note
                ? [text('note', x, nameY + 40 * k, place.note, 28 * k, [0.75, 1], undefined, true)]
                : []),
        ]);
    });
}

// Two axes crossing at the box's middle, 200 inside its sides and 60 inside its top and bottom, with arrowheads at the
// high ends and the end names 24 past each end (44 below the bottom). A spot sits at its X,Y from 0 to 10, its label
// 30 to its right, or to its left past 7 across; spots never move. A spot where an earlier one is shares its station,
// its label 44 below.
function quadrant(p: Op, list: Op[], { left, top, w, h }: Box, parts: Parts) {
    const k = scaleOf(list.length);
    const [x0, x1, y0, y1] = [left + 200, left + w - 200, top + 60, top + h - 60];
    const [cx, cy] = [left + w / 2, top + h / 2];
    const [xlo, xhi, ylo, yhi] = p.ends ?? [];
    parts.set(p.id, [
        edge(
            'axes',
            `M${x0} ${cy}H${x1}M${cx} ${y1}V${y0}` +
                `M${x1 - 16} ${cy + 16}L${x1} ${cy}L${x1 - 16} ${cy - 16}` +
                `M${cx + 16} ${y0 + 16}L${cx} ${y0}L${cx - 16} ${y0 + 16}`,
            [0, 0.6],
        ),
        text('xlo', x0 - 24, cy + 10, xlo ?? '', 28, [0.6, 1], 'end', true),
        text('xhi', x1 + 24, cy + 10, xhi ?? '', 28, [0.6, 1], 'start', true),
        text('yhi', cx, y0 - 24, yhi ?? '', 28, [0.6, 1], undefined, true),
        text('ylo', cx, y1 + 44, ylo ?? '', 28, [0.6, 1], undefined, true),
    ]);
    list.forEach((spot, i) => {
        const [X, Y] = spot.xy ?? [0, 0];
        const x = r1(x0 + ((x1 - x0) * X) / 10);
        const y = r1(y1 - ((y1 - y0) * Y) / 10);
        const twin = list.slice(0, i).filter((o) => o.xy?.[0] === X && o.xy?.[1] === Y).length;
        const leftward = X > 7;
        parts.set(spot.id, [
            ...(twin ? [] : [station(x, y, r1(14 * k), [0, 0.4])]),
            text(
                'label',
                leftward ? x - 30 : x + 30,
                y + 11 * k + 44 * twin,
                spot.text ?? '',
                32 * k,
                [twin ? 0 : 0.4, 1],
                leftward ? 'end' : 'start',
            ),
        ]);
    });
}
