// Board op lines (docs/board-spec.md, Op language): `<id> <kind> <args> [key=value]` on a fixed
// 1600×900 board (ADR 0028). Tokens follow prototype/board-placement. Kinds so far: shapes, text, erase and
// the learner's pen strokes.
const KINDS = new Set(['circle', 'box', 'dot', 'line', 'arrow', 'text', 'erase', 'stroke']);
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
    const op = { strs: [], pts: [], ids: [], opts: {} };
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
        } else if (w === 'from' || w === 'to') {
            op[w] = rest[++i]?.w;
            if (!op[w]) return { error: `${w} needs an id` };
        } else if (point(w)) op.pts.push(point(w));
        else if (op.kind === 'erase' && ID.test(w)) op.ids.push(w);
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

// How far a point lies outside an item's space, 0 inside it.
function gap(b, [x, y]) {
    if (b.round) return Math.max(0, Math.hypot(x - b.c[0], y - b.c[1]) - b.r);
    const dx = Math.max(0, Math.abs(x - b.c[0]) - b.w / 2);
    const dy = Math.max(0, Math.abs(y - b.c[1]) - b.h / 2);
    return Math.hypot(dx, dy);
}

// Whether a point is inside the polygon a stroke traces, by ray casting.
function inside([x, y], points) {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [[xi, yi], [xj, yj]] = [points[i], points[j]];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

// The board's items so far; `read` turns one op line into a drawable item or the reason it was skipped.
export function boardOps() {
    const items = new Map();
    const positive = (value, fallback) =>
        value === undefined ? fallback : Number(value) > 0 ? Number(value) : NaN;
    function build(op) {
        if (items.has(op.id)) return { error: `id ${op.id} is already on the board` };
        const item = { id: op.id, kind: op.kind };
        if (op.opts.look !== undefined) {
            if (!LOOKS.has(op.opts.look)) return { error: `unknown look "${op.opts.look}"` };
            item.look = op.opts.look;
        }
        if (op.kind === 'erase') {
            if (!op.ids.length) return { error: 'erase needs an id' };
            const unknown = op.ids.find((name) => !items.has(name));
            if (unknown) return { error: `unknown id ${unknown}` };
            op.ids.forEach((name) => items.delete(name));
            return { item: { id: op.id, kind: 'erase', ids: op.ids } };
        }
        if (op.kind === 'stroke') {
            if (!op.pts.length) return { error: 'stroke needs a point' };
            return { item: { ...item, points: op.pts } };
        }
        if (op.kind === 'line' || op.kind === 'arrow') {
            if (op.from || op.to) {
                const [a, b] = [items.get(op.from), items.get(op.to)];
                if (!a || !b) return { error: `unknown id ${a ? op.to : op.from}` };
                const [ba, bb] = [bounds(a), bounds(b)];
                item.points = [edge(ba, bb.c), edge(bb, ba.c)];
            } else if (op.pts.length >= 2) item.points = op.pts;
            else return { error: `${op.kind} needs two points or from ID to ID` };
            return { item };
        }
        if (!op.at) return { error: 'at needs X,Y' };
        item.at = op.at;
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
            if (built.item && built.item.kind !== 'erase') items.set(built.item.id, built.item);
            return built;
        },
        has: (id) => items.has(id),
        items: () => [...items.values()],
        // What a learner stroke marks (docs/board-spec.md, Learner pen): a closed loop circles the items whose
        // centres it encloses; otherwise it points at the item nearest its end, within 40 board pixels.
        mark(points) {
            const targets = [...items.values()].filter((i) => i.kind !== 'stroke');
            const [start, end] = [points[0], points.at(-1)];
            const box = bounds({ points });
            const closed =
                points.length > 2 &&
                Math.hypot(end[0] - start[0], end[1] - start[1]) <=
                    Math.max(60, 0.3 * Math.hypot(box.w, box.h));
            const circled = closed
                ? targets.filter((i) => inside(bounds(i).c, points)).map((i) => i.id)
                : [];
            if (circled.length) return { verb: 'circled', ids: circled };
            const [near] = targets
                .map((i) => ({ id: i.id, d: gap(bounds(i), end) }))
                .filter(({ d }) => d <= 40)
                .sort((a, b) => a.d - b.d);
            return near ? { verb: 'pointed at', ids: [near.id] } : null;
        },
    };
}
