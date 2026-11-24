import { serverFetch } from '../serverAccess';

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
};

// Searches every conversation's saved text, the current learning tree first. Each query waits `wait` ms
// after the last keystroke; a newer query or closing cancels the older request. Failures surface like other request errors.
export function treeSearchSource(
    report: (message: string) => void,
    currentTree: () => string | undefined,
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
                    // The snippet joins the label so the palette's instant narrowing keeps text matches.
                    return (data as SearchResult[]).map((r) => ({
                        id: r.conversation,
                        label: `${r.title} ${r.snippet}`,
                        auxiliaryData: { ...r, group: r.tree },
                    }));
                })
                .catch((e: Error) => {
                    if (!signal.aborted) report(e.message);
                    return [];
                });
        },
        bootstrap: () => [],
        cancel,
    };
}
