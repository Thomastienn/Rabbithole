import { useRef, useState } from 'react';
import type { Layout } from '../map/TreeOverview';
import { rootOf } from '../map/mapState';
import { subtreeIds } from '../map/treeList';
import type { Artifact } from '../media/artifacts';
import type { ChatState } from './useChatState';
import { request as api } from '../serverAccess';
import type { LearningTrees } from './useLearningTrees';
import type { ReplyStream } from './useReplyStream';
import type { BranchFormState } from './useBranchForm';
import type { ChatTargets } from './useChatTargets';
import type { LayoutSaving } from '../map/useLayoutSaving';
import type { MapViewState } from '../map/useMapViewState';

// Tree management: new chat, rename, delete and artifact actions.
export function useTreeActions(
    c: Pick<
        ChatState,
        | 'setError'
        | 'root'
        | 'tab'
        | 'setTab'
        | 'setOverview'
        | 'setExpanded'
        | 'renaming'
        | 'setRenaming'
        | 'overviewOrigin'
    >,
    trees: Pick<
        LearningTrees,
        | 'state'
        | 'setState'
        | 'setTree'
        | 'setPreviews'
        | 'refresh'
        | 'select'
        | 'openTree'
        | 'reload'
        | 'leave'
        | 'retitle'
        | 'forget'
    > & {
        layout: Pick<LayoutSaving, 'saver' | 'setLayoutFailed'>;
        targets: Pick<ChatTargets, 'focusNext' | 'drop'>;
        map: Pick<MapViewState, 'drop'>;
    },
    { isLive, drop }: Pick<ReplyStream, 'isLive' | 'drop'>,
    branchForm: Pick<BranchFormState, 'drop'>,
    theme: { name: string; mode: string },
) {
    const { setError, root, setTab, setOverview, setExpanded, renaming, setRenaming } = c;
    const { state, setState, setTree, setPreviews, refresh, select, openTree } = trees;
    const { reload, leave, retitle, forget } = trees;
    const { saver, setLayoutFailed } = trees.layout;
    const { overviewOrigin, tab } = c;
    const { focusNext, drop: dropTargets } = trees.targets;
    const { drop: dropFolds } = trees.map;
    const [deletion, setDeletion] = useState<{
        id: string;
        root: string;
        title: string;
        count: number;
        parent: string | null;
    }>();
    const [deleting, setDeleting] = useState(false),
        [deleteError, setDeleteError] = useState('');
    const deleteOrigin = useRef<HTMLElement | null>(null);

    // Cancel and Retry (videos, visuals and diagrams) update only their own card; refreshing state resumes polling for a retried job.
    async function videoAction(
        id: string,
        artifactId: string,
        action: 'cancel' | 'retry' | 'regenerate' | 'install' | 'previous' | 'sketch',
        instruction?: string,
    ) {
        setError('');
        try {
            const next: Artifact = await api(`/api/trees/${id}/artifacts/${artifactId}/${action}`, {
                instruction,
            });
            const focused =
                document.activeElement
                    ?.closest('[data-artifact]')
                    ?.getAttribute('data-artifact') === artifactId;
            setTree((t) =>
                t?.id === id
                    ? { ...t, artifacts: t.artifacts.map((a) => (a.id === artifactId ? next : a)) }
                    : t,
            );
            if (focused)
                requestAnimationFrame(() => {
                    if (document.activeElement === document.body)
                        document
                            .querySelector<HTMLElement>(
                                `.focused-chat [data-artifact="${next.id}"] button`,
                            )
                            ?.focus();
                });
            await follow(id);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    // A job that settled before this refresh never starts polling, so load its result once.
    async function follow(id: string) {
        if (!(await refresh()).videos.includes(id) && !isLive(id))
            await reload(id, (saved) => {
                if (!isLive(id)) setTree((t) => (t?.id === id ? saved : t));
            });
    }
    // Expand into visual: the new visual draws in the sketch's place and takes focus from its control.
    async function expandSketch(id: string, message: string, at: number) {
        setError('');
        try {
            const next: Artifact = await api(
                `/api/trees/${id}/messages/${message}/sketches/${at}`,
                { theme },
            );
            setTree((t) =>
                t?.id === id
                    ? { ...t, artifacts: [...t.artifacts.filter((a) => a.id !== next.id), next] }
                    : t,
            );
            requestAnimationFrame(() =>
                document
                    .querySelector<HTMLElement>(`.focused-chat [data-artifact="${next.id}"]`)
                    ?.focus(),
            );
            await follow(id);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    // New chat saves nothing: it shows the blank first-question composer; create() saves the tree on the first send.
    function newChat() {
        leave();
        setTab('learning');
        setOverview(false);
        setExpanded(false);
        setError('');
        requestAnimationFrame(() =>
            document.querySelector<HTMLElement>('.first-question [role=textbox]')?.focus(),
        );
    }
    function finishRename() {
        const target = renaming;
        setRenaming(undefined);
        requestAnimationFrame(() =>
            document
                .getElementById(
                    target?.place === 'library'
                        ? `chat-actions-${target.id}`
                        : 'rename-conversation',
                )
                ?.focus(),
        );
    }
    async function rename(id: string, title: string) {
        const saved = await api(`/api/trees/${id}/rename`, { title });
        retitle(id, saved.title, true);
        finishRename();
    }
    function askDelete(id: string, origin: HTMLElement | null) {
        const target = state?.trees.find((t) => t.id === id),
            owner = state && rootOf(id, state.trees);
        if (!target || !owner) return;
        deleteOrigin.current = origin;
        setDeleteError('');
        setDeletion({
            id,
            root: owner,
            title: target.title,
            count: subtreeIds(id, state!.trees).length,
            parent: target.parent,
        });
    }
    function cancelDelete() {
        if (deleting) return;
        setDeletion(undefined);
        requestAnimationFrame(() => deleteOrigin.current?.focus());
    }
    async function deleteConversation() {
        if (!deletion || deleting) return;
        setDeleting(true);
        setDeleteError('');
        try {
            const result: { deleted: string[]; parent: string | null } = await api(
                `/api/trees/${deletion.root}/delete`,
                { conversation: deletion.id, count: deletion.count, title: deletion.title },
            );
            const ids = new Set(result.deleted),
                pending = saver.current?.pending().get(deletion.root);
            forget(ids);
            drop(ids);
            saver.current?.discard(deletion.root);
            const cleanLayout = (layout: Layout): Layout => ({
                ...layout,
                folded: layout.folded.filter((id) => !ids.has(id)),
                selected:
                    layout.selected && ids.has(layout.selected) ? result.parent : layout.selected,
            });
            if (result.parent && pending)
                saver.current?.mark(
                    deletion.root,
                    cleanLayout(pending.layout),
                    Object.fromEntries(
                        Object.entries(pending.positions).filter(([id]) => !ids.has(id)),
                    ),
                );
            const trees = (state?.trees ?? [])
                .filter((t) => !ids.has(t.id))
                .map((t) =>
                    t.id === deletion.root && t.layout
                        ? { ...t, layout: cleanLayout(t.layout) }
                        : t,
                );
            setState(
                (s) =>
                    s && {
                        ...s,
                        trees,
                        active: s.active.filter((id) => !ids.has(id)),
                        videos: s.videos.filter((id) => !ids.has(id)),
                    },
            );
            dropFolds(ids);
            setPreviews((p) =>
                Object.fromEntries(Object.entries(p).filter(([id]) => !ids.has(id))),
            );
            setRenaming((r) => (r && ids.has(r.id) ? undefined : r));
            branchForm.drop(ids);
            dropTargets(ids);
            setError('');
            setLayoutFailed(false);
            setDeletion(undefined);
            if (result.parent && root === deletion.root) {
                overviewOrigin.current = undefined;
                focusNext();
                setOverview(false);
                await select(result.parent);
            } else if (root === deletion.root) {
                const roots = trees.filter((t) => !t.parent),
                    index = state!.trees
                        .filter((t) => !t.parent)
                        .findIndex((t) => t.id === deletion.root);
                // From the library, deleting the open tree clears it instead of opening a neighbour.
                const next =
                    tab === 'library' ? undefined : roots[Math.min(index, roots.length - 1)];
                if (next) {
                    focusNext();
                    openTree(next.id, trees);
                } else {
                    leave();
                    if (tab !== 'library') setTab('learning');
                    setOverview(true);
                    setExpanded(false);
                }
                if (!next || (next.layout?.panel !== 'beside' && next.layout?.panel !== 'expanded'))
                    requestAnimationFrame(() =>
                        document
                            .querySelector<HTMLElement>(
                                next
                                    ? '.map-toolbar button'
                                    : ':is(.sidebar, .shell-band) .new-chat',
                            )
                            ?.focus(),
                    );
            } else
                requestAnimationFrame(() =>
                    deleteOrigin.current?.isConnected &&
                    deleteOrigin.current.id !== `chat-actions-${deletion.root}`
                        ? deleteOrigin.current.focus()
                        : document.getElementById(`chat-actions-${root}`)?.focus(),
                );
            await refresh();
        } catch (e) {
            setDeleteError((e as Error).message);
        } finally {
            setDeleting(false);
        }
    }
    return {
        deletion,
        deleting,
        deleteError,
        videoAction,
        expandSketch,
        newChat,
        finishRename,
        rename,
        askDelete,
        cancelDelete,
        deleteConversation,
    };
}

export type TreeActions = ReturnType<typeof useTreeActions>;
