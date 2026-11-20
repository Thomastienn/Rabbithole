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
      item.stubs = item.sources.map((child) => ({ child, beneath: counts.get(child.id) ?? 0 }));
  }
  return result;
}

// Map line routing (epic Rabbithole-ldr): out of the source ring sideways, a 45° turn, a vertical run
// through the gutter centre when the rise exceeds the run, a 45° turn and sideways into the target ring.
// shortcut: only the two linked cards are avoided, not third cards in the gutter; pass all boxes if they collide.
export function routeLine(source: Point, target: Point, from: Box, to: Box): Point[] {
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
  if (!facing) return bend(Math.max(start.x, end.x) + 40, Math.min(16, rise / 2));
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
  return bend(middle, Math.min(16, run / 2, rise / 2));
}

export const linePath = (points: Point[]) => `M${points.map((p) => `${p.x} ${p.y}`).join('L')}`;
