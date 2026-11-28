import { equationTokens } from '../../src/board/sketchRows.ts';

// Board components (docs/board-spec.md, Op language): `axes` + `plot` and `numberline` + `point`, whose geometry is
// computed here (mockup Rabbithole-brd.5), and `flow` + `step`, `tree` + `node`, `table` + `row` and `venn` + `item`,
// which are only checked here: their children reflow on every arrival, so the client lays them out from all the
// children drawn so far (src/board/layout.ts, mockup Rabbithole-brd.6). The tutor gives a component's box.
// Sketches (docs/board-sketches-spec.md: cycle + stage, stack + layer, timeline + event, parts + part, mockup
// Rabbithole-bsk.4; bars + bar, pie + slice, spectrum + place, quadrant + spot, mockup Rabbithole-bsk.5) are checked
// the same way (src/board/sketchLayout.ts), as are compare + aspect, sequence + send and equation + symbol
// (src/board/sketchRows.ts, mockup Rabbithole-bsk.6).
export const SKETCHES = new Set([
    ...['cycle', 'stack', 'timeline', 'parts'],
    ...['bars', 'pie', 'spectrum', 'quadrant'],
    ...['compare', 'sequence', 'equation'],
]);
export const COMPONENTS = new Set([
    'axes',
    'numberline',
    'flow',
    'tree',
    'table',
    'venn',
    'drawing',
    ...SKETCHES,
]);
export const PARENTS = {
    plot: 'axes',
    point: 'numberline',
    step: 'flow',
    node: 'tree',
    row: 'table',
    item: 'venn',
    stage: 'cycle',
    layer: 'stack',
    event: 'timeline',
    part: 'parts',
    bar: 'bars',
    slice: 'pie',
    place: 'spectrum',
    spot: 'quadrant',
    aspect: 'compare',
    send: 'sequence',
    symbol: 'equation',
    path: 'drawing',
};
// Default boxes, in board pixels.
const SIZES = {
    axes: [800, 600],
    numberline: [1000, 240],
    flow: [1200, 260],
    // A downward flow stacks its steps, so it needs height: five still get 96-high boxes.
    'flow down': [400, 800],
    tree: [1200, 640],
    table: [1100, 420],
    venn: [1100, 620],
    cycle: [1200, 560],
    stack: [1100, 600],
    timeline: [1000, 640],
    parts: [1300, 560],
    bars: [1200, 520],
    pie: [1200, 600],
    spectrum: [1300, 440],
    quadrant: [1300, 780],
    compare: [1100, 500],
    sequence: [1200, 700],
    equation: [1200, 500],
    drawing: [600, 600],
};
const words = (text) => (text ?? '').split('|').map((word) => word.trim());
const FUNCS = {
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    exp: Math.exp,
    log: Math.log,
    ln: Math.log,
    abs: Math.abs,
};
const CONSTS = { pi: Math.PI, e: Math.E };
const NUMBER = /^-?\d*\.?\d+(\/\d*\.?\d+)?$/;
const r1 = (v) => Math.round(v * 10) / 10;

// A function of x from the tutor's expression (+ - * / ^, FUNCS, CONSTS, implicit products like 2x), or null.
export function expression(text) {
    const toks = String(text)
        .replace(/^\s*y\s*=/, '')
        .match(/\d*\.?\d+|[a-z]+|\S/gi);
    if (!toks) return null;
    let i = 0;
    const peek = () => toks[i];
    const primary = () => {
        const t = toks[i++];
        if (t === undefined) throw 0;
        if (/^\d*\.?\d+$/.test(t)) return () => +t;
        if (t === '(') {
            const inner = sum();
            if (toks[i++] !== ')') throw 0;
            return inner;
        }
        const name = t.toLowerCase();
        if (name === 'x') return (x) => x;
        if (Object.hasOwn(CONSTS, name)) return () => CONSTS[name];
        if (Object.hasOwn(FUNCS, name) && toks[i] === '(') {
            const arg = primary();
            return (x) => FUNCS[name](arg(x));
        }
        throw 0;
    };
    const power = () => {
        const base = primary();
        if (peek() !== '^') return base;
        i++;
        const exp = unary();
        return (x) => base(x) ** exp(x);
    };
    const unary = () => {
        if (peek() === '-') {
            i++;
            const inner = unary();
            return (x) => -inner(x);
        }
        if (peek() === '+') i++;
        return power();
    };
    const product = () => {
        let left = unary();
        while (peek() !== undefined && !/^[-+)]$/.test(peek())) {
            const op = /^[*/]$/.test(peek()) ? toks[i++] : '*';
            const [l, right] = [left, unary()];
            left = op === '/' ? (x) => l(x) / right(x) : (x) => l(x) * right(x);
        }
        return left;
    };
    const sum = () => {
        let left = product();
        while (peek() === '+' || peek() === '-') {
            const [op, l, right] = [toks[i++], left, product()];
            left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
        }
        return left;
    };
    try {
        const f = sum();
        return i === toks.length ? f : null;
    } catch {
        return null;
    }
}

const range = (text = '-5..5') => {
    const m = /^(-?\d*\.?\d+)\.\.(-?\d*\.?\d+)$/.exec(text);
    return m && +m[1] < +m[2] ? [+m[1], +m[2]] : null;
};
// A sketch's two end names, from "low..high", or null.
const ends = (text) => {
    const pair = (text ?? '').split('..').map((word) => word.trim());
    return pair.length === 2 && pair.every(Boolean) ? pair : null;
};
const value = (word) => (NUMBER.test(word ?? '') ? expression(word)(0) : NaN);

// Evenly spaced ticks that include both ends, and 0 when it is inside: the fewest-pieces whole step, else halves.
function ticks([lo, hi]) {
    const span = hi - lo;
    const n =
        [5, 4, 6, 8, 10, 3].find(
            (n) => Number.isInteger(span / n) && Number.isInteger(-lo / (span / n)),
        ) ?? 2;
    return Array.from({ length: n + 1 }, (_, k) => +(lo + (k * span) / n).toFixed(10)).map((v) => [
        v,
        String(v),
    ]);
}

// The box a component draws in: axes leave room for their numbers left and below.
function scale(item) {
    const [left, top] = [item.at[0] - item.w / 2, item.at[1] - item.h / 2];
    const [right, bottom] = [left + item.w, top + item.h];
    const [x0, x1] = item.kind === 'axes' ? [left + 60, right - 20] : [left + 50, right - 50];
    const [y0, y1] = item.kind === 'axes' ? [top + 20, bottom - 60] : [bottom - 100, bottom - 100];
    const [xlo, xhi] = item.x;
    const [ylo, yhi] = item.y ?? [0, 1];
    return {
        x: (v) => r1(x0 + ((v - xlo) / (xhi - xlo)) * (x1 - x0)),
        y: (v) => r1(y1 - ((v - ylo) / (yhi - ylo)) * (y1 - y0)),
        x0,
        x1,
        y0,
        y1,
    };
}

// A component's own fields, or the reason it is skipped. Its geometry comes later, from `layout`.
export function component(op, item) {
    const [w, h] = SIZES[op.kind === 'flow' && op.opts.dir === 'down' ? 'flow down' : op.kind];
    item.w = Number(op.opts.w ?? w);
    item.h = Number(op.opts.h ?? h);
    if (!(item.w > 0 && item.h > 0)) return 'sizes must be positive';
    if (op.kind === 'flow') {
        item.dir = op.opts.dir ?? 'right';
        return item.dir === 'right' || item.dir === 'down' ? null : 'dir is right or down';
    }
    if (['drawing', 'tree', 'cycle', 'stack', 'timeline', 'bars', 'pie'].includes(op.kind))
        return null;
    if (op.kind === 'spectrum') {
        item.ends = ends(op.opts.ends ?? op.strs[0]);
        return item.ends ? null : 'spectrum needs ends="low..high"';
    }
    if (op.kind === 'quadrant') {
        const [x, y] = [ends(op.opts.x), ends(op.opts.y)];
        item.ends = x && y && [...x, ...y];
        return item.ends ? null : 'quadrant needs x="low..high" y="low..high"';
    }
    if (op.kind === 'parts') {
        item.whole = (op.opts.whole ?? op.strs[0])?.trim();
        return item.whole ? null : 'parts needs whole="…"';
    }
    if (op.kind === 'compare') {
        item.vs = words(op.opts.vs ?? op.strs[0]);
        return item.vs.length === 2 && item.vs.every(Boolean) ? null : 'compare needs vs="A|B"';
    }
    if (op.kind === 'sequence') {
        item.actors = words(op.opts.actors ?? op.strs[0]);
        const unique = new Set(item.actors.map((actor) => actor.toLowerCase()));
        return item.actors.length >= 2 &&
            item.actors.every(Boolean) &&
            unique.size === item.actors.length
            ? null
            : 'sequence needs actors="A|B|C"';
    }
    if (op.kind === 'equation') {
        item.text = op.strs[0]?.trim();
        return item.text && equationTokens(item.text).some((token) => token.symbol)
            ? null
            : 'equation needs "symbols separated by spaces"';
    }
    if (op.kind === 'table') {
        item.cols = words(op.opts.cols ?? op.strs[0]);
        return item.cols.some(Boolean) ? null : 'table needs cols="A|B|C"';
    }
    if (op.kind === 'venn') {
        item.sets = words(op.opts.sets ?? op.strs[0]);
        const unique = new Set(item.sets.map((set) => set.toLowerCase()));
        return (item.sets.length === 2 || item.sets.length === 3) &&
            item.sets.every(Boolean) &&
            unique.size === item.sets.length
            ? null
            : 'venn needs sets="A|B" or "A|B|C"';
    }
    if (op.kind === 'axes') {
        [item.x, item.y] = [range(op.opts.x), range(op.opts.y)];
        if (!item.x || !item.y) return 'ranges are LO..HI';
        return null;
    }
    item.x = range(op.opts.range);
    if (!item.x) return 'range is LO..HI';
    item.ticks = op.opts.ticks
        ? op.opts.ticks.split(',').map((word) => [value(word), word])
        : ticks(item.x);
    if (item.ticks.some(([v]) => !(v >= item.x[0] && v <= item.x[1])))
        return 'ticks must be in the range';
    return null;
}

// A component's lines and numbers, once the guard has placed its box.
export function layout(item) {
    if (!item.x) return item;
    const s = scale(item);
    const [x, y] = [
        s.x(Math.min(Math.max(0, item.x[0]), item.x[1])),
        item.y && s.y(Math.min(Math.max(0, item.y[0]), item.y[1])),
    ];
    if (item.kind === 'numberline') {
        const ly = s.y0;
        const marks = item.ticks.map(([v, word]) => ({ px: s.x(v), word }));
        return {
            ...item,
            d:
                `M${s.x0} ${ly}H${s.x1}` +
                marks.map(({ px }) => `M${px} ${ly - 14}V${ly + 14}`).join(''),
            labels: marks.map(({ px, word }) => ({ at: [px, ly + 60], text: word })),
        };
    }
    // A 0 tick that the other axis runs through would be struck through, so it is left out.
    const xs = ticks(item.x)
        .filter(([v]) => v || item.y[0] >= 0)
        .map(([v, word]) => ({ px: s.x(v), word }));
    const ys = ticks(item.y)
        .filter(([v]) => v || item.x[0] >= 0)
        .map(([v, word]) => ({ py: s.y(v), word }));
    return {
        ...item,
        d:
            `M${s.x0} ${y}H${s.x1}M${x} ${s.y1}V${s.y0}` +
            xs.map(({ px }) => `M${px} ${y}V${y + 12}`).join('') +
            ys.map(({ py }) => `M${x - 12} ${py}H${x}`).join(''),
        labels: [
            ...xs.map(({ px, word }) => ({ at: [px, y + 48], text: word })),
            ...ys.map(({ py, word }) => ({ at: [x - 24, py + 9], text: word, end: true })),
        ],
    };
}

// A child's place in its parent's units, converted to board pixels, or the reason it is skipped.
// `items` are the board's items so far, for a node's parent.
export function child(op, item, parent, items) {
    if (!op.on) return `${op.kind} needs on ID`;
    if (!parent) return `unknown parent ${op.on}`;
    const kind = PARENTS[op.kind] ?? (op.kind === 'dot' || op.kind === 'text' ? 'axes' : null);
    if (!kind) return `${op.kind} cannot go on a component`;
    if (parent.kind !== kind) return `${op.kind} needs ${kind}, not ${parent.kind} ${parent.id}`;
    item.on = parent.id;
    if (op.kind in LABELLED) return labelled(op, item, parent, items);
    if (op.kind === 'path') return drawn(op, item, parent, items);
    const s = scale(parent);
    const inside = (v, [lo, hi]) => v >= lo && v <= hi;
    if (op.kind === 'point') {
        const v = value(op.vals[0]);
        if (!inside(v, parent.x)) return 'point needs a value in the range';
        item.at = [s.x(v), s.y0];
        item.text = op.strs[0]?.trim() || op.opts.label || op.vals[0];
        return null;
    }
    if (op.kind === 'plot') {
        const f = expression(op.strs[0] ?? op.opts.y ?? '');
        if (!f) return 'bad math';
        item.d = trace(f, parent, s);
        return item.d ? null : 'plot never enters the axes';
    }
    const [vx, vy] = op.pts[0] ?? op.at ?? [];
    if (!inside(vx, parent.x) || !inside(vy, parent.y))
        return `${op.kind} needs X,Y inside the axes`;
    item.at = [s.x(vx), s.y(vy)];
    if (op.kind === 'text') {
        if (!op.strs[0]?.trim()) return 'text needs a "label"';
        item.text = op.strs[0].trim();
        item.size = op.opts.size ?? 's';
    }
    return null;
}

// A drawing's colour names (docs/board-polish-spec.md, Drawing component): theme roles the client maps to tokens.
const INKS = new Set(['blue', 'green', 'pink', 'yellow', 'ink', 'muted']);
// Model-written markup reaching the page: SVG path commands, numbers, spaces and commas only (ADR 0030).
const PATH_DATA = /^[MLHVCSQTAZ\d\s,.-]+$/i;
const PATH_MAX = 600;
const PATHS_MAX = 24;
const ARGS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

// The box a path's points and control points span, in its drawing's 0-100 units; an arc counts its end point only.
function extent(d) {
    const [xs, ys] = [[], []];
    let [x, y, sx, sy] = [0, 0, 0, 0];
    for (const [, cmd, args] of d.matchAll(/([a-z])([^a-z]*)/gi)) {
        const n = (args.match(/-?(\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
        const [C, rel] = [cmd.toUpperCase(), cmd !== cmd.toUpperCase()];
        if (C === 'Z') [x, y] = [sx, sy];
        for (let i = 0; ARGS[C] && i + ARGS[C] <= n.length; i += ARGS[C]) {
            const a = n.slice(i, i + ARGS[C]);
            const [ox, oy] = rel ? [x, y] : [0, 0];
            if (C === 'H') x = ox + a[0];
            else if (C === 'V') y = oy + a[0];
            else {
                const pairs = C === 'A' ? [5] : a.map((_, k) => k).filter((k) => k % 2 === 0);
                for (const k of pairs) (xs.push(ox + a[k]), ys.push(oy + a[k + 1]));
                [x, y] = [xs.at(-1), ys.at(-1)];
                if (C === 'M' && i === 0) [sx, sy] = [x, y];
            }
            (xs.push(x), ys.push(y));
        }
    }
    return xs.length && [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// A drawing's path: its data checked, its colour names, and where its 0-100 square sits in the drawing's box
// (scaled by the smaller side and centred), with its own extent for the spotlight, pointer and pen.
function drawn(op, item, parent, items) {
    const d = op.strs[0]?.trim() ?? '';
    if (!PATH_DATA.test(d)) return 'path needs "d" of SVG path commands and numbers only';
    if (d.length > PATH_MAX) return `path data is over ${PATH_MAX} characters`;
    const siblings = [...items.values()].filter((other) => other.on === parent.id);
    if (siblings.length >= PATHS_MAX) return `${parent.id} already has ${PATHS_MAX} paths`;
    for (const key of ['ink', 'fill']) {
        const name = op.opts[key];
        if (name === undefined) {
            if (key === 'ink') item.ink = 'ink';
            continue;
        }
        if (!INKS.has(name)) return `${key} is ${[...INKS].join('|')}`;
        item[key] = name;
    }
    const box = extent(d);
    if (!box) return 'path needs "d" with points';
    const s = Math.min(parent.w, parent.h) / 100;
    const [left, top] = [parent.at[0] - 50 * s, parent.at[1] - 50 * s];
    item.d = d;
    item.fit = [r1(left), r1(top), s];
    const [x0, y0, x1, y1] = box.map((v, i) => (i % 2 ? top : left) + v * s);
    item.at = [r1((x0 + x1) / 2), r1((y0 + y1) / 2)];
    [item.w, item.h] = [r1(x1 - x0), r1(y1 - y0)];
    return null;
}

const LABELLED = {
    ...{ step: 1, node: 1, row: 1, item: 1, stage: 1, layer: 1, event: 1, part: 1 },
    ...{ bar: 1, slice: 1, place: 1, spot: 1 },
    ...{ aspect: 1, send: 1, symbol: 1 },
};
// A flow, tree, table, Venn or sketch child: its words, for a node its parent node, for an item its sets, for a
// layer, part or place its optional note, for an event its date, for a bar its value and optional unit, for a slice
// its value, for a spot its X,Y from 0 to 10, for an aspect its value per side, for a send its actors (indices into
// the sequence's) and for a symbol its meaning and its token in the equation.
function labelled(op, item, parent, items) {
    const label = op.strs[0]?.trim();
    if (!label) return `${op.kind} needs a "label"`;
    if (op.kind === 'row') {
        item.cells = words(label);
        if (item.cells.length > parent.cols.length)
            return `row has more cells than ${parent.id} has cols`;
        // A short row leaves its last cells empty.
        while (item.cells.length < parent.cols.length) item.cells.push('');
        return null;
    }
    item.text = label;
    if (['layer', 'part', 'place'].includes(op.kind) && op.opts.note?.trim())
        item.note = op.opts.note.trim();
    if (op.kind === 'bar' || op.kind === 'slice') {
        item.value = value(op.opts.value ?? op.vals[0]);
        if (Number.isNaN(item.value)) return `${op.kind} needs value=N`;
        // A slice of nothing has no share to draw.
        if (op.kind === 'bar' ? item.value < 0 : item.value <= 0)
            return `${op.kind} value must be ${op.kind === 'bar' ? '0 or more' : 'above 0'}`;
        if (op.kind === 'bar' && op.opts.unit?.trim()) item.unit = op.opts.unit.trim();
    }
    if (op.kind === 'spot') {
        item.xy = op.pts[0];
        if (!item.xy) return 'spot needs X,Y';
        if (!item.xy.every((v) => v >= 0 && v <= 10)) return 'spot X and Y are from 0 to 10';
    }
    if (op.kind === 'event') {
        item.when = op.opts.when?.trim();
        if (!item.when) return 'event needs when="…"';
    }
    if (op.kind === 'aspect') {
        item.values = words(op.opts.values);
        if (item.values.length !== parent.vs.length || !item.values.every(Boolean))
            return `aspect needs values="a|b", one per side of ${parent.id}`;
    }
    if (op.kind === 'send') {
        const actor = (name) =>
            parent.actors.findIndex((a) => a.toLowerCase() === name?.trim().toLowerCase());
        item.by = actor(op.opts.by);
        if (item.by < 0) return `send needs by= one of ${parent.actors.join('|')}`;
        if (op.opts.to !== undefined) {
            item.to = actor(op.opts.to);
            if (item.to < 0 || item.to === item.by)
                return `send needs to= another of ${parent.actors.join('|')}`;
        }
    }
    if (op.kind === 'symbol') {
        item.means = op.opts.means?.trim();
        if (!item.means) return 'symbol needs means="…"';
        item.token = equationTokens(parent.text).findIndex(
            (token) => token.symbol && (token.base === label || token.text === label),
        );
        if (item.token < 0) return `symbol needs one of ${parent.id}'s symbols`;
    }
    if (op.kind === 'node') {
        const nodes = [...items.values()].filter((other) => other.on === parent.id);
        const under = op.under ?? op.opts.under;
        if (!under)
            return nodes.length ? `${parent.id} already has a root; give under NODE_ID` : null;
        if (!nodes.some((other) => other.id === under))
            return `unknown node ${under} on ${parent.id}`;
        item.under = under;
    }
    if (op.kind === 'item') {
        const names = parent.sets.map((set) => set.toLowerCase());
        const wanted = words((op.opts.set ?? op.opts.sets ?? '').replaceAll('+', '|'));
        item.region = [...new Set(wanted.map((set) => names.indexOf(set.toLowerCase())))].sort();
        if (!wanted.some(Boolean) || item.region.includes(-1))
            return `item needs set=${parent.sets.join('+')} or some of those`;
    }
    return null;
}

// The curve left to right every 10 board pixels, broken where it leaves the axes and cut at their edge.
function trace(f, parent, s) {
    const [ylo, yhi] = parent.y;
    const [xlo, xhi] = parent.x;
    const steps = Math.max(1, Math.round((s.x1 - s.x0) / 10));
    let d = '',
        prev;
    for (let k = 0; k <= steps; k++) {
        const vx = xlo + ((xhi - xlo) * k) / steps;
        const vy = f(vx);
        const point = { vx, vy, in: Number.isFinite(vy) && vy >= ylo && vy <= yhi };
        const edge = (a, b) => {
            // Where the segment a→b crosses the nearer limit, when both ends are finite.
            if (!Number.isFinite(a.vy) || !Number.isFinite(b.vy)) return null;
            const limit = Math.max(a.vy, b.vy) > yhi ? yhi : ylo;
            const t = (limit - a.vy) / (b.vy - a.vy);
            return `${s.x(a.vx + (b.vx - a.vx) * t)} ${s.y(limit)}`;
        };
        if (point.in) {
            const cut = prev && !prev.in && edge(prev, point);
            d += prev?.in ? 'L' : cut ? `M${cut}L` : 'M';
            d += `${s.x(vx)} ${s.y(vy)}`;
        } else if (prev?.in) {
            const cut = edge(prev, point);
            if (cut) d += `L${cut}`;
        }
        prev = point;
    }
    return d;
}
