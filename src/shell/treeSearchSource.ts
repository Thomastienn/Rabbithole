import { request } from '../serverAccess';

// Title-only search reflects saved trees; failures surface like other request errors.
export function treeSearchSource(report: (message: string) => void) {
    return {
        search: (q: string) =>
            request(`/api/search?q=${encodeURIComponent(q)}`).then(
                (r: { root: string; title: string }[]) =>
                    r.map((t) => ({ id: t.root, label: t.title })),
                (e: Error) => {
                    report(e.message);
                    return [];
                },
            ),
        bootstrap: () => [],
    };
}
