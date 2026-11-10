type LearningTree = { id: string; parent: string | null; created: number };
const localDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export function treeGroups<T extends LearningTree>(trees: readonly T[], now = new Date()) {
  const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Older'].map(label => ({ label, trees: [] as { tree: T; branches: number }[] }));
  const children = new Map<string, string[]>();
  for (const tree of trees) if (tree.parent) {
    if (!children.has(tree.parent)) children.set(tree.parent, []);
    children.get(tree.parent)!.push(tree.id);
  }
  for (const tree of trees.filter(t => !t.parent).sort((a, b) => b.created - a.created)) {
    const descendants = [...(children.get(tree.id) ?? [])];
    for (let i = 0; i < descendants.length; i++) descendants.push(...(children.get(descendants[i]) ?? []));
    const age = localDay(now) - localDay(new Date(tree.created));
    groups[age <= 0 ? 0 : age === 1 ? 1 : age <= 7 ? 2 : 3].trees.push({ tree, branches: descendants.length });
  }
  return groups.filter(group => group.trees.length);
}
