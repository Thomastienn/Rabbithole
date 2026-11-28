import type { Op } from './player';
import { sketchParts } from './sketchLayout.ts';

// The drawn parts of flows, trees, tables and Venn diagrams (mockup Rabbithole-brd.6), and of sketches
// (src/board/sketchLayout.ts), in board pixels. A child is
// laid out from its component's box and every sibling drawn so far, so a later one reflows the earlier ones; each
// part keeps its key, and the board slides it to its new place (src/styles/board-items.css). `t` is the share of the
// item's entry the part draws in, as [from, to].
export type Part = { key: string; t: [number, number] } & (
    | {
          kind: 'box';
          x: number;
          y: number;
          w: number;
          h: number;
          rx?: number;
          look?: 'slice' | 'slice-alt';
      }
    | {
          kind: 'line';
          d: string;
          look: 'edge' | 'rule' | 'seam' | 'gap' | 'leader' | 'slice' | 'slice-alt';
      }
    | { kind: 'circle'; x: number; y: number; r: number; look?: 'station' }
    | {
          kind: 'text';
          x: number;
          y: number;
          text: string;
          look?: 'head' | 'set' | 'sm' | 'note' | 'name' | 'math' | 'mathop';
          anchor?: 'start' | 'end';
          // Font size in board pixels, when the look's own size does not apply.
          size?: number;
      }
);

// Child text is 32 board pixels; a character is about 0.59 of that wide.
const charWidth = 18.75;
// Text baselines sit this far below the centre of the line they are on.
const BASELINE = 12;
const arrow = (x0: number, y0: number, x1: number, y1: number) =>
    y0 === y1
        ? `M${x0} ${y0}H${x1}M${x1 - 14} ${y1 - 14}L${x1} ${y1}L${x1 - 14} ${y1 + 14}`
        : `M${x0} ${y0}V${y1}M${x1 - 14} ${y1 - 14}L${x1} ${y1}L${x1 + 14} ${y1 - 14}`;
const r1 = (v: number) => Math.round(v * 10) / 10;

// Every flow, tree, table, Venn and sketch component's parts and its children's, by item id.
// Children in `gone` (erased, still fading) keep their place; the rest reflow without them.
export function componentParts(
    ops: Op[],
    gone: { has(id: string): boolean; size: number } = new Set(),
) {
    const parts = lay(ops);
    return gone.size ? new Map([...parts, ...lay(ops.filter((op) => !gone.has(op.id)))]) : parts;
}

function lay(ops: Op[]) {
    const parts = new Map<string, Part[]>();
    for (const parent of ops) {
        const children = ops.filter((op) => op.on === parent.id);
        const [cx, cy] = parent.at ?? [0, 0];
        const [w, h] = [parent.w ?? 0, parent.h ?? 0];
        const [left, top] = [cx - w / 2, cy - h / 2];
        if (parent.kind === 'flow') flow(parent, children, left, top, w, h, parts);
        if (parent.kind === 'tree') tree(children, left, top, w, h, parts);
        if (parent.kind === 'table') table(parent, children, left, top, w, h, parts);
        if (parent.kind === 'venn') venn(parent, children, cx, cy, w, h, parts);
        sketchParts(parent, children, { left, top, w, h }, parts);
    }
    return parts;
}

// The space a child's boxes, circles and text take, for the pointer and the pen; lines are left out.
// Text is measured at about 0.52 of its size per character, from 0.75 of its size above its baseline to 0.25 below.
export function partsBox(parts: Part[] = []) {
    const boxes = parts.flatMap((p): [number, number, number, number][] => {
        if (p.kind === 'box') return [[p.x, p.y, p.x + p.w, p.y + p.h]];
        if (p.kind === 'circle') return [[p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r]];
        if (p.kind === 'line') return [];
        const size = p.size ?? (p.look === 'head' ? 28 : p.look === 'sm' ? 30 : 32);
        const w = p.text.length * 0.52 * size;
        const x = p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2;
        return [[x, p.y - 0.75 * size, x + w, p.y + 0.25 * size]];
    });
    if (!boxes.length) return undefined;
    const [x0, y0] = [0, 1].map((i) => Math.min(...boxes.map((b) => b[i])));
    const [x1, y1] = [2, 3].map((i) => Math.max(...boxes.map((b) => b[i])));
    return {
        c: [r1((x0 + x1) / 2), r1((y0 + y1) / 2)] as [number, number],
        w: r1(x1 - x0),
        h: r1(y1 - y0),
    };
}

// Steps share the box in equal columns (or rows, down), each box at most 260 wide; an arrow joins each step to
// the one before, 16 short of both.
function flow(
    f: Op,
    steps: Op[],
    left: number,
    top: number,
    w: number,
    h: number,
    parts: Map<string, Part[]>,
) {
    const n = steps.length;
    const down = f.dir === 'down';
    const cell = (down ? h : w) / n;
    const [bw, bh] = down
        ? [Math.min(260, w), Math.min(110, cell - 64)]
        : [Math.min(260, cell - 104), 110];
    const centre = (i: number): [number, number] =>
        down
            ? [left + w / 2, r1(top + cell * (i + 0.5))]
            : [r1(left + cell * (i + 0.5)), top + h / 2];
    steps.forEach((step, i) => {
        const [x, y] = centre(i);
        const [px, py] = centre(i - 1);
        const at = i ? 1 / 3 : 0;
        parts.set(step.id, [
            ...(i
                ? [
                      {
                          key: 'arrow',
                          t: [0, at],
                          kind: 'line',
                          look: 'edge',
                          d: down
                              ? arrow(x, r1(py + bh / 2 + 16), x, r1(y - bh / 2 - 16))
                              : arrow(r1(px + bw / 2 + 16), y, r1(x - bw / 2 - 16), y),
                      } as Part,
                  ]
                : []),
            {
                key: 'box',
                t: [at, at + (1 - at) * 0.6],
                kind: 'box',
                x: r1(x - bw / 2),
                y: r1(y - bh / 2),
                w: bw,
                h: bh,
            },
            {
                key: 'text',
                t: [at + (1 - at) * 0.6, 1],
                kind: 'text',
                x,
                y: y + 11,
                text: step.text ?? '',
            },
        ]);
    });
}

// Rows sit 240 apart from 80 below the top, tighter when a deeper row would not fit; the root spans the box and
// each node splits its parent's span equally among its children. An edge joins each node to its parent.
function tree(
    nodes: Op[],
    left: number,
    top: number,
    w: number,
    h: number,
    parts: Map<string, Part[]>,
) {
    const kids = (id?: string) => nodes.filter((node) => node.under === id);
    const placed: { node: Op; depth: number; x: number; parent?: { x: number; depth: number } }[] =
        [];
    const place = (
        node: Op,
        depth: number,
        x0: number,
        x1: number,
        parent?: { x: number; depth: number },
    ) => {
        const spot = { node, depth, x: r1((x0 + x1) / 2), parent };
        placed.push(spot);
        const under = kids(node.id);
        under.forEach((child, i) =>
            place(
                child,
                depth + 1,
                x0 + ((x1 - x0) * i) / under.length,
                x0 + ((x1 - x0) * (i + 1)) / under.length,
                spot,
            ),
        );
    };
    kids(undefined).forEach((root) => place(root, 0, left, left + w));
    const deepest = Math.max(1, ...placed.map((p) => p.depth));
    const gap = Math.min(240, (h - 160) / deepest);
    const y = (depth: number) => r1(top + 80 + gap * depth);
    for (const { node, depth, x, parent } of placed) {
        const bw = 2 * Math.round(((node.text ?? '').length * charWidth + 60) / 2);
        const at = parent ? 1 / 3 : 0;
        parts.set(node.id, [
            ...(parent
                ? [
                      {
                          key: 'edge',
                          t: [0, at],
                          kind: 'line',
                          look: 'edge',
                          d: `M${parent.x} ${y(parent.depth) + 42}L${x} ${y(depth) - 42}`,
                      } as Part,
                  ]
                : []),
            {
                key: 'box',
                t: [at, at + (1 - at) * 0.6],
                kind: 'box',
                x: r1(x - bw / 2),
                y: y(depth) - 42,
                w: bw,
                h: 84,
            },
            {
                key: 'text',
                t: [at + (1 - at) * 0.6, 1],
                kind: 'text',
                x,
                y: y(depth) + BASELINE,
                text: node.text ?? '',
            },
        ]);
    }
}

// A 70-high heading row over a strong rule, then rows sharing the rest of the box, at most 110 each, with seams
// between them. Columns are equal; cells start 24 into theirs.
function table(
    t: Op,
    rows: Op[],
    left: number,
    top: number,
    w: number,
    h: number,
    parts: Map<string, Part[]>,
) {
    const cols = t.cols ?? [];
    const col = (j: number) => r1(left + 24 + (w / cols.length) * j);
    const rowH = Math.min(110, (h - 70) / (rows.length || 1));
    parts.set(t.id, [
        ...cols.map((text, j): Part => ({
            key: `head${j}`,
            t: [(0.6 * j) / cols.length, (0.6 * (j + 1)) / cols.length],
            kind: 'text',
            look: 'head',
            anchor: 'start',
            x: col(j),
            y: top + 48,
            text,
        })),
        {
            key: 'rule',
            t: [0.6, 1],
            kind: 'line',
            look: 'rule',
            d: `M${left} ${top + 70}H${left + w}`,
        },
    ]);
    rows.forEach((row, i) => {
        const rowTop = top + 70 + rowH * i;
        const at = i ? 0.2 : 0;
        const cells = row.cells ?? [];
        parts.set(row.id, [
            ...(i
                ? [
                      {
                          key: 'seam',
                          t: [0, at],
                          kind: 'line',
                          look: 'seam',
                          d: `M${left} ${r1(rowTop)}H${left + w}`,
                      } as Part,
                  ]
                : []),
            ...cells.map((text, j): Part => ({
                key: `cell${j}`,
                t: [at + ((1 - at) * j) / cells.length, at + ((1 - at) * (j + 1)) / cells.length],
                kind: 'text',
                anchor: 'start',
                x: col(j),
                y: Math.round(rowTop + rowH / 2 + BASELINE),
                text,
            })),
        ]);
    });
}

// Circles and their set names, then each item at its region, as drawn in the mockup at scale k. Items in one
// region stack 60 apart around its centre. Two sets sit side by side; three in a triangle, the third below.
function venn(
    v: Op,
    items: Op[],
    cx: number,
    cy: number,
    w: number,
    h: number,
    parts: Map<string, Part[]>,
) {
    const sets = v.sets ?? [];
    const three = sets.length === 3;
    const k = Math.min(w / 1100, h / (three ? 800 : 620));
    const s = (x: number, y: number): [number, number] => [r1(cx + x * k), r1(cy + y * k)];
    const circles = three ? [s(-120, -100), s(120, -100), s(0, 108)] : [s(-160, 10), s(160, 10)];
    const names: [number, number, ('start' | 'end')?][] = three
        ? [
              [-330, -290, 'end'],
              [330, -290, 'start'],
              [240, 320, 'start'],
          ]
        : [
              [-280, -278],
              [280, -278],
          ];
    const n = sets.length;
    parts.set(
        v.id,
        sets.flatMap((text, i): Part[] => {
            const [x, y] = s(names[i][0], names[i][1]);
            return [
                {
                    key: `circle${i}`,
                    t: [i / n, (i + 0.8) / n],
                    kind: 'circle',
                    x: circles[i][0],
                    y: circles[i][1],
                    r: r1((three ? 230 : 260) * k),
                },
                {
                    key: `set${i}`,
                    t: [(i + 0.8) / n, (i + 1) / n],
                    kind: 'text',
                    look: 'set',
                    anchor: names[i][2],
                    x,
                    y,
                    text,
                },
            ];
        }),
    );
    // Region centres as text baselines, by the sets an item is in, from the box's centre at scale 1.
    const regions: Record<string, [number, number]> = three
        ? {
              '0': [-240, -139],
              '1': [240, -139],
              '2': [0, 251],
              '0,1': [0, -179],
              '0,2': [-132, 60],
              '1,2': [132, 60],
              '0,1,2': [0, -19],
          }
        : { '0': [-300, 22], '1': [300, 22], '0,1': [0, 22] };
    for (const region of Object.keys(regions)) {
        const inRegion = items.filter((item) => `${item.region}` === region);
        inRegion.forEach((item, i) => {
            const [x, y] = s(
                regions[region][0],
                regions[region][1] + 60 * (i - (inRegion.length - 1) / 2),
            );
            parts.set(item.id, [
                {
                    key: 'text',
                    t: [0, 1],
                    kind: 'text',
                    look: three ? 'sm' : undefined,
                    x,
                    y,
                    text: item.text ?? '',
                },
            ]);
        });
    }
}
