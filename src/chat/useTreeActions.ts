import { useRef, useState } from 'react';
import type { Layout } from '../map/TreeOverview';
import { rootOf } from '../map/mapState';
import { subtreeIds } from '../map/treeList';
import type { Artifact } from '../media/artifacts';
import { firstQuestion as startFirstQuestion } from './firstQuestion';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import type { LayoutSaving } from '../map/useLayoutSaving';
import type { LearningTrees } from './useLearningTrees';
import type { ChatModel } from './useChatModel';
import type { ReplyStream } from './useReplyStream';

// Tree management: new chat, first question, rename, delete and artifact actions.
export function useTreeActions(
  c: ChatState,
  { saver, setLayoutFailed }: LayoutSaving,
  { refresh, select, openTree }: LearningTrees,
  { firstModel, currentModel }: ChatModel,
  { send }: ReplyStream,
) {
  const { state, setState, setTree, setDrafts, setPreviews, setError, busy, setBusy, api } = c;
  const { pendingFiles, setPendingFiles } = c;
  const { root, setRoot, setTab, setOverview, setExpanded, setLoading, renaming, setRenaming } = c;
  const { selected, request, checkpoints, turns, streams, removed, renamed } = c;
  const { overviewOrigin, focusComposer, composer, setFolds, setBranch, setReveal } = c;
  const { setSelectingMessage, tab } = c;
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
    action: 'cancel' | 'retry' | 'regenerate',
  ) {
    setError('');
    try {
      const next: Artifact = await api(`/api/trees/${id}/artifacts/${artifactId}/${action}`, {});
      const focused =
        document.activeElement?.closest('[data-artifact]')?.getAttribute('data-artifact') ===
        artifactId;
      setTree((t) =>
        t?.id === id
          ? { ...t, artifacts: t.artifacts.map((a) => (a.id === artifactId ? next : a)) }
          : t,
      );
      if (focused)
        requestAnimationFrame(() => {
          if (document.activeElement === document.body)
            document
              .querySelector<HTMLElement>(`.focused-chat [data-artifact="${next.id}"] button`)
              ?.focus();
        });
      // A job that settled before this refresh never starts polling, so load its result once.
      if (!(await refresh()).videos.includes(id) && !turns.current.has(id)) {
        const saved: Tree = await api(`/api/trees/${id}`);
        if (selected.current === id && !turns.current.has(id))
          setTree((t) => (t?.id === id ? saved : t));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // New chat saves nothing: it shows the blank first-question composer; create() saves the tree on the first send.
  function newChat() {
    ++request.current;
    selected.current = undefined;
    setTree(undefined);
    setRoot(undefined);
    setTab('learning');
    setOverview(false);
    setExpanded(false);
    setLoading(false);
    setError('');
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.first-question [role=textbox]')?.focus(),
    );
  }
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
          api,
          refresh,
          send: (question, next) => send(question, next, false, files),
          open: async (next) => {
            overviewOrigin.current = undefined;
            focusComposer.current = true;
            setRoot(next.id);
            setTab('learning');
            setOverview(false);
            setExpanded(false);
            await select(next.id);
            setDrafts((d) => ({ ...d, first: '', [next.id]: question }));
            setPendingFiles((p) => ({ ...p, first: [], [next.id]: files }));
          },
        },
      );
      if (result.empty) {
        // Keep send's error on screen; only drop the selection so the blank composer returns.
        ++request.current;
        selected.current = undefined;
        setTree(undefined);
        setRoot(undefined);
        setDrafts((d) => ({ ...d, first: question }));
        setPendingFiles((p) => ({ ...p, first: files }));
        return;
      }
      requestAnimationFrame(() => {
        if (selected.current === result.id) composer.current?.focus();
      });
    } catch (e) {
      setError((e as Error).message);
      setDrafts((d) => ({ ...d, first: d.first || question }));
      setPendingFiles((p) => ({ ...p, first: p.first?.length ? p.first : files }));
    } finally {
      setBusy(false);
    }
  }
  function finishRename() {
    const target = renaming;
    setRenaming(undefined);
    requestAnimationFrame(() =>
      document
        .getElementById(
          target?.place === 'library' ? `chat-actions-${target.id}` : 'rename-conversation',
        )
        ?.focus(),
    );
  }
  async function rename(id: string, title: string) {
    const saved = await api(`/api/trees/${id}/rename`, { title });
    renamed.current.set(id, saved.title);
    ++checkpoints.current;
    setTree((t) => (t?.id === id ? { ...t, title: saved.title } : t));
    setState(
      (s) =>
        s && { ...s, trees: s.trees.map((t) => (t.id === id ? { ...t, title: saved.title } : t)) },
    );
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
      for (const id of ids) {
        removed.current.add(id);
        streams.current.get(id)?.abort();
        turns.current.delete(id);
        renamed.current.delete(id);
      }
      ++checkpoints.current;
      saver.current?.discard(deletion.root);
      const cleanLayout = (layout: Layout): Layout => ({
        ...layout,
        folded: layout.folded.filter((id) => !ids.has(id)),
        selected: layout.selected && ids.has(layout.selected) ? result.parent : layout.selected,
      });
      if (result.parent && pending)
        saver.current?.mark(
          deletion.root,
          cleanLayout(pending.layout),
          Object.fromEntries(Object.entries(pending.positions).filter(([id]) => !ids.has(id))),
        );
      const trees = (state?.trees ?? [])
        .filter((t) => !ids.has(t.id))
        .map((t) =>
          t.id === deletion.root && t.layout ? { ...t, layout: cleanLayout(t.layout) } : t,
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
      setFolds((f) => f && { ...f, ids: f.ids.filter((id) => !ids.has(id)) });
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !ids.has(id))));
      setPreviews((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !ids.has(id))));
      setRenaming((r) => (r && ids.has(r.id) ? undefined : r));
      setBranch((b) => (b && ids.has(b.parent) ? undefined : b));
      setReveal((r) => (r && ids.has(r.tree) ? undefined : r));
      if (selected.current && ids.has(selected.current)) setSelectingMessage(undefined);
      setError('');
      setLayoutFailed(false);
      setDeletion(undefined);
      if (result.parent && root === deletion.root) {
        overviewOrigin.current = undefined;
        focusComposer.current = true;
        setOverview(false);
        await select(result.parent);
      } else if (root === deletion.root) {
        const roots = trees.filter((t) => !t.parent),
          index = state!.trees.filter((t) => !t.parent).findIndex((t) => t.id === deletion.root);
        // From the library, deleting the open tree clears it instead of opening a neighbour.
        const next = tab === 'library' ? undefined : roots[Math.min(index, roots.length - 1)];
        if (next) {
          focusComposer.current = true;
          openTree(next.id, trees);
        } else {
          ++request.current;
          selected.current = undefined;
          setTree(undefined);
          setRoot(undefined);
          if (tab !== 'library') setTab('learning');
          setOverview(true);
          setExpanded(false);
          setLoading(false);
        }
        if (!next || (next.layout?.panel !== 'beside' && next.layout?.panel !== 'expanded'))
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(
                next ? '.map-toolbar button' : ':is(.sidebar, .shell-band) .new-chat',
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
    newChat,
    create,
    finishRename,
    rename,
    askDelete,
    cancelDelete,
    deleteConversation,
  };
}

export type TreeActions = ReturnType<typeof useTreeActions>;
