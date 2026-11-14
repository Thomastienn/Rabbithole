// Title-only search reflects saved trees; failures surface like other request errors.
export function treeSearchSource(
  api: (path: string) => Promise<{ root: string; title: string }[]>,
  report: (message: string) => void,
) {
  return {
    search: (q: string) =>
      api(`/api/search?q=${encodeURIComponent(q)}`).then(
        (r) => r.map((t) => ({ id: t.root, label: t.title })),
        (e: Error) => {
          report(e.message);
          return [];
        },
      ),
    bootstrap: () => [],
  };
}
