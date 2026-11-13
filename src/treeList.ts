import type { CSSProperties } from 'react';
type LearningTree = { id: string; parent: string | null; created: number };
const localDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export function treeGroups<T extends LearningTree>(trees: readonly T[], now = new Date()) {
  const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Older'].map(label => ({ label, trees: [] as { tree: T; branches: number; spine: number[] }[] }));
  const children = new Map<string, T[]>();
  for (const tree of trees) if (tree.parent) {
    if (!children.has(tree.parent)) children.set(tree.parent, []);
    children.get(tree.parent)!.push(tree);
  }
  for (const tree of trees.filter(t => !t.parent).sort((a, b) => b.created - a.created)) {
    // Spine: one ink per conversation, trunk (0) first, then each first-level family in conversationAddresses order.
    const spine = [0];
    [...children.get(tree.id) ?? []].sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1)).forEach((child, i) => {
      const family = [child];
      for (let j = 0; j < family.length; j++) family.push(...(children.get(family[j].id) ?? []));
      for (const _ of family) spine.push(i % 4 + 1);
    });
    const age = localDay(now) - localDay(new Date(tree.created));
    groups[age <= 0 ? 0 : age === 1 ? 1 : age <= 7 ? 2 : 3].trees.push({ tree, branches: spine.length - 1, spine });
  }
  return groups.filter(group => group.trees.length);
}

// Addresses: trunk 1, children 1.1, 1.2 … in creation order (ties by id), so a later sibling never renumbers earlier ones.
// Ink: each first-level family takes series ink 1–4 in that order, repeating; descendants keep it; the trunk is 0 (paper).
export function conversationAddresses(trees: readonly LearningTree[]) {
  const children = new Map<string | null, LearningTree[]>();
  for (const tree of trees) children.set(tree.parent, [...(children.get(tree.parent) ?? []), tree]);
  const known = new Set(trees.map(t => t.id)), out = new Map<string, { address: string; ink: number }>();
  const walk = (parent: string, address: string, ink: number) => (children.get(parent) ?? []).sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1)).forEach((child, i) => {
    const next = { address: `${address}.${i + 1}`, ink: ink || i % 4 + 1 };
    out.set(child.id, next); walk(child.id, next.address, next.ink);
  });
  // A conversation whose parent is not in the list is treated as a trunk.
  for (const root of trees.filter(t => !t.parent || !known.has(t.parent))) { out.set(root.id, { address: '1', ink: 0 }); walk(root.id, '1', 0); }
  return out;
}
export const inkStyle = (ink: number) => ({ '--ink': ink ? `var(--treetutor-ink-${ink})` : 'var(--treetutor-paper)', '--ink-on': ink ? 'var(--treetutor-ink-on)' : 'var(--treetutor-paper-ink)' }) as CSSProperties;
