import { useEffect } from 'react';
import { applyStreamEvent, withTurn, type Turn } from './turn';
import { withLiveTurn } from '../map/previews';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import type { LearningTrees } from './useLearningTrees';
import type { ChatModel } from './useChatModel';
import { mergeArtifact, type DiscussionReply } from '../media/artifacts';
import { replyStream } from '../serverAccess';

// Reply stream: sends a question or retry, applies SSE events live, then reloads the saved tree.
export function useReplyStream(
    c: ChatState,
    { refresh, activeKey }: LearningTrees,
    { savingModel }: ChatModel,
    theme: { name: string; mode: string },
) {
    const {
        tree,
        state,
        setState,
        setTree,
        setPreviews,
        setDrafts,
        setPendingFiles,
        setError,
        api,
    } = c;
    const { turns, streams, checkpoints, removed, renamed, selected, request } = c;
    // Reopening a page during a turn recovers saved checkpoints without tying work to focus.
    useEffect(() => {
        if (!activeKey) return;
        const timer = setInterval(() => {
            void refresh()
                .then(async () => {
                    const id = selected.current;
                    if (!id) return;
                    const version = request.current,
                        checkpoint = checkpoints.current;
                    const next: Tree = await api(`/api/trees/${id}`);
                    if (
                        selected.current === id &&
                        request.current === version &&
                        checkpoints.current === checkpoint
                    )
                        setTree(withTurn(next, turns.current.get(id)));
                })
                .catch((e) => setError(e.message));
        }, 1500);
        return () => clearInterval(timer);
    }, [activeKey]);
    async function retryFromMap(id: string) {
        try {
            const target: Tree = await api(`/api/trees/${id}`);
            await send(target.messages.at(-2)?.text ?? '', target, true);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    // retry streams over the latest failed reply; the question and composer draft are left alone.
    // files go as multipart form data; a question needs text or files (a retry resends the saved ones).
    async function send(text: string, target = tree, retry = false, files: File[] = []) {
        if (
            !target ||
            (!retry && !text.trim() && !files.length) ||
            savingModel === target.id ||
            state?.active.includes(target.id) ||
            turns.current.has(target.id)
        )
            return;
        const id = target.id;
        const controller = new AbortController();
        streams.current.set(id, controller);
        const turn: Turn = {};
        turns.current.set(id, turn);
        ++checkpoints.current;
        setError('');
        setState((s) => s && { ...s, active: [...s.active, id] });
        try {
            const form = new FormData();
            if (!retry && files.length) {
                form.set('text', text);
                form.set('theme', JSON.stringify(theme));
                for (const file of files) form.append('files', file);
            }
            const multipart = form.has('text');
            const events = await replyStream(`/api/trees/${id}/${retry ? 'retry' : 'messages'}`, {
                headers: { ...(!multipart && { 'Content-Type': 'application/json' }) },
                body: multipart ? form : JSON.stringify({ ...(!retry && { text }), theme }),
                signal: controller.signal,
            });
            if (removed.current.has(id)) return;
            if (!retry) {
                setDrafts((d) => ({ ...d, [id]: '' }));
                setPendingFiles((p) => ({ ...p, [id]: [] }));
            }
            for await (const event of events) {
                if (removed.current.has(id)) continue;
                if (event.type === 'error' && selected.current === id) setError(event.error);
                if (event.type === 'saved') {
                    const title: string = renamed.current.get(id) ?? event.title;
                    setTree((t) => (t?.id === id ? { ...t, title } : t));
                    setState(
                        (s) =>
                            s && {
                                ...s,
                                trees: s.trees.map((t) => (t.id === id ? { ...t, title } : t)),
                            },
                    );
                }
                if (applyStreamEvent(turn, event, id)) {
                    setTree((t) => (t?.id === id ? withTurn(t, turn) : t));
                    setPreviews((p) => ({ ...p, [id]: withLiveTurn(p[id], turn) }));
                }
            }
        } catch (e) {
            if (removed.current.has(id)) return;
            // The composer clears itself on submit; give back a question the server never saved.
            if (!turn.user && !retry) setDrafts((d) => ({ ...d, [id]: d[id] || text }));
            if (selected.current === id) setError((e as Error).message);
        } finally {
            streams.current.delete(id);
            if (removed.current.has(id)) return;
            const version = request.current;
            try {
                const saved = await api(`/api/trees/${id}`);
                if (selected.current === id && request.current === version) {
                    ++checkpoints.current;
                    setTree(saved);
                }
            } catch {
                if (selected.current === id && !removed.current.has(id))
                    setError('Connection lost. Reload to recover saved messages.');
            } finally {
                turns.current.delete(id);
                await refresh().catch(() => {
                    if (selected.current === id)
                        setError('Connection lost. Reload to recover saved messages.');
                });
            }
        }
    }
    function stop(id: string) {
        void api(`/api/trees/${id}/stop`, {}).catch((e) => setError(e.message));
    }
    const replyDiscussion: DiscussionReply = async (artifact, text) => {
        const id = artifact.conversation;
        const events = await replyStream(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        try {
            for await (const event of events) {
                if (event.type !== 'artifact' || removed.current.has(id)) continue;
                ++checkpoints.current;
                setTree((t) =>
                    t?.id === id
                        ? withTurn(
                              {
                                  ...t,
                                  artifacts: mergeArtifact(
                                      t.artifacts,
                                      event.artifact,
                                      id,
                                      t.messages,
                                  ),
                              },
                              turns.current.get(id),
                          )
                        : t,
                );
            }
        } finally {
            const version = request.current,
                checkpoint = checkpoints.current;
            const saved = await api(`/api/trees/${id}`);
            if (
                !removed.current.has(id) &&
                selected.current === id &&
                request.current === version &&
                checkpoints.current === checkpoint
            )
                setTree(withTurn(saved, turns.current.get(id)));
            await refresh();
        }
    };
    return { send, stop, retryFromMap, replyDiscussion };
}

export type ReplyStream = ReturnType<typeof useReplyStream>;
