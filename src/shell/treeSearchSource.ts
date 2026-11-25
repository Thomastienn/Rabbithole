import { serverFetch } from '../serverAccess';
import type { Summary } from '../map/TreeOverview';
import { localDay, subtreeIds } from '../map/treeList';

export type SearchResult = {
    conversation: string;
    root: string;
    tree: string;
    address: string;
    title: string;
    field: 'title' | 'passage' | 'question' | 'reply';
    snippet: string;
    ranges: [number, number][];
    message?: string;
    // A recent learning tree's day and size, shown in place of the matched field.
    recent?: string;
};

function searchDay(created: number, now: Date) {
    const date = new Date(created);
    const age = localDay(now) - localDay(date);
    if (age <= 0) return 'Today';
    if (age === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The empty query's list: the six newest learning trees with their day and conversation count.
export function recentTrees(trees: readonly Summary[], now = new Date()) {
    return trees
        .filter((t) => !t.parent)
        .sort((a, b) => b.created - a.created)
        .slice(0, 6)
        .map((t) => {
            const day = searchDay(t.created, now),
                count = subtreeIds(t.id, trees).length;
            const result: SearchResult = {
                conversation: t.id,
                root: t.id,
                tree: t.title,
                address: '1',
                title: t.title,
                field: 'title',
                snippet: '',
                ranges: [],
                recent: `${day} · ${count} ${count === 1 ? 'conversation' : 'conversations'}`,
            };
            return {
                id: t.id,
                label: t.title,
                auxiliaryData: { ...result, group: 'Recent learning trees' },
            };
        });
}

// Searches every conversation's saved text, the current learning tree first. Each query waits `wait` ms
// after the last keystroke; a newer query or closing cancels the older request. Failures surface like other request errors.
export function treeSearchSource(
    report: (message: string) => void,
    currentTree: () => string | undefined,
    trees: () => readonly Summary[],
    wait = 120,
) {
    let controller: AbortController | undefined;
    const cancel = () => controller?.abort();
    return {
        search(q: string) {
            cancel();
            const { signal } = (controller = new AbortController()),
                tree = currentTree();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, wait);
                signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(signal.reason);
                });
            })
                .then(() =>
                    serverFetch(
                        `/api/search?q=${encodeURIComponent(q)}${tree ? `&tree=${encodeURIComponent(tree)}` : ''}`,
                        { signal },
                    ),
                )
                .then(async (response) => {
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error ?? 'Search failed. Try again.');
                    const created = new Map(
                        trees()
                            .filter((t) => !t.parent)
                            .map((t) => [t.id, t.created]),
                    );
                    const groups = new Map<string, { group: string; detail: string }>(),
                        headings = new Set<string>(),
                        now = new Date();
                    return (data as SearchResult[]).map((r) => {
                        let found = groups.get(r.root);
                        if (found === undefined) {
                            const date = created.get(r.root);
                            const detail =
                                r.root === tree
                                    ? 'This tree'
                                    : date == null
                                      ? ''
                                      : searchDay(date, now);
                            const heading = detail ? `${r.tree} · ${detail}` : r.tree;
                            let group = heading;
                            // Astryx keys groups by heading, so even same-day names must differ.
                            for (let i = 2; headings.has(group); i++) group = `${heading} (${i})`;
                            found = { group, detail };
                            groups.set(r.root, found);
                            headings.add(group);
                        }
                        return {
                            id: r.conversation,
                            // Include the snippet so Astryx's immediate narrowing keeps text matches.
                            label: `${r.title} ${r.snippet}`,
                            // The detail ("This tree" or the day) is drawn apart from the name in the heading.
                            auxiliaryData: { ...r, ...found },
                        };
                    });
                })
                .catch((e: Error) => {
                    if (!signal.aborted) report(e.message);
                    return [];
                });
        },
        bootstrap: () => recentTrees(trees()),
        cancel,
    };
}
