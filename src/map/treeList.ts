import type { CSSProperties } from 'react';
type LearningTree = { id: string; parent: string | null; created: number };
export const localDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export function treeGroups<T extends LearningTree>(trees: readonly T[], now = new Date()) {
    const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Older'].map((label) => ({
        label,
        trees: [] as { tree: T; branches: number; spine: number[] }[],
    }));
    // Spine: one tick per conversation in its branch ink; conversationAddresses yields each tree trunk first, then address order.
    const spines = new Map<string, number[]>();
    let ticks: number[] = [];
    for (const [id, { address, ink }] of conversationAddresses(trees)) {
        if (address === '1') spines.set(id, (ticks = []));
        ticks.push(ink);
    }
    for (const tree of trees.filter((t) => !t.parent).sort((a, b) => b.created - a.created)) {
        const spine = spines.get(tree.id)!;
        const age = localDay(now) - localDay(new Date(tree.created));
        groups[age <= 0 ? 0 : age === 1 ? 1 : age <= 7 ? 2 : 3].trees.push({
            tree,
            branches: spine.length - 1,
            spine,
        });
    }
    return groups.filter((group) => group.trees.length);
}

// Library search matches root titles only; branches stay so a matched tree keeps its counts.
export function librarySearch<T extends { parent: string | null; title: string }>(
    trees: readonly T[],
    query: string,
) {
    const q = query.trim().toLocaleLowerCase();
    return trees.filter((t) => t.parent || t.title.toLocaleLowerCase().includes(q));
}
export const volumeCounts = (branches: number) =>
    `${branches + 1} ${branches ? 'conversations' : 'conversation'} · ${branches} ${branches === 1 ? 'branch' : 'branches'}`;

// Ink of sibling i of n under a parent on ink p: the trunk's children take 1–4 repeating; an only child keeps p;
// other siblings take the three inks other than p in ascending order, then p, repeating.
const forkInk = (p: number, i: number, n: number) =>
    !p ? (i % 4) + 1 : n === 1 ? p : [1, 2, 3, 4].filter((ink) => ink !== p).concat(p)[i % 4];

// Addresses: trunk 1, children 1.1, 1.2 … in creation order (ties by id), so a later sibling never renumbers earlier ones.
// Ink: the trunk is 0 (paper); see forkInk for its descendants.
export function conversationAddresses(trees: readonly LearningTree[]) {
    const children = new Map<string | null, LearningTree[]>();
    for (const tree of trees)
        children.set(tree.parent, [...(children.get(tree.parent) ?? []), tree]);
    const known = new Set(trees.map((t) => t.id)),
        out = new Map<string, { address: string; ink: number }>();
    // A conversation whose parent is not in the list is treated as a trunk.
    for (const root of trees.filter((t) => !t.parent || !known.has(t.parent))) {
        // A stack, not recursion: deep chains must not overflow. Popping visits parents first, siblings in address order.
        const stack = [{ id: root.id, address: '1', ink: 0 }];
        for (let at = stack.pop(); at; at = stack.pop()) {
            const { id, address, ink } = at;
            out.set(id, { address, ink });
            const next = (children.get(id) ?? [])
                .sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1))
                .map((child, i, all) => ({
                    id: child.id,
                    address: `${address}.${i + 1}`,
                    ink: forkInk(ink, i, all.length),
                }));
            stack.push(...next.reverse());
        }
    }
    return out;
}
// The trunk above a conversation; a parent missing from the list ends the walk, as in conversationAddresses.
export function rootOf<T extends { parent: string | null }>(c: T, byId: ReadonlyMap<string, T>) {
    while (c.parent && byId.has(c.parent)) c = byId.get(c.parent)!;
    return c;
}
// A conversation and every descendant: what deleting it removes.
// Breadth-first, siblings in list order; grouping by parent keeps it linear in the library size.
export function subtreeIds(id: string, trees: readonly { id: string; parent: string | null }[]) {
    const children = new Map<string, string[]>();
    for (const t of trees)
        if (t.parent) {
            if (!children.has(t.parent)) children.set(t.parent, []);
            children.get(t.parent)!.push(t.id);
        }
    const ids = [id],
        seen = new Set(ids);
    for (let i = 0; i < ids.length; i++)
        for (const child of children.get(ids[i]) ?? [])
            if (!seen.has(child)) {
                seen.add(child);
                ids.push(child);
            }
    return ids;
}
// Confirmation copy for deleting a chat or branch with its descendants.
export function deletePrompt(
    deletion: { title: string; count: number; parent: string | null } | undefined,
    error = '',
) {
    const kind = deletion?.parent ? 'branch' : 'chat',
        count = deletion?.count ?? 0;
    return {
        title: `Delete ${kind} “${deletion?.title ?? ''}”?`,
        description: `${count} ${count === 1 ? 'conversation' : 'conversations'} and their messages, branches, diagrams and saved layout will be permanently deleted. Ready videos stay in Videos. Active replies and video jobs in these conversations will stop. This cannot be undone.${error ? ` Deletion failed: ${error}` : ''}`,
        actionLabel: `Delete ${kind}`,
    };
}
export const inkStyle = (ink: number) =>
    ({
        '--ink': ink ? `var(--rabbithole-ink-${ink})` : 'var(--rabbithole-paper)',
        '--ink-on': ink ? 'var(--rabbithole-ink-on)' : 'var(--rabbithole-paper-ink)',
    }) as CSSProperties;

export function markLibraryScrolling(
    element: HTMLElement,
    previous?: ReturnType<typeof setTimeout>,
) {
    element.dataset.scrolling = '';
    clearTimeout(previous);
    return setTimeout(() => delete element.dataset.scrolling, 800);
}
