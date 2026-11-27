// Board op lines (docs/board-spec.md, Op language): `<id> <kind> <args> [key=value]` on a fixed
// 1600×900 board (ADR 0028). Tokens follow prototype/board-placement. Kinds so far: shapes, text and components.
import { COMPONENTS, component, child, layout } from './components.mjs';

const KINDS = new Set([
    'circle',
    'box',
    'dot',
    'line',
    'arrow',
    'text',
    'axes',
    'plot',
    'numberline',
    'point',
]);
const LOOKS = new Set(['focus', 'muted', 'good', 'wrong', 'new']);
// Label font sizes in board pixels (mockup Rabbithole-brd.2).
const TEXT_SIZES = { s: 32, m: 44, l: 64 };
const DOT_R = 14;
const TOKEN = /(\w+)="([^"]*)"|"([^"]*)"|(\S+)/g;
const ID = /^[A-Za-z_][\w-]*$/;
// A connector stops this far short of the items it joins.
const GAP = 8;

const point = (word) => {
    const m = /^(-?\d*\.?\d+),(-?\d*\.?\d+)$/.exec(word ?? '');
    return m && [+m[1], +m[2]];
};

function tokens(line) {
    const op = { strs: [], pts: [], vals: [], opts: {} };
    const words = [...line.matchAll(TOKEN)].map((m) =>
        m[1] ? { k: m[1], v: m[2] } : m[3] !== undefined ? { s: m[3] } : { w: m[4] },
    );
    const [id, kind, ...rest] = words;
    if (!id?.w || !ID.test(id.w)) return { error: 'not an op' };
    if (!KINDS.has(kind?.w)) return { error: `unknown kind "${kind?.w ?? kind?.s ?? ''}"` };
    Object.assign(op, { id: id.w, kind: kind.w });
    for (let i = 0; i < rest.length; i++) {
        const { k, v, s, w } = rest[i];
        if (k) op.opts[k] = v;
        else if (s !== undefined) op.strs.push(s);
        else if (w === '->') continue;
        else if (w === 'at') {
            op.at = point(rest[++i]?.w);
            if (!op.at) return { error: 'at needs X,Y' };
        } else if (w === 'from' || w === 'to' || w === 'on' || w === 'in') {
            const key = w === 'in' ? 'on' : w;
            op[key] = rest[++i]?.w;
            if (!op[key]) return { error: `${w} needs an id` };
        } else if (point(w)) op.pts.push(point(w));
        else if (/^-?\d*\.?\d+(\/\d*\.?\d+)?$/.test(w)) op.vals.push(w);
        else if (/^\w+=\S+$/.test(w)) op.opts[w.split('=')[0]] = w.slice(w.indexOf('=') + 1);
        else return { error: `unexpected token "${w}"` };
    }
    return { op };
}

// The space an item takes on the board, for connectors.
function bounds(item) {
    if (item.kind === 'circle' || item.kind === 'dot')
        return { round: true, c: item.at, r: item.r ?? DOT_R };
    if (item.points) {
        const xs = item.points.map((p) => p[0]),
            ys = item.points.map((p) => p[1]);
        const [x0, x1, y0, y1] = [
            Math.min(...xs),
            Math.max(...xs),
            Math.min(...ys),
            Math.max(...ys),
        ];
        return { c: [(x0 + x1) / 2, (y0 + y1) / 2], w: x1 - x0, h: y1 - y0 };
    }
    if (item.kind === 'text') {
        const fs = TEXT_SIZES[item.size];
        return { c: item.at, w: item.text.length * fs * 0.56 + 8, h: fs * 1.2 };
    }
    return { c: item.at, w: item.w, h: item.h };
}

// Where a line from the centre of `b` towards `to` leaves `b`, plus the gap.
function edge(b, to) {
    const [dx, dy] = [to[0] - b.c[0], to[1] - b.c[1]];
    const length = Math.hypot(dx, dy) || 1;
    const reach = b.round
        ? b.r
        : Math.min(b.w / 2 / Math.abs(dx || 1e-9), b.h / 2 / Math.abs(dy || 1e-9)) * length;
    const t = (reach + GAP) / length;
    return [Math.round(b.c[0] + dx * t), Math.round(b.c[1] + dy * t)];
}

// The guard (docs/board-spec.md, ADR 0028), with the prototype's overlap measure.
const [W, H] = [1600, 900];
// Free spots are searched on this grid, in board pixels.
const STEP = 10;
const CONTAINERS = new Set(['box', 'circle']);
const liney = (item) => !!item.points;

function box(item) {
    const b = bounds(item);
    const [w, h] = b.round ? [2 * b.r, 2 * b.r] : [b.w, b.h];
    return { x: b.c[0] - w / 2, y: b.c[1] - h / 2, w, h };
}
const pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
const inter = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
        h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? { w, h } : null;
};
// Inside `o` and smaller, so an item stacked exactly on another still counts.
const contains = (o, i) =>
    i.w * i.h < o.w * o.h &&
    i.x >= o.x - 2 &&
    i.y >= o.y - 2 &&
    i.x + i.w <= o.x + o.w + 2 &&
    i.y + i.h <= o.y + o.h + 2;
const onBoard = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;

// Whether segment p→q passes through box b (Liang–Barsky clipping).
function segHits(p, q, b) {
    let [t0, t1] = [0, 1];
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    for (const [pp, qq] of [
        [-dx, p[0] - b.x],
        [dx, b.x + b.w - p[0]],
        [-dy, p[1] - b.y],
        [dy, b.y + b.h - p[1]],
    ]) {
        if (pp === 0) {
            if (qq < 0) return false;
            continue;
        }
        const r = qq / pp;
        if (pp < 0) {
            if (r > t1) return false;
            t0 = Math.max(t0, r);
        } else {
            if (r < t0) return false;
            t1 = Math.min(t1, r);
        }
    }
    return true;
}

// `connectors` holds the ids of lines joined `from <id> to <id>`.
function overlaps(a, b, connectors) {
    if (a.kind === 'dot' || b.kind === 'dot') return false;
    if (liney(a) && liney(b)) return false;
    const [ba, bb] = [box(a), box(b)];
    if (liney(a) || liney(b)) {
        const [l, o, bo] = liney(a) ? [a, b, bb] : [b, a, ba];
        // A drawn line may cross shapes and only collides with text; a connector collides with anything.
        if (!connectors.has(l.id) && o.kind !== 'text') return false;
        if (CONTAINERS.has(o.kind) && contains(bo, box(l))) return false;
        return l.points.slice(1).some((q, i) => segHits(l.points[i], q, pad(bo, -4)));
    }
    const i = inter(ba, bb);
    if (!i || i.w <= 4 || i.h <= 4) return false;
    return !(
        (CONTAINERS.has(a.kind) && contains(ba, bb)) ||
        (CONTAINERS.has(b.kind) && contains(bb, ba))
    );
}

const shift = (item, dx, dy) =>
    item.points
        ? { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy]) }
        : { ...item, at: [item.at[0] + dx, item.at[1] + dy] };

// The item itself when it is on the board and free, else a copy at the nearest free spot on the board.
function guard(item, others, connectors) {
    const free = (it) => onBoard(box(it)) && !others.some((o) => overlaps(it, o, connectors));
    // A connector stays joined to its items, so it is never moved.
    if (connectors.has(item.id) || free(item)) return item;
    const b = box(item);
    const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
    const spots = [];
    for (let x = b.w / 2; x <= W - b.w / 2; x += STEP)
        for (let y = b.h / 2; y <= H - b.h / 2; y += STEP)
            spots.push([Math.round(x - cx), Math.round(y - cy)]);
    spots.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
    let fallback;
    for (const [dx, dy] of spots) {
        const moved = shift(item, dx, dy);
        if (free(moved)) return moved;
        if (!fallback && onBoard(box(moved))) fallback = moved;
    }
    // shortcut: a full board keeps the nearest on-board spot even if it overlaps; upgrade if boards fill up.
    return fallback ?? item;
}

// The board's items so far; `read` turns one op line into a drawable item, moved by the guard when it
// overlaps or leaves the board, or the reason it was skipped.
export function boardOps() {
    const items = new Map();
    const connectors = new Set();
    const positive = (value, fallback) =>
        value === undefined ? fallback : Number(value) > 0 ? Number(value) : NaN;
    function build(op) {
        if (items.has(op.id)) return { error: `id ${op.id} is already on the board` };
        const item = { id: op.id, kind: op.kind };
        if (op.opts.look !== undefined) {
            if (!LOOKS.has(op.opts.look)) return { error: `unknown look "${op.opts.look}"` };
            item.look = op.opts.look;
        }
        if (op.kind === 'line' || op.kind === 'arrow') {
            if (op.from || op.to) {
                const [a, b] = [items.get(op.from), items.get(op.to)];
                // A component's children live inside its box, so connectors join top-level items only.
                if (!a || !b || a.on || b.on)
                    return { error: `unknown id ${a && !a.on ? op.to : op.from}` };
                const [ba, bb] = [bounds(a), bounds(b)];
                item.points = [edge(ba, bb.c), edge(bb, ba.c)];
                connectors.add(op.id);
            } else if (op.pts.length >= 2) item.points = op.pts;
            else return { error: `${op.kind} needs two points or from ID to ID` };
            return { item };
        }
        if (op.on || op.kind === 'plot' || op.kind === 'point') {
            const error = child(op, item, items.get(op.on));
            return error ? { error } : { item };
        }
        if (!op.at) return { error: 'at needs X,Y' };
        item.at = op.at;
        if (COMPONENTS.has(op.kind)) {
            const error = component(op, item);
            return error ? { error } : { item };
        }
        if (op.kind === 'circle') item.r = positive(op.opts.r, 90);
        if (op.kind === 'box')
            [item.w, item.h] = [positive(op.opts.w, 280), positive(op.opts.h, 160)];
        if ([item.r, item.w, item.h].some(Number.isNaN)) return { error: 'sizes must be positive' };
        if (op.kind === 'text') {
            if (!op.strs[0]?.trim()) return { error: 'text needs a "label"' };
            item.size = op.opts.size ?? 'm';
            if (!Object.hasOwn(TEXT_SIZES, item.size))
                return { error: `unknown size "${item.size}"` };
        }
        // A circle or box may carry a short label inside it.
        if (op.strs[0]?.trim()) item.text = op.strs[0].trim();
        return { item };
    }
    return {
        read(line) {
            const parsed = tokens(line);
            if (parsed.error) return parsed;
            const built = build(parsed.op);
            if (!built.item) return built;
            // To the guard a component is one item at its box; its children stay inside it, unguarded.
            if (built.item.on) {
                items.set(built.item.id, built.item);
                return built;
            }
            const others = [...items.values()].filter((other) => !other.on);
            const guarded = guard(built.item, others, connectors);
            const item = COMPONENTS.has(guarded.kind) ? layout(guarded) : guarded;
            items.set(item.id, item);
            return guarded === built.item ? { item } : { item, moved: true };
        },
    };
}
