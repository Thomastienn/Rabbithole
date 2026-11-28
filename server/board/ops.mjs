// Board op lines (docs/board-spec.md, Op language): `<id> <kind> <args> [key=value]` on a fixed
// 1600×900 board (ADR 0028). Tokens follow prototype/board-placement.
import katex from 'katex';
import { COMPONENTS, PARENTS, SKETCHES, component, child, layout } from './components.mjs';
import { componentParts, partsBox } from '../../src/board/layout.ts';

const KINDS = new Set([
    'circle',
    'box',
    'dot',
    'line',
    'arrow',
    'text',
    ...COMPONENTS,
    ...Object.keys(PARENTS),
    'math',
    'highlight',
    'pointer',
    'erase',
    'clear',
    'page',
    'open',
    'stroke',
]);
// Kinds that name other items instead of placing one; they cannot be named themselves (only `open` names a page).
const MARKS = new Set(['highlight', 'pointer', 'erase', 'clear', 'page', 'open']);
// Each board page (ADR 0029) is a 1600×900 space this far below the page made before it; the view shows one.
const AREA = 900;
// The page a board starts on when it draws before any `page` op.
const FIRST = 'first';
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
    const op = { strs: [], pts: [], vals: [], refs: [], opts: {} };
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
        } else if (w === 'from' || w === 'to' || w === 'on' || w === 'in' || w === 'under') {
            const key = w === 'in' ? 'on' : w;
            op[key] = rest[++i]?.w;
            if (!op[key]) return { error: `${w} needs an id` };
        } else if (point(w)) op.pts.push(point(w));
        else if (/^-?\d*\.?\d+(\/\d*\.?\d+)?$/.test(w)) op.vals.push(w);
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
// On the area whose top edge is at `top`.
const onBoard = (b, top) => b.x >= 0 && b.y >= top && b.x + b.w <= W && b.y + b.h <= top + H;

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
        // A drawn line may cross shapes and only collides with text or math; a connector collides with anything.
        if (!connectors.has(l.id) && o.kind !== 'text' && o.kind !== 'math') return false;
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
function guard(item, others, connectors, top) {
    const free = (it) => onBoard(box(it), top) && !others.some((o) => overlaps(it, o, connectors));
    // A connector stays joined to its items, so it is never moved.
    if (connectors.has(item.id) || free(item)) return item;
    const b = box(item);
    const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
    const spots = [];
    for (let x = b.w / 2; x <= W - b.w / 2; x += STEP)
        for (let y = top + b.h / 2; y <= top + H - b.h / 2; y += STEP)
            spots.push([Math.round(x - cx), Math.round(y - cy)]);
    spots.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
    let fallback;
    for (const [dx, dy] of spots) {
        const moved = shift(item, dx, dy);
        if (free(moved)) return moved;
        if (!fallback && onBoard(box(moved), top)) fallback = moved;
    }
    // shortcut: a full board keeps the nearest on-board spot even if it overlaps; upgrade if boards fill up.
    return fallback ?? item;
}

// The board's items so far; `read` turns one op line into a drawable item, moved by the guard when it
// overlaps or leaves the board, or the reason it was skipped.
export function boardOps() {
    const items = new Map();
    const connectors = new Set();
    // Each page's top edge and title, the open page, and where the pointer last stopped (a page it lands on starts
    // it at its centre).
    const pages = new Map();
    let open,
        pointer = [800, 450];
    const top = () => pages.get(open)?.top ?? 0;
    // Opens a new page after the others, its parent the page open now; untitled, it shows as "Page N".
    const add = (id, title, from) => {
        const page = { top: pages.size * AREA, title: title || `Page ${pages.size + 1}` };
        if (open) page.parent = open;
        if (from) page.origin = from;
        pages.set(id, page);
        open = id;
        pointer = [800, page.top + 450];
        return page;
    };
    const erased = new Set();
    // The page each item was drawn on.
    const where = new Map();
    // The space an item takes. A flow, tree, table, Venn or sketch child has no place of its own: it takes the space
    // its parts take in its component's layout over the children still on the board, as the learner sees it.
    const span = (item) =>
        item.on && !item.at
            ? partsBox(componentParts([...items.values()], erased).get(item.id))
            : bounds(item);
    // An item still on the board that ops can name; erase can also name a highlight. Only erase reaches other
    // pages, since the view shows the open one, and children on axes or a number line, which have no laid-out space.
    const target = (id, kind) => {
        const item = items.get(id);
        const named = !MARKS.has(item?.kind) || (kind === 'erase' && item.kind === 'highlight');
        const here = () =>
            kind === 'erase' || ((!item.on || (!item.at && span(item))) && where.get(id) === open);
        return item && named && !erased.has(id) && here() ? item : undefined;
    };
    const positive = (value, fallback) =>
        value === undefined ? fallback : Number(value) > 0 ? Number(value) : NaN;
    function build(op) {
        if (items.has(op.id) || pages.has(op.id))
            return { error: `id ${op.id} is already on the board` };
        const item = { id: op.id, kind: op.kind };
        if (op.opts.look !== undefined) {
            if (!LOOKS.has(op.opts.look)) return { error: `unknown look "${op.opts.look}"` };
            item.look = op.opts.look;
        }
        // An old `clear` reads as a new untitled page, so boards saved before pages replay unchanged.
        if (op.kind === 'page' || op.kind === 'clear') {
            const from = op.opts.from;
            if (from !== undefined && !target(from)) return { error: `unknown id ${from}` };
            return {
                item: { ...item, ...add(op.id, op.kind === 'page' && op.strs[0]?.trim(), from) },
            };
        }
        if (op.kind === 'open') {
            const [ref, extra] = op.refs;
            if (!pages.has(ref) || extra) return { error: `open needs one page id` };
            open = ref;
            pointer = [800, top() + 450];
            return { item: { ...item, page: ref, top: top() } };
        }
        if (MARKS.has(op.kind)) {
            if (!op.refs.length) return { error: `${op.kind} needs an id` };
            const unknown = op.refs.find((ref) => !target(ref, op.kind));
            if (unknown) return { error: `unknown id ${unknown}` };
            if (op.kind === 'erase') {
                // A component's children go with it, and a tree node's subtree with the node. Items come in
                // drawing order, after their parents, so one pass reaches every descendant.
                const gone = new Set(op.refs);
                for (const i of items.values())
                    if (!erased.has(i.id) && (gone.has(i.on) || gone.has(i.under))) gone.add(i.id);
                for (const id of gone) erased.add(id);
                return { item: { ...item, ids: [...gone] } };
            }
            if (op.refs.length > 1) return { error: `${op.kind} takes one id` };
            const b = span(items.get(op.refs[0]));
            const [w, h] = b.round ? [2 * b.r, 2 * b.r] : [b.w, b.h];
            // `names` keeps the item a highlight or pointer names, for the spotlight (docs/board-sketches-spec.md).
            item.names = [op.refs[0]];
            // A highlight washes 20px past its item's box; the pointer's tip stops 12px right of it, at its middle.
            if (op.kind === 'highlight')
                return { item: { ...item, at: b.c, w: w + 40, h: h + 40 } };
            item.from = pointer;
            pointer = item.at = [b.c[0] + w / 2 + 12, b.c[1]];
            return { item };
        }
        if (op.kind === 'stroke') {
            if (!op.pts.length) return { error: 'stroke needs a point' };
            return { item: { ...item, points: op.pts } };
        }
        // Points on a page start at its top left.
        const placed = ([x, y]) => [x, y + top()];
        if ((op.kind === 'line' || op.kind === 'arrow') && !op.on) {
            if (op.from || op.to) {
                const [a, b] = [target(op.from), target(op.to)];
                if (!a || !b) return { error: `unknown id ${a ? op.to : op.from}` };
                const [ba, bb] = [span(a), span(b)];
                item.points = [edge(ba, bb.c), edge(bb, ba.c)];
                item.names = [op.from, op.to];
                connectors.add(op.id);
            } else if (op.pts.length >= 2) item.points = op.pts.map(placed);
            else return { error: `${op.kind} needs two points or from ID to ID` };
            return { item };
        }
        if (op.on || Object.hasOwn(PARENTS, op.kind)) {
            // Erased items stay in `items` for replay, so a node's parent is looked for among the rest.
            const live = new Map([...items].filter(([id]) => !erased.has(id)));
            const error = child(op, item, target(op.on), live);
            if (error) return { error };
            // A code line past the last row its block fits is left out (src/board/layout.ts).
            if (op.kind === 'line' && !componentParts([...live.values(), item]).has(item.id))
                return { error: `no room for ${op.id} in ${op.on}` };
            return { item };
        }
        if (!op.at) return { error: 'at needs X,Y' };
        item.at = placed(op.at);
        if (COMPONENTS.has(op.kind)) {
            const error = component(op, item);
            return error ? { error } : { item };
        }
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
            if (!built.item) return built;
            // The first item drawn on an empty board starts its first page.
            if (!open) add(FIRST);
            where.set(built.item.id, open);
            // Marks are not placed, and a component's children stay inside its box, unguarded; the rest keep
            // clear of what is still on the open page, with a component as one item at its box.
            if (built.item.on || MARKS.has(built.item.kind)) {
                items.set(built.item.id, built.item);
                return built;
            }
            const others = [...items.values()].filter(
                (o) => !o.on && !MARKS.has(o.kind) && !erased.has(o.id) && where.get(o.id) === open,
            );
            // The learner's strokes stay where they were drawn.
            const guarded =
                built.item.kind === 'stroke'
                    ? built.item
                    : guard(built.item, others, connectors, top());
            const item = COMPONENTS.has(guarded.kind) ? layout(guarded) : guarded;
            items.set(item.id, item);
            return guarded === built.item ? { item } : { item, moved: true };
        },
        has: (id) => items.has(id),
        open: () => open,
        // The page index each model turn starts with (ADR 0029): every page with its parent, `from` item and the
        // ids and texts of what is still on it; kinds and coordinates are left out to keep it short, except that a
        // sketch shows its kind with its children's ids and labels.
        index() {
            const lines = [...pages].map(([id, page]) => {
                const live = [...items.values()].filter(
                    (i) => where.get(i.id) === id && !MARKS.has(i.kind) && !erased.has(i.id),
                );
                const name = (i) => {
                    const text =
                        i.text ??
                        i.whole ??
                        (i.cells ?? i.cols ?? i.sets ?? i.vs ?? i.actors)?.join('|');
                    return text ? `${i.id} "${text}"` : i.id;
                };
                const sketch = new Set(live.filter((i) => SKETCHES.has(i.kind)).map((i) => i.id));
                const on = live
                    .filter((i) => !sketch.has(i.on))
                    .map((i) => {
                        if (!sketch.has(i.id)) return name(i);
                        const kids = live.filter((c) => c.on === i.id).map(name);
                        return `${name(i)} ${i.kind}${kids.length ? ` (${kids.join(', ')})` : ''}`;
                    });
                const head = [
                    `${id === open ? '* ' : ''}${id} "${page.title}"`,
                    page.parent && `parent=${page.parent}`,
                    page.origin && `from=${page.origin}`,
                ];
                return `${head.filter(Boolean).join(' ')}: ${on.join(', ') || '(empty)'}`;
            });
            return `BOARD PAGES (* marks the open page)\n${lines.join('\n') || '(none yet)'}`;
        },
        // The board as it stands, for a still snapshot: no erased items, erases or passed pointers, highlights
        // under the rest, and the page and open ops that say which page it shows.
        items: () =>
            [...items.values()]
                .filter((i) => !erased.has(i.id) && i.kind !== 'erase' && i.kind !== 'pointer')
                .sort((a, b) => +(b.kind === 'highlight') - +(a.kind === 'highlight')),
        // What a learner stroke marks (docs/board-spec.md, Learner pen): a closed loop circles the items whose
        // centres it encloses; otherwise it points at the item nearest its end, within 40 board pixels.
        // `page` is the page on the learner's screen, the open page unless they opened another mid-reply.
        mark(points, page = open) {
            // Only items still on that page with a place to circle or point at; a plot is a path inside its axes.
            const targets = [...items.values()].filter(
                (i) =>
                    where.get(i.id) === page &&
                    i.kind !== 'stroke' &&
                    !MARKS.has(i.kind) &&
                    !erased.has(i.id) &&
                    (i.at || i.points || (i.on && span(i))),
            );
            const [start, end] = [points[0], points.at(-1)];
            const box = bounds({ points });
            const closed =
                points.length > 2 &&
                Math.hypot(end[0] - start[0], end[1] - start[1]) <=
                    Math.max(60, 0.3 * Math.hypot(box.w, box.h));
            const circled = closed
                ? targets.filter((i) => inside(span(i).c, points)).map((i) => i.id)
                : [];
            // A circled component stands for its children inside the loop.
            const whole = circled.filter((id) => !circled.includes(items.get(id).on));
            if (circled.length) return { verb: 'circled', ids: whole };
            const [near] = targets
                .map((i) => ({ id: i.id, d: gap(span(i), end) }))
                .filter(({ d }) => d <= 40)
                .sort((a, b) => a.d - b.d);
            return near ? { verb: 'pointed at', ids: [near.id] } : null;
        },
    };
}
