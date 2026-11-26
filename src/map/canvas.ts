export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type PlacedBox = Box & {
    id: string;
    parent: string | null;
    hidden?: boolean;
    dragging?: boolean;
};
export type Viewport = Point & { zoom: number };
export const MIN_ZOOM = 0.001;

// Whole percent, with one decimal below 1% so extreme zoom-out never reads 0%.
export const zoomLabel = (zoom: number) =>
    `${zoom < 0.01 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%`;
export function parseViewport(value: string | null): Viewport | undefined {
    try {
        const view = JSON.parse(value ?? 'null');
        if (
            view &&
            Number.isFinite(view.x) &&
            Number.isFinite(view.y) &&
            Number.isFinite(view.zoom) &&
            view.zoom >= MIN_ZOOM &&
            view.zoom <= 1.5
        )
            return { x: view.x, y: view.y, zoom: view.zoom };
    } catch {
        /* An invalid saved view falls back to fitting the tree. */
    }
}

export function placeBox(
    preferred: Point,
    size: { width: number; height: number },
    occupied: Box[],
): Point {
    const position = { ...preferred };
    const gap = 48;
    for (;;) {
        const overlap = occupied.find(
            (box) =>
                position.x < box.x + box.width + gap &&
                position.x + size.width + gap > box.x &&
                position.y < box.y + box.height + gap &&
                position.y + size.height + gap > box.y,
        );
        if (!overlap) return position;
        position.y = overlap.y + overlap.height + gap;
    }
}

// One map column: a full-map card (260px) and its gutter (mockup Map: cards 320px apart).
export const COLUMN = 320;
// The dock and narrow screens keep 160px cards (mockups Read and Narrow: cards 248px apart).
export const DOCK_COLUMN = 248;

// Tidy layout (mockup Map): every card is centred on the stack of its children's subtrees, which never overlap,
// one column per depth. Boxes come in sibling order; slots are relative to the root at 0, 0.
export function tidySlots(
    root: string,
    boxes: { id: string; parent: string | null; height: number }[],
    column = COLUMN,
    gap = 48,
) {
    const children = new Map<string, typeof boxes>();
    for (const box of boxes)
        if (box.parent) children.set(box.parent, [...(children.get(box.parent) ?? []), box]);
    const extents = new Map<string, number>();
    const extent = (box: (typeof boxes)[number]): number => {
        const list = children.get(box.id) ?? [];
        const stack = list.reduce((sum, child) => sum + extent(child), gap * (list.length - 1));
        const size = Math.max(box.height, stack);
        extents.set(box.id, size);
        return size;
    };
    const slots = new Map<string, Point>();
    const place = (box: (typeof boxes)[number], x: number, top: number) => {
        const size = extents.get(box.id)!,
            list = children.get(box.id) ?? [];
        slots.set(box.id, { x, y: top + (size - box.height) / 2 });
        let y =
            top +
            (size - list.reduce((sum, c) => sum + extents.get(c.id)!, gap * (list.length - 1))) / 2;
        for (const child of list) {
            place(child, x + column, y);
            y += extents.get(child.id)! + gap;
        }
    };
    const start = boxes.find((box) => box.id === root);
    if (start) place(start, 0, -(extent(start) - start.height) / 2);
    return slots;
}

// Saved positions from narrower cards, or a card widening as the chat dock closes, can leave a child under its parent's right edge: push that subtree right, parents first.
// Callers hand the moved ids to the reveal rule, which pushes down any card a moved subtree now covers.
export function clearParents(boxes: PlacedBox[], gap = 48) {
    const next = new Map(boxes.map((box) => [box.id, { ...box }]));
    const children = new Map<string, string[]>();
    for (const box of boxes)
        if (box.parent) children.set(box.parent, [...(children.get(box.parent) ?? []), box.id]);
    const moved: Record<string, Point> = {};
    const queue = boxes.filter((box) => !box.parent || !next.has(box.parent)).map((b) => b.id);
    for (const id of queue) {
        queue.push(...(children.get(id) ?? []));
        const box = next.get(id)!,
            parent = box.parent ? next.get(box.parent) : undefined;
        if (!parent || box.hidden || parent.hidden || box.dragging) continue;
        const right = parent.x + parent.width + gap;
        const covers = box.y < parent.y + parent.height && box.y + box.height > parent.y;
        if (!covers || box.x <= parent.x || box.x >= right) continue;
        const dx = right - box.x;
        const subtree = [id];
        for (const child of subtree) {
            subtree.push(...(children.get(child) ?? []));
            const b = next.get(child)!;
            b.x += dx;
            moved[child] = { x: b.x, y: b.y };
        }
    }
    return moved;
}

// Only collisions connected to growth/reveal can move a subtree; manual layout stays intact.
export function offsetCoveredBoxes(
    boxes: PlacedBox[],
    growing: string[],
    revealed: string[] = [],
): Record<string, Point> {
    const next = new Map(boxes.map((box) => [box.id, { ...box }]));
    const visible = boxes.filter((box) => !box.hidden).map((box) => next.get(box.id)!);
    const affected = new Set(
        [...growing, ...revealed].filter((id) => next.has(id) && !next.get(id)!.hidden),
    );
    const fixed = new Set([
        ...growing.filter((id) => next.has(id) && !next.get(id)!.hidden),
        ...boxes.filter((box) => box.dragging).map((box) => box.id),
    ]);
    const children = new Map<string, string[]>();
    for (const box of boxes)
        if (box.parent) children.set(box.parent, [...(children.get(box.parent) ?? []), box.id]);
    const subtree = (id: string) => {
        const ids = new Set([id]);
        for (const child of ids)
            for (const descendant of children.get(child) ?? []) ids.add(descendant);
        return ids;
    };
    const moved: Record<string, Point> = {};
    const group = new Map<string, string>();
    const order = new Map([...visible].sort((a, b) => a.y - b.y).map((box, i) => [box.id, i]));
    for (;;) {
        visible.sort((a, b) => a.y - b.y || Number(fixed.has(b.id)) - Number(fixed.has(a.id)));
        let shifted = false;
        for (let i = 0; i < visible.length && !shifted; i++) {
            const upper = visible[i];
            for (let j = i + 1; j < visible.length; j++) {
                const lower = visible[j];
                if (lower.y >= upper.y + upper.height) break;
                if (!affected.has(upper.id) && !affected.has(lower.id)) continue;
                if (lower.x >= upper.x + upper.width || lower.x + lower.width <= upper.x) continue;
                let target = lower,
                    obstacle = upper;
                const upperGroup = group.get(upper.id),
                    lowerGroup = group.get(lower.id);
                // Keep a stable order for moving groups, including manually interleaved subtrees.
                if (upperGroup && lowerGroup && order.get(lowerGroup)! < order.get(upperGroup)!) {
                    target = upper;
                    obstacle = lower;
                }
                const root = group.get(target.id) ?? target.id;
                const ids = subtree(root);
                if (ids.has(obstacle.id) || [...ids].some((id) => fixed.has(id))) continue;
                const dy = obstacle.y + obstacle.height + 48 - target.y;
                for (const id of ids) {
                    const box = next.get(id)!;
                    box.y += dy;
                    moved[id] = { x: box.x, y: box.y };
                    affected.add(id);
                    group.set(id, root);
                }
                shifted = true;
                break;
            }
        }
        if (!shifted) return moved;
    }
}

export type VimAction =
    'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'ArrowRight' | 'zoomIn' | 'zoomOut' | 'fit';
const vimKeys: Record<string, VimAction> = {
    h: 'ArrowLeft',
    j: 'ArrowDown',
    k: 'ArrowUp',
    l: 'ArrowRight',
    H: 'ArrowLeft',
    J: 'ArrowDown',
    K: 'ArrowUp',
    L: 'ArrowRight',
    '=': 'zoomIn',
    '+': 'zoomIn',
    '-': 'zoomOut',
    f: 'fit',
};

// Agreed opt-in aliases (docs/vim-bindings-proposal.md); the caller checks focus scope and open dialogs/menus.
export function vimAction(e: {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    defaultPrevented: boolean;
    isComposing?: boolean;
    keyCode?: number;
}): VimAction | undefined {
    if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.defaultPrevented ||
        e.isComposing ||
        e.keyCode === 229
    )
        return;
    return Object.hasOwn(vimKeys, e.key) ? vimKeys[e.key] : undefined;
}

// Breadth-first from root; a fold hides every descendant and leaves one stub per direct child.
export function foldHierarchy<T extends { id: string; parent: string | null }>(
    root: string,
    trees: readonly T[],
    folded: ReadonlySet<string>,
) {
    const byId = new Map(trees.map((t) => [t.id, t]));
    const children = new Map<string, T[]>();
    for (const t of trees)
        if (t.parent) children.set(t.parent, [...(children.get(t.parent) ?? []), t]);
    for (const list of children.values()) list.reverse();
    const queue = [root],
        seen = new Set<string>(),
        hidden = new Set<string>();
    const result: {
        conversation: T;
        sources: T[];
        hidden: boolean;
        stubs: { child: T; beneath: number }[];
    }[] = [];
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i],
            conversation = byId.get(id);
        if (!conversation || seen.has(id)) continue;
        seen.add(id);
        const sources = children.get(id) ?? [];
        if (hidden.has(id) || folded.has(id)) for (const child of sources) hidden.add(child.id);
        result.push({ conversation, sources, hidden: hidden.has(id), stubs: [] });
        queue.push(...sources.map((t) => t.id));
    }
    const counts = new Map<string, number>();
    for (const item of [...result].reverse()) {
        const count = item.sources.reduce((sum, t) => sum + 1 + (counts.get(t.id) ?? 0), 0);
        counts.set(item.conversation.id, count);
        if (!item.hidden && folded.has(item.conversation.id))
            item.stubs = item.sources.map((child) => ({
                child,
                beneath: counts.get(child.id) ?? 0,
            }));
    }
    return result;
}

// Map line routing (epic Rabbithole-ldr): out of the source ring sideways, a 45° turn, a vertical run
// through the gutter centre (moved by `lane`, see branchLanes) when the rise exceeds the run, a 45° turn and
// sideways into the target ring.
// shortcut: only the two linked cards are avoided, not third cards in the gutter; pass all boxes if they collide.
export function routeLine(source: Point, target: Point, from: Box, to: Box, lane = 0): Point[] {
    const right = (box: Box) => box.x + box.width;
    // A child left of its parent mirrors the rule; overlapping columns (above or below) run outside both cards.
    const facing = to.x >= right(from) ? 1 : right(to) <= from.x ? -1 : 0;
    const start = { x: facing < 0 ? from.x : right(from), y: source.y };
    const end = { x: facing > 0 ? to.x : right(to), y: target.y };
    const rise = Math.abs(end.y - start.y),
        up = Math.sign(end.y - start.y);
    if (rise < 1) return [start, { x: end.x, y: start.y }];
    const bend = (x: number, turn: number) => [
        start,
        { x: x - (facing || 1) * turn, y: start.y },
        { x, y: start.y + up * turn },
        { x, y: end.y - up * turn },
        { x: x + (facing || -1) * turn, y: end.y },
        end,
    ];
    if (!facing) return bend(Math.max(start.x, end.x) + 40 + lane, Math.min(16, rise / 2));
    const middle = (start.x + end.x) / 2,
        run = Math.abs(end.x - start.x);
    // A rise within the run is one 45° diagonal centred in the gutter, with a short level stub at each ring.
    if (rise <= run - 16)
        return [
            start,
            { x: middle - (facing * rise) / 2, y: start.y },
            { x: middle + (facing * rise) / 2, y: end.y },
            end,
        ];
    return bend(middle + lane, Math.min(16, run / 2, rise / 2));
}

// Room for a 7px line plus a 5px gap.
export const LANE = 12;

// Sibling lines whose vertical runs (routed with lane 0) lie in each other's gutter and overlap in height spread
// into lanes LANE apart around their mean run. Lanes follow child ring height so lines never cross: the run to the farther child lies farther from
// the child cards, clear of the nearer child's way in.
// shortcut: lanes are not squeezed to fit, so many siblings in a narrow gutter can reach the cards; fit them if that shows up.
export function branchLanes(lines: { id: string; parent: string; points: Point[] }[]) {
    const runs = lines.flatMap(({ id, parent, points }) => {
        const i = points.findIndex(
            (p, i) => i > 0 && p.x === points[i - 1].x && p.y !== points[i - 1].y,
        );
        if (i < 0) return [];
        const { x } = points[i],
            end = points.at(-1)!,
            down = points[i].y > points[i - 1].y;
        // Sorting by key sorts lanes left to right.
        const key = (end.x > x ? -1 : 1) * (down ? 1 : -1) * end.y;
        const [top, bottom] = [points[i - 1].y, points[i].y].sort((a, b) => a - b);
        const xs = points.map((p) => p.x);
        return [{ id, parent, x, top, bottom, key, left: Math.min(...xs), right: Math.max(...xs) }];
    });
    type Run = (typeof runs)[number];
    // Cards out of line still share a gutter; a child in a farther column does not.
    const within = (run: Run, x: number) => x > run.left - LANE && x < run.right + LANE;
    const touches = (a: Run, b: Run) =>
        a !== b &&
        a.parent === b.parent &&
        within(a, b.x) &&
        within(b, a.x) &&
        a.top < b.bottom + LANE &&
        b.top < a.bottom + LANE;
    const lanes: Record<string, number> = {};
    const placed = new Set<Run>();
    for (const run of runs) {
        if (placed.has(run)) continue;
        const group = [run];
        for (const member of group)
            for (const other of runs)
                if (!group.includes(other) && touches(member, other)) group.push(other);
        group.forEach((member) => placed.add(member));
        if (group.length < 2) continue;
        const centre = group.reduce((sum, r) => sum + r.x, 0) / group.length;
        group
            .sort((a, b) => a.key - b.key)
            .forEach((r, i) => (lanes[r.id] = centre + (i - (group.length - 1) / 2) * LANE - r.x));
    }
    return lanes;
}

export const linePath = (points: Point[]) => `M${points.map((p) => `${p.x} ${p.y}`).join('L')}`;
