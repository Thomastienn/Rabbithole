import { useEffect } from 'react';
import { applyStreamEvent, withTurn, type Turn } from './turn';
import { withLiveTurn } from '../map/previews';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import type { LearningTrees } from './useLearningTrees';
import type { ChatModel } from './useChatModel';
import { mergeArtifact, type DiscussionReply } from '../media/artifacts';
import { replyStream, request as api } from '../serverAccess';

// Reply stream: sends a question or retry, applies SSE events live, then reloads the saved tree.
export function useReplyStream(
    c: ChatState,
    trees: LearningTrees,
    { savingModel }: ChatModel,
    theme: { name: string; mode: string },
) {
    const { setDrafts, setPendingFiles, setError, turns, streams } = c;
    const { refresh, activeKey, tree, state, setState, setTree, setPreviews } = trees;
    const { openId, reload, change, retitle, isRemoved } = trees;
    // Reopening a page during a turn recovers saved checkpoints without tying work to focus.
    useEffect(() => {
        if (!activeKey) return;
        const timer = setInterval(() => {
            void refresh()
                .then(() =>
                    reload(
                        openId(),
                        (next) => setTree(withTurn(next, turns.current.get(next.id))),
                        true,
                    ),
                )
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
        change();
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
            if (isRemoved(id)) return;
            if (!retry) {
                setDrafts((d) => ({ ...d, [id]: '' }));
                setPendingFiles((p) => ({ ...p, [id]: [] }));
            }
            for await (const event of events) {
                if (isRemoved(id)) continue;
                if (event.type === 'error' && openId() === id) setError(event.error);
                if (event.type === 'saved') retitle(id, event.title);
                if (applyStreamEvent(turn, event, id)) {
                    setTree((t) => (t?.id === id ? withTurn(t, turn) : t));
                    setPreviews((p) => ({ ...p, [id]: withLiveTurn(p[id], turn) }));
                }
            }
        } catch (e) {
            if (isRemoved(id)) return;
            // The composer clears itself on submit; give back a question the server never saved.
            if (!turn.user && !retry) setDrafts((d) => ({ ...d, [id]: d[id] || text }));
            if (openId() === id) setError((e as Error).message);
        } finally {
            streams.current.delete(id);
            if (isRemoved(id)) return;
            try {
                await reload(id, (saved) => change(saved));
            } catch {
                if (openId() === id && !isRemoved(id))
                    setError('Connection lost. Reload to recover saved messages.');
            } finally {
                turns.current.delete(id);
                await refresh().catch(() => {
                    if (openId() === id)
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
                if (event.type !== 'artifact' || isRemoved(id)) continue;
                change((t) =>
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
            await reload(
                id,
                (saved) => {
                    if (!isRemoved(id)) setTree(withTurn(saved, turns.current.get(id)));
                },
                true,
            );
            await refresh();
        }
    };
    return { send, stop, retryFromMap, replyDiscussion };
}

export type ReplyStream = ReturnType<typeof useReplyStream>;
