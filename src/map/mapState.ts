import type { Summary, Source } from './TreeOverview';
import type { ConversationNode } from './Conversation';
import type { Box, Viewport } from './canvas';
import { conversationAddresses } from './treeList.ts';

export type Open = (id: string, source?: Source, message?: string, artifact?: string) => void;

export const snippet = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
};

export const sourceOf = (t: Summary): Source =>
  t.line !== undefined
    ? {
        messageId: t.messageId!,
        text: t.passage!,
        artifactId: t.artifactId!,
        line: t.line,
        start: t.start!,
        end: t.end!,
      }
    : t.artifactId
      ? {
          messageId: t.messageId!,
          text: t.passage!,
          artifactId: t.artifactId,
          label: t.label!,
          explanation: t.explanation!,
        }
      : { messageId: t.messageId!, start: t.start!, end: t.end!, text: t.passage! };

export function revealAddedBranches(
  previous: ReadonlySet<string>,
  added: Summary[],
  trees: Summary[],
) {
  const next = new Set(previous);
  for (const child of added) {
    let parent = child.parent;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      next.delete(parent);
      parent = trees.find((t) => t.id === parent)?.parent ?? null;
    }
  }
  return next;
}

export function keepCurrentFolded(root: string, trees: Summary[], current?: string) {
  const path = new Set<string>();
  let id = current;
  while (id && !path.has(id)) {
    path.add(id);
    id = trees.find((t) => t.id === id)?.parent ?? undefined;
  }
  if (!path.has(root)) return;
  return new Set(
    trees
      .filter((t) => t.parent && t.parent !== current && path.has(t.parent) && !path.has(t.id))
      .map((t) => t.id),
  );
}

export function familyLegend(
  root: string,
  trees: Summary[],
  addresses = conversationAddresses(trees),
) {
  return [...addresses].flatMap(([id, address]) => {
    const t = trees.find((t) => t.id === id);
    return t && (id === root || t.parent === root) ? [{ ...t, ...address }] : [];
  });
}

export function branchEdges(
  hierarchy: { hidden: boolean; conversation: Summary }[],
  folded: ReadonlySet<string>,
  focusedPath: ReadonlySet<string>,
  addresses: ReturnType<typeof conversationAddresses>,
  createdBranches: ReadonlyMap<string, number>,
) {
  return hierarchy
    .filter((n) => !n.hidden && n.conversation.parent && !folded.has(n.conversation.parent))
    .map((n) => {
      const t = n.conversation;
      return {
        id: t.id,
        type: 'branch',
        className: focusedPath.has(t.id) ? 'branch-focused' : undefined,
        source: t.parent!,
        sourceHandle: t.id,
        target: t.id,
        ariaLabel: `Passage “${t.passage}” to ${t.title}`,
        data: {
          messageId: t.messageId,
          start: t.start,
          end: t.end,
          created: createdBranches.get(t.id),
          ink: addresses.get(t.id)?.ink ?? 0,
        },
      };
    });
}

export function reconcileNodes(previous: ConversationNode[], desired: ConversationNode[]) {
  const byId = new Map(previous.map((node) => [node.id, node]));
  return desired.map((node) => {
    const old = byId.get(node.id);
    if (
      old &&
      old.data.sources.length === node.data.sources.length &&
      node.data.sources.every((source, i) => source === old.data.sources[i])
    )
      node.data.sources = old.data.sources;
    if (
      old &&
      old.data.stubs.length === node.data.stubs.length &&
      node.data.stubs.every(
        (stub, i) =>
          stub.child === old.data.stubs[i].child &&
          stub.beneath === old.data.stubs[i].beneath &&
          stub.address === old.data.stubs[i].address &&
          stub.ink === old.data.stubs[i].ink,
      )
    )
      node.data.stubs = old.data.stubs;
    if (
      old &&
      old.hidden === node.hidden &&
      (Object.keys(node.data) as (keyof ConversationNode['data'])[]).every(
        (key) => old.data[key] === node.data[key],
      )
    )
      return old;
    return { ...old, ...node, position: old?.position ?? node.position };
  });
}

export function keyMovement(key: string, shift: boolean, canvas: boolean) {
  const delta: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  if (!Object.hasOwn(delta, key)) return;
  const step = canvas ? -(shift ? 300 : 100) : shift ? 100 : 10;
  return { x: delta[key].x * step, y: delta[key].y * step };
}

export function revealViewport(
  view: Viewport,
  node: Box,
  width: number,
  height: number,
  toolbar?: { top: number; height: number },
) {
  const top = toolbar ? toolbar.height / 2 : 0;
  const rightLimit = width - top;
  const bottomLimit = toolbar ? toolbar.top - top : height;
  const availableHeight = bottomLimit - top;
  // Scale a tall transcript to the available map; keep its title reachable at 20%.
  const zoom = Math.max(
    0.2,
    Math.min(view.zoom, (rightLimit - top) / node.width, availableHeight / node.height),
  );
  const left = node.x * zoom + view.x,
    y = node.y * zoom + view.y;
  const right = left + node.width * zoom,
    bottom = y + node.height * zoom;
  const dx = left < top ? top - left : right > rightLimit ? rightLimit - right : 0;
  const dy =
    y < top || node.height * zoom > availableHeight
      ? top - y
      : bottom > bottomLimit
        ? bottomLimit - bottom
        : 0;
  return { x: view.x + dx, y: view.y + dy, zoom };
}

export function rootOf(id: string, trees: Summary[]) {
  const seen = new Set<string>();
  for (
    let t = trees.find((t) => t.id === id);
    t && !seen.has(t.id);
    t = trees.find((p) => p.id === t!.parent)
  ) {
    seen.add(t.id);
    if (!t.parent) return t.id;
  }
}

export function restoredTree(id: string, trees: Summary[], focus?: string, read = false) {
  const layout = trees.find((t) => t.id === id)?.layout;
  const saved =
    focus ?? (layout?.selected && rootOf(layout.selected, trees) === id ? layout.selected : id);
  return {
    saved,
    overview: !focus && !read && layout?.panel !== 'beside' && layout?.panel !== 'expanded',
    expanded: layout?.panel === 'expanded',
  };
}
