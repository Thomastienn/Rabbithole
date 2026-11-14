import { useEffect, useMemo } from 'react';
import type { Summary, Source, Preview } from '../map/TreeOverview';
import { restoredTree } from '../map/mapState';
import { withLiveTurn, previewRequests, replyingPreviews } from '../map/previews';
import { treeSearchSource } from '../shell/treeSearch';
import { withTurn } from './turn';
import type { State, Tree } from './types';
import type { ChatState } from './useChatState';
import type { LayoutSaving } from '../map/useLayoutSaving';

// Learning tree loading: state refresh, map previews, conversation selection and status polling.
export function useLearningTrees(c: ChatState, layout: LayoutSaving) {
  const { state, setState, setTree, setPreviews, setDrafts, setError, setLoading, api } = c;
  const { selected, request, checkpoints, turns, removed, renamed, overviewOrigin } = c;

  async function refresh() {
    const data: State = await api('/api/state');
    setState((previous) => {
      const known = new Map(previous?.trees.map((t) => [t.id, t]));
      const trees = layout
        .withUnsaved(data.trees.filter((t) => !removed.current.has(t.id)))
        .map((t) => {
          if (renamed.current.has(t.id)) t = { ...t, title: renamed.current.get(t.id)! };
          const old = known.get(t.id);
          // A status poll must not replace every unchanged node's data during a stream.
          return old &&
            (Object.keys(t) as (keyof Summary)[]).every((key) =>
              key === 'layout'
                ? JSON.stringify(t.layout) === JSON.stringify(old.layout)
                : t[key] === old[key],
            )
            ? old
            : t;
        });
      return {
        ...data,
        trees,
        active: [...new Set([...data.active, ...turns.current.keys()])].filter(
          (id) => !removed.current.has(id),
        ),
        videos: data.videos.filter((id) => !removed.current.has(id)),
      };
    });
    return data;
  }
  const previewKey = JSON.stringify(c.visibleIds);
  // Running video jobs and suggestion calls poll like replies until they settle.
  const activeKey = [
    ...(state?.active ?? []),
    ...(state?.videos ?? []),
    ...(state?.suggesting ?? []),
  ].join(',');
  useEffect(() => {
    let cancelled = false;
    async function load(ids: string[]) {
      try {
        const results: Record<string, Preview>[] = await Promise.all(
          previewRequests(ids).map((path) => api(path)),
        );
        if (!cancelled) {
          const next: Record<string, Preview> = Object.assign({}, ...results);
          for (const id of ids)
            if (turns.current.has(id)) next[id] = withLiveTurn(next[id], turns.current.get(id));
          setPreviews((p) => ({ ...p, ...next }));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    const visible: string[] = JSON.parse(previewKey);
    void load(visible);
    // While replies run, refetch only the conversations that are replying.
    const replying = replyingPreviews(visible, activeKey);
    const timer = replying.length ? setInterval(() => load(replying), 1500) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [previewKey, activeKey]);
  async function select(id: string) {
    selected.current = id;
    const version = ++request.current;
    const checkpoint = checkpoints.current;
    setError('');
    setTree(undefined);
    setLoading(true);
    try {
      let next: Tree = await api(`/api/trees/${id}`);
      if (request.current === version && checkpoints.current !== checkpoint)
        next = await api(`/api/trees/${id}`);
      if (request.current === version) {
        setTree(withTurn(next, turns.current.get(id)));
        if (next.branch && !next.messages.length)
          setDrafts((d) => ({ ...d, [id]: d[id] ?? next.branch!.question }));
      }
    } catch (e) {
      if (request.current === version) setError((e as Error).message);
    } finally {
      if (request.current === version) setLoading(false);
    }
  }
  function loadInitial() {
    setError('');
    void refresh()
      .then((data) => {
        const first = data.trees.find((t) => !t.parent);
        if (first) openTree(first.id, data.trees);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(loadInitial, []);
  const titleSearch = useMemo(() => treeSearchSource(api, setError), []);
  async function openConversation(
    id: string,
    source?: Source,
    artifact?: string,
    message?: string,
  ) {
    {
      const control = document.activeElement as HTMLElement | null;
      const box = control?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      overviewOrigin.current = box ? { id: box, control: control!.id || `open-${box}` } : undefined;
    }
    c.setReveal(source ? { tree: id, source } : undefined);
    c.setFigureTarget(artifact ? { conversation: id, artifact } : undefined);
    c.setMessageTarget(message ? { conversation: id, message } : undefined);
    c.focusComposer.current = !source && !artifact && !message;
    await select(id);
    if (selected.current === id) c.changeView(false, overviewOrigin.current?.id ?? id);
  }
  // A message match opens its own conversation in chat; otherwise the tree reopens as saved.
  function openTree(id: string, trees = state?.trees ?? [], focus?: string, read = false) {
    c.setTab('learning');
    overviewOrigin.current = undefined;
    const { saved, overview, expanded } = restoredTree(id, trees, focus, read);
    c.setRoot(id);
    c.setOverview(overview);
    c.setExpanded(expanded);
    void select(saved);
  }
  return { refresh, select, loadInitial, openConversation, openTree, titleSearch, activeKey };
}

export type LearningTrees = ReturnType<typeof useLearningTrees>;
