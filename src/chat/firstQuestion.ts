import { request as api } from '../serverAccess';

// Open before sending so the first reply is shown while it streams.
export async function firstQuestion<T extends { id: string }>(
    question: string,
    selection: object,
    {
        refresh,
        open,
        send,
    }: {
        refresh: () => Promise<unknown>;
        open: (tree: T) => Promise<void>;
        send: (question: string, tree: T) => Promise<void>;
    },
) {
    const next: T = await api('/api/trees', selection);
    await refresh();
    await open(next);
    await send(question, next);
    // A first send the server never saved would leave an empty tree in the library.
    const saved = await api(`/api/trees/${next.id}`);
    const empty = !saved.messages.length;
    if (empty) {
        await api(`/api/trees/${next.id}/delete`, { conversation: next.id, count: 1 });
        await refresh();
    }
    return { id: next.id, empty };
}
