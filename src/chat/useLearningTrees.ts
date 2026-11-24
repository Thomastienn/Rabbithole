import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Summary, Source, Preview } from '../map/TreeOverview';
import { restoredTree } from '../map/mapState';
import type { GhostTree } from '../map/ghostTrees';
import { conversationAddresses, subtreeIds } from '../map/treeList';
import { withLiveTurn, previewRequests, replyingPreviews } from '../map/previews';
import { treeSearchSource } from '../shell/treeSearchSource';
import { withTurn, type Turn } from './turn';
import type { State, Tree } from './types';
import type { ChatState } from './useChatState';
import { request as api, setCsrf } from '../serverAccess';
import { useLayoutSaving } from '../map/useLayoutSaving';
import { useMapViewState } from '../map/useMapViewState';
import { useChatTargets } from './useChatTargets';

type TreeUpdate = Tree | undefined | ((t: Tree | undefined) => Tree | undefined);
type View = Pick<
    ChatState,
    | 'setError'
    | 'overviewOrigin'
    | 'root'
    | 'setRoot'
    | 'overview'
    | 'setOverview'
    | 'expanded'
    | 'setExpanded'
    | 'setTab'
    | 'setTransitionBox'
    | 'workspaceWidth'
>;

// Learning tree data and loading: app state, the open conversation, map previews, conversation
// selection, status polling, and the counters that tell whether a server answer is still current.
export function useLearningTrees(c: View) {
    const { setError, overviewOrigin } = c;
    const [state, setState] = useState<State>();
    setCsrf(state?.csrf ?? '');
    const [tree, setTree] = useState<Tree>();
    const addresses = useMemo(() => conversationAddresses(state?.trees ?? []), [state?.trees]);
    const [previews, setPreviews] = useState<Record<string, Preview>>({});
    const [loading, setLoading] = useState(false);
    const removed = useRef(new Set<string>());
    const renamed = useRef(new Map<string, string>());
    // The open conversation, a request number bumped on every open or leave, and a checkpoint
    // number bumped on every local change; only the functions below touch them.
    const selected = useRef<string | undefined>(undefined);
    const request = useRef(0);
    const checkpoints = useRef(0);
    // Live turns: the reply stream, built after this hook, writes them; this hook only reads them.
    const turns = useRef(new Map<string, Turn>());
    const map = useMapViewState(c, state);
    const layout = useLayoutSaving(c, { state, setState, tree, folded: map.folded });
    const targets = useChatTargets(c, tree);

    // The one stale-answer check: an answer for `id` started now stays current while `id` is still
    // open and no newer request started; `unchanged` also drops it once a local change landed.
    function since(id: string) {
        const version = request.current,
            checkpoint = checkpoints.current;
        return (unchanged = false) =>
            selected.current === id &&
            request.current === version &&
            (!unchanged || checkpoints.current === checkpoint);
    }
    // Reloads conversation `id` and hands it to `apply` only while that answer is current.
    async function reload(id: string | undefined, apply: (next: Tree) => void, unchanged = false) {
        if (!id) return;
        const current = since(id);
        const next: Tree = await api(`/api/trees/${id}`);
        if (current(unchanged)) apply(next);
    }
    // A local change to a learning tree: answers started before it that ask for `unchanged` drop.
    function change(update?: TreeUpdate) {
        ++checkpoints.current;
        if (update) setTree(update);
    }
    // Shows a conversation the caller already has, as if it were selected and loaded.
    function show(next: Tree) {
        selected.current = next.id;
        ++request.current;
        setTree(next);
        setLoading(false);
    }
    // Leaves the open conversation: nothing is selected and answers still on the way drop.
    function leave() {
        ++request.current;
        selected.current = undefined;
        setTree(undefined);
        c.setRoot(undefined);
        setLoading(false);
    }
    const openId = () => selected.current;
    // `local` marks a rename by the learner, which wins over titles that later refreshes bring.
    function retitle(id: string, title: string, local = false) {
        if (local) {
            renamed.current.set(id, title);
            change();
        }
        title = renamed.current.get(id) ?? title;
        setTree((t) => (t?.id === id ? { ...t, title } : t));
        setState(
            (s) => s && { ...s, trees: s.trees.map((t) => (t.id === id ? { ...t, title } : t)) },
        );
    }
    // Deleted conversations stay out of every later refresh.
    function forget(ids: Set<string>) {
        for (const id of ids) {
            removed.current.add(id);
            renamed.current.delete(id);
        }
        change();
    }
    const isRemoved = (id: string) => removed.current.has(id);

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
    const trees = state?.trees,
        root = c.root;
    const visibleIds = useMemo(() => (root && trees ? subtreeIds(root, trees) : []), [root, trees]);
    const previewKey = JSON.stringify(visibleIds);
    // Running video jobs and suggestion calls poll like replies until they settle.
    const activeKey = [
        ...(state?.active ?? []),
        ...(state?.discussing ?? []),
        ...(state?.videos ?? []),
        ...(state?.suggesting ?? []),
        ...(state?.titling ?? []),
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
                        if (turns.current.has(id))
                            next[id] = withLiveTurn(next[id], turns.current.get(id));
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
        ++request.current;
        const current = since(id);
        setError('');
        setTree(undefined);
        setLoading(true);
        try {
            let next: Tree = await api(`/api/trees/${id}`);
            if (current() && !current(true)) next = await api(`/api/trees/${id}`);
            if (current()) setTree(withTurn(next, turns.current.get(id)));
        } catch (e) {
            if (current()) setError((e as Error).message);
        } finally {
            if (current()) setLoading(false);
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
    // Search ranks the open learning tree first; a ref, so the source keeps its pending request.
    const searchRoot = useRef(root);
    searchRoot.current = root;
    const titleSearch = useMemo(() => treeSearchSource(setError, () => searchRoot.current), []);
    function changeView(showOverview: boolean, id?: string) {
        // Snapshotting thousands of preview rows stalls large maps; their viewport still animates.
        if (
            visibleIds.length > 50 ||
            !document.startViewTransition ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            c.setOverview(showOverview);
            return;
        }
        flushSync(() => c.setTransitionBox(id));
        document.startViewTransition(() => flushSync(() => c.setOverview(showOverview)));
    }
    function returnToTree() {
        c.setExpanded(false);
        // Chats reached by branching have no map origin; return focus to their own box.
        if (!overviewOrigin.current && tree)
            overviewOrigin.current = { id: tree.id, control: `open-${tree.id}` };
        changeView(true, overviewOrigin.current?.id);
    }
    async function openConversation(
        id: string,
        source?: Source,
        artifact?: string,
        message?: string,
    ) {
        {
            const control = document.activeElement as HTMLElement | null;
            const box = control?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
            overviewOrigin.current = box
                ? { id: box, control: control!.id || `open-${box}` }
                : undefined;
        }
        targets.goTo(id, source, artifact, message);
        await select(id);
        if (selected.current === id) changeView(false, overviewOrigin.current?.id ?? id);
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
    // A ghost tree opens the other tree's map, marking its matches until the learner leaves it.
    function openGhost(ghost: GhostTree, from: string) {
        openTree(ghost.root);
        c.setOverview(true);
        map.setGhostMarks({ root: ghost.root, from, ids: ghost.matches });
    }
    return {
        state,
        setState,
        tree,
        setTree,
        addresses,
        previews,
        setPreviews,
        loading,
        visibleIds,
        layout,
        map,
        targets,
        live: turns,
        openId,
        reload,
        change,
        show,
        leave,
        retitle,
        forget,
        isRemoved,
        refresh,
        select,
        loadInitial,
        changeView,
        returnToTree,
        openConversation,
        openTree,
        openGhost,
        titleSearch,
        activeKey,
    };
}

export type LearningTrees = ReturnType<typeof useLearningTrees>;
