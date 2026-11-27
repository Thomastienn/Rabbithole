// Board op lines (docs/board-spec.md, Op language): `<id> <kind> <args> [key=value]` on a fixed
// 1600×900 board (ADR 0028). Tokens follow prototype/board-placement.
import katex from 'katex';

const KINDS = new Set([
    'circle',
    'box',
    'dot',
    'line',
    'arrow',
    'text',
    'math',
    'highlight',
    'pointer',
    'erase',
    'clear',
]);
// Kinds that name other items instead of placing one; they cannot be named themselves.
const MARKS = new Set(['highlight', 'pointer', 'erase', 'clear']);
// Each clear moves on to a fresh 1600×900 area this far below the last (mockup Rabbithole-brd.4).
const AREA = 900;
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
    const op = { strs: [], pts: [], refs: [], opts: {} };
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
        else if (/^\w+=\S+$/.test(w)) op.opts[w.split('=')[0]] = w.slice(w.indexOf('=') + 1);
        else if (MARKS.has(op.kind) && ID.test(w)) op.refs.push(w);
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
    if (item.kind === 'math') {
        // shortcut: sized from the LaTeX with each command as one glyph; measure KaTeX's layout if highlights miss.
        const fs = TEXT_SIZES[item.size];
        const glyphs = item.text.replace(/\\[a-zA-Z]+/g, 'x').replace(/[\s{}^_]/g, '').length;
        return {
            c: item.at,
            w: glyphs * fs * 0.6 + 8,
            h: fs * (/\\frac/.test(item.text) ? 2.4 : 1.2),
        };
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

// The board's items so far; `read` turns one op line into a drawable item or the reason it was skipped.
export function boardOps() {
    const items = new Map();
    // Clears so far, and where the pointer last stopped (a fresh area starts it at its centre).
    let area = 0,
        pointer = [800, 450];
    const erased = new Set();
    // An item still on the board that ops can name; erase can also name a highlight.
    const target = (id, kind) => {
        const item = items.get(id);
        const named = !MARKS.has(item?.kind) || (kind === 'erase' && item.kind === 'highlight');
        return item && named && !erased.has(id) ? item : undefined;
    };
    const positive = (value, fallback) =>
        value === undefined ? fallback : Number(value) > 0 ? Number(value) : NaN;
    function build(op) {
        if (items.has(op.id)) return { error: `id ${op.id} is already on the board` };
        const item = { id: op.id, kind: op.kind };
        if (op.opts.look !== undefined) {
            if (!LOOKS.has(op.opts.look)) return { error: `unknown look "${op.opts.look}"` };
            item.look = op.opts.look;
        }
        if (op.kind === 'clear') {
            area += 1;
            pointer = [800, 450 + area * AREA];
            return { item };
        }
        if (MARKS.has(op.kind)) {
            if (!op.refs.length) return { error: `${op.kind} needs an id` };
            const unknown = op.refs.find((ref) => !target(ref, op.kind));
            if (unknown) return { error: `unknown id ${unknown}` };
            if (op.kind === 'erase') {
                for (const ref of op.refs) erased.add(ref);
                return { item: { ...item, ids: op.refs } };
            }
            if (op.refs.length > 1) return { error: `${op.kind} takes one id` };
            const b = bounds(items.get(op.refs[0]));
            const [w, h] = b.round ? [2 * b.r, 2 * b.r] : [b.w, b.h];
            // A highlight washes 20px past its item's box; the pointer's tip stops 12px right of it, at its middle.
            if (op.kind === 'highlight')
                return { item: { ...item, at: b.c, w: w + 40, h: h + 40 } };
            item.from = pointer;
            pointer = item.at = [b.c[0] + w / 2 + 12, b.c[1]];
            return { item };
        }
        // Points in a fresh area start at its top left.
        const placed = ([x, y]) => [x, y + area * AREA];
        if (op.kind === 'line' || op.kind === 'arrow') {
            if (op.from || op.to) {
                const [a, b] = [target(op.from), target(op.to)];
                if (!a || !b) return { error: `unknown id ${a ? op.to : op.from}` };
                const [ba, bb] = [bounds(a), bounds(b)];
                item.points = [edge(ba, bb.c), edge(bb, ba.c)];
            } else if (op.pts.length >= 2) item.points = op.pts.map(placed);
            else return { error: `${op.kind} needs two points or from ID to ID` };
            return { item };
        }
        if (!op.at) return { error: 'at needs X,Y' };
        item.at = placed(op.at);
        if (op.kind === 'circle') item.r = positive(op.opts.r, 90);
        if (op.kind === 'box')
            [item.w, item.h] = [positive(op.opts.w, 280), positive(op.opts.h, 160)];
        if ([item.r, item.w, item.h].some(Number.isNaN)) return { error: 'sizes must be positive' };
        if (op.kind === 'text' || op.kind === 'math') {
            if (!op.strs[0]?.trim()) return { error: `${op.kind} needs a "label"` };
            item.size = op.opts.size ?? 'm';
            if (!Object.hasOwn(TEXT_SIZES, item.size))
                return { error: `unknown size "${item.size}"` };
        }
        // A circle or box may carry a short label inside it.
        if (op.strs[0]?.trim()) item.text = op.strs[0].trim();
        if (op.kind === 'math')
            try {
                katex.renderToString(item.text, {
                    displayMode: true,
                    throwOnError: true,
                    strict: 'ignore',
                });
            } catch (error) {
                return { error: error.message };
            }
        return { item };
    }
    return {
        read(line) {
            const parsed = tokens(line);
            if (parsed.error) return parsed;
            const built = build(parsed.op);
            if (built.item) items.set(built.item.id, built.item);
            return built;
        },
    };
}
