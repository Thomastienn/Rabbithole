import { placeBox, type Box, type Point } from './canvas';
import { conversationAddresses } from './treeList';

type Conversation = {
  id: string;
  parent: string | null;
  title: string;
  created: number;
  x: number | null;
  y: number | null;
  concept?: string | null;
  learnerMessages?: number;
};
export type GhostTree = {
  root: string;
  title: string;
  concepts: string[];
  // Conversation nodes on this map joined to the ghost tree by a dashed line.
  links: string[];
  // Conversations in the other tree to mark when it opens.
  matches: string[];
};

function rootsOf(trees: readonly Conversation[]) {
  const byId = new Map(trees.map((t) => [t.id, t]));
  const roots = new Map<string, string>();
  for (const t of trees) {
    let r = t;
    for (let i = 0; r.parent && byId.has(r.parent) && i < trees.length; i++)
      r = byId.get(r.parent)!;
    roots.set(t.id, r.id);
  }
  return roots;
}

// A map's ghost trees: per conversation the other tree that explored its concept most, at most five.
// `prefer` (the tree the learner came from) wins every match it takes part in, so a way back shows.
export function ghostTrees(
  trees: readonly Conversation[],
  root: string,
  prefer?: string,
): GhostTree[] {
  const roots = rootsOf(trees);
  const byId = new Map(trees.map((t) => [t.id, t]));
  const key = (concept: string) => concept.toLocaleLowerCase();
  // concept -> other root -> learner messages in that tree's conversations of the concept
  const explored = new Map<string, Map<string, number>>();
  for (const t of trees) {
    const r = roots.get(t.id)!;
    if (!t.concept || r === root) continue;
    const counts = explored.get(key(t.concept)) ?? new Map<string, number>();
    counts.set(r, (counts.get(r) ?? 0) + (t.learnerMessages ?? 0));
    explored.set(key(t.concept), counts);
  }
  const ghosts = new Map<string, { links: string[]; concepts: Set<string> }>();
  for (const t of trees) {
    if (!t.concept || roots.get(t.id) !== root) continue;
    const candidates = [...(explored.get(key(t.concept)) ?? [])];
    if (!candidates.length) continue;
    const score = ([r, messages]: [string, number]) =>
      [Number(r === prefer), messages, byId.get(r)?.created ?? 0] as const;
    const [best] = candidates.reduce((a, b) => {
      const [sa, sb] = [score(a), score(b)];
      return (sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2]) > 0 ? b : a;
    });
    const ghost = ghosts.get(best) ?? { links: [], concepts: new Set<string>() };
    ghost.links.push(t.id);
    ghost.concepts.add(key(t.concept));
    ghosts.set(best, ghost);
  }
  return [...ghosts]
    .map(([r, { links, concepts }]) => {
      const matches = trees.filter(
        (t) => roots.get(t.id) === r && t.concept && concepts.has(key(t.concept)),
      );
      return {
        root: r,
        title: byId.get(r)?.title ?? '',
        // Display the other tree's own spelling of each shared concept.
        concepts: [...new Set(matches.map((t) => t.concept!))],
        links,
        matches: matches.map((t) => t.id),
      };
    })
    .sort(
      (a, b) =>
        Number(b.root === prefer) - Number(a.root === prefer) || b.links.length - a.links.length,
    )
    .slice(0, 5);
}

export const MINIATURE = 160;
const BOX = { width: 160, height: 160 };

// A ghost tree's miniature: one dot per conversation at its saved position (or the map's default
// placement right of its parent), lines in branch family inks, scaled to fit MINIATURE pixels.
export function miniature(trees: readonly Conversation[], root: string) {
  const roots = rootsOf(trees);
  const tree = trees.filter((t) => roots.get(t.id) === root);
  const addresses = conversationAddresses(tree);
  const placed = new Map<string, Point>();
  const occupied: Box[] = [];
  for (const t of tree)
    if (t.x !== null && t.y !== null) {
      placed.set(t.id, { x: t.x, y: t.y });
      occupied.push({ x: t.x, y: t.y, ...BOX });
    }
  // Parents before children, so an unsaved child is placed beside its parent.
  const order = [...tree].sort((a, b) => a.created - b.created);
  for (let pending = order.filter((t) => !placed.has(t.id)); pending.length;) {
    const next = pending.find((t) => !t.parent || placed.has(t.parent) || !roots.has(t.parent));
    const t = next ?? pending[0];
    const parent = t.parent ? placed.get(t.parent) : undefined;
    const position = placeBox(
      parent ? { x: parent.x + BOX.width + 96, y: parent.y } : { x: 0, y: 0 },
      BOX,
      occupied,
    );
    placed.set(t.id, position);
    occupied.push({ ...position, ...BOX });
    pending = pending.filter((p) => p !== t);
  }
  const points = [...placed.values()];
  const minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - minX,
    height = Math.max(...points.map((p) => p.y)) - minY;
  const inner = MINIATURE - 16,
    scale = inner / Math.max(1, width, height);
  // Centred, so a narrow or single-conversation tree does not sit in a corner.
  const at = (id: string) => {
    const p = placed.get(id)!;
    return {
      x: 8 + (inner - width * scale) / 2 + (p.x - minX) * scale,
      y: 8 + (inner - height * scale) / 2 + (p.y - minY) * scale,
    };
  };
  const dots = tree.map((t) => ({ id: t.id, ...at(t.id), ink: addresses.get(t.id)?.ink ?? 0 }));
  const lines = tree
    .filter((t) => t.parent && placed.has(t.parent))
    .map((t) => {
      const [from, to] = [at(t.parent!), at(t.id)];
      return {
        id: t.id,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        ink: addresses.get(t.id)!.ink,
      };
    });
  return { dots, lines };
}
