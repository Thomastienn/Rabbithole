import { useEffect, useRef, useState } from 'react';
import { applyStreamEvent, withTurn, type Turn } from './turn';
import { withLiveTurn } from '../map/previews';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import type { LearningTrees } from './useLearningTrees';
import type { ChatModel } from './useChatModel';
import { mergeArtifact, type DiscussionReply } from '../media/artifacts';
import { firstQuestion as startFirstQuestion } from './firstQuestion';
import { replyStream, request as api } from '../serverAccess';

// Reply stream: sends a question or retry, applies SSE events live, then reloads the saved tree.
// It owns the live turns, running streams, the first question's busy flag, drafts and pending files.
export function useReplyStream(
    c: ChatState,
    trees: LearningTrees,
    { savingModel, firstModel, currentModel }: ChatModel,
    theme: { name: string; mode: string },
) {
    const { setError, overviewOrigin } = c;
    const { focusNext, composer } = trees.targets;
    const { refresh, activeKey, tree, state, setState, setTree, setPreviews } = trees;
    const { openId, reload, change, retitle, isRemoved, select, leave } = trees;
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    // Pending composer files, keyed like drafts: a conversation id, or 'first' for the first question.
    const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({});
    const [busy, setBusy] = useState(false);
    const streams = useRef(new Map<string, AbortController>());
    const turns = useRef(new Map<string, Turn>());
    trees.live.current = turns.current;
    const setDraft = (id: string, value: string) => setDrafts((d) => ({ ...d, [id]: value }));
    const setFiles = (id: string, files: File[]) => setPendingFiles((p) => ({ ...p, [id]: files }));
    const isLive = (id: string) => turns.current.has(id);
    // A branch reopened before its reply started offers its question in the composer.
    useEffect(() => {
        const question = tree?.branch && !tree.messages.length && tree.branch.question;
        if (question) setDrafts((d) => ({ ...d, [tree.id]: d[tree.id] ?? question }));
    }, [tree?.id]);
    // Deleted conversations: their replies stop and their drafts and files go.
    function drop(ids: Set<string>) {
        for (const id of ids) {
            streams.current.get(id)?.abort();
            turns.current.delete(id);
        }
        const keep = <T>(r: Record<string, T>) =>
            Object.fromEntries(Object.entries(r).filter(([id]) => !ids.has(id)));
        setDrafts(keep);
        setPendingFiles(keep);
    }
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
    async function create(question: string) {
        if (busy) return;
        setBusy(true);
        setError('');
        // The first question's files move with its draft to the new conversation, and back if unsaved.
        const files = pendingFiles.first ?? [];
        try {
            const result = await startFirstQuestion<Tree>(
                question,
                firstModel && currentModel ? { ...firstModel, model: currentModel.model } : {},
                {
                    refresh,
                    send: (question, next) => send(question, next, false, files),
                    open: async (next) => {
                        overviewOrigin.current = undefined;
                        focusNext();
                        c.setRoot(next.id);
                        c.setTab('learning');
                        c.setOverview(false);
                        c.setExpanded(false);
                        await select(next.id);
                        setDrafts((d) => ({ ...d, first: '', [next.id]: question }));
                        setPendingFiles((p) => ({ ...p, first: [], [next.id]: files }));
                    },
                },
            );
            if (result.empty) {
                // Keep send's error on screen; only drop the selection so the blank composer returns.
                leave();
                setDrafts((d) => ({ ...d, first: question }));
                setPendingFiles((p) => ({ ...p, first: files }));
                return;
            }
            requestAnimationFrame(() => {
                if (openId() === result.id) composer.current?.focus();
            });
        } catch (e) {
            setError((e as Error).message);
            setDrafts((d) => ({ ...d, first: d.first || question }));
            setPendingFiles((p) => ({ ...p, first: p.first?.length ? p.first : files }));
        } finally {
            setBusy(false);
        }
    }
    return {
        drafts,
        setDraft,
        pendingFiles,
        setFiles,
        busy,
        isLive,
        drop,
        send,
        create,
        stop,
        retryFromMap,
        replyDiscussion,
    };
}

export type ReplyStream = ReturnType<typeof useReplyStream>;
