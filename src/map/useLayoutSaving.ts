import { useEffect, useRef, useState } from 'react';
import type { Summary, Layout } from './TreeOverview';
import { layoutSaver, type Batch } from './layoutSave';
import type { Point, Viewport } from './canvas';
import { rootOf } from './mapState';
import type { ChatState } from '../chat/useChatState';
import type { State, Tree } from '../chat/types';
import { request as api } from '../serverAccess';

// Map layout saving for ChatPage: pending batches, snapshots and drag or viewport saves.
// useLearningTrees calls it with the learning tree data it owns and the map's folds.
export function useLayoutSaving(
    c: ChatState,
    {
        state,
        setState,
        tree,
        folded,
    }: {
        state?: State;
        setState: React.Dispatch<React.SetStateAction<State | undefined>>;
        tree?: Tree;
        folded: Set<string>;
    },
) {
    const { root, overview, expanded } = c;
    const [layoutFailed, setLayoutFailed] = useState(false);
    const saver = useRef<ReturnType<typeof layoutSaver<Layout>>>(undefined);
    const writeLayout = useRef<(root: string, batch: Batch<Layout>) => Promise<unknown>>(undefined);
    const leaving = useRef(false);
    writeLayout.current = (id, batch) =>
        api(
            `/api/trees/${id}/layout`,
            { ...batch.layout, positions: batch.positions },
            leaving.current,
        );
    useEffect(() => {
        const s = layoutSaver<Layout>(
            (id, batch) => writeLayout.current!(id, batch),
            setLayoutFailed,
        );
        saver.current = s;
        // Closing or reloading the page writes pending layout with requests that outlive it; flush starts every write synchronously.
        // shortcut: keepalive bodies share a 64 KB cap, so a huge unsaved layout fails on close; split batches if that ever happens.
        const leave = () => {
            leaving.current = true;
            void s.flush();
            leaving.current = false;
        };
        addEventListener('pagehide', leave);
        // The desktop shell awaits this before it closes the window and stops the server (desktop/main.mjs).
        Object.assign(window, { rabbitholeSaveLayout: s.flush });
        return () => {
            removeEventListener('pagehide', leave);
            Reflect.deleteProperty(window, 'rabbitholeSaveLayout');
            s.dispose();
        };
    }, []);

    // Trees show unsaved layout immediately; the saver writes it in one batch per minute.
    function withUnsaved(trees: Summary[]) {
        const dirty = saver.current?.pending() ?? new Map<string, Batch<Layout>>();
        const moved: Record<string, Point> = Object.assign(
            {},
            ...[...dirty.values()].map((b) => b.positions),
        );
        return trees.map((t) =>
            dirty.has(t.id) || moved[t.id]
                ? {
                      ...t,
                      ...(dirty.has(t.id) && { layout: dirty.get(t.id)!.layout }),
                      ...moved[t.id],
                  }
                : t,
        );
    }
    function markLayout(id: string, layout: Layout, positions?: Record<string, Point>) {
        saver.current?.mark(id, layout, positions);
        setState((s) => s && { ...s, trees: withUnsaved(s.trees) });
    }
    const layoutOf = (id: string): Layout =>
        saver.current?.pending().get(id)?.layout ??
        state?.trees.find((t) => t.id === id)?.layout ?? {
            folded: [],
            selected: null,
            panel: overview ? 'collapsed' : 'beside',
        };
    // One current snapshot per root: fold IDs, selected conversation, panel mode and viewport.
    useEffect(() => {
        if (!root || !state || !tree || rootOf(tree.id, state.trees) !== root) return;
        const current = state.trees.find((t) => t.id === root)?.layout;
        const layout: Layout = {
            folded: [...folded],
            selected: tree.id,
            panel: overview ? 'collapsed' : expanded ? 'expanded' : 'beside',
            ...(current?.viewport && { viewport: current.viewport }),
            ...(current?.ghosts && { ghosts: current.ghosts }),
        };
        if (JSON.stringify(layout) !== JSON.stringify(current)) markLayout(root, layout);
    }, [root, tree?.id, overview, expanded, folded, state?.trees]);

    function savePositions(positions: Record<string, Point>) {
        if (root) markLayout(root, layoutOf(root), positions);
    }
    function saveViewport(viewport: Viewport) {
        const layout = root ? layoutOf(root) : undefined;
        if (layout && JSON.stringify(layout.viewport) !== JSON.stringify(viewport))
            markLayout(root!, {
                ...layout,
                viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
            });
    }
    function saveGhost(ghost: string, at: Point) {
        const layout = root ? layoutOf(root) : undefined;
        if (layout) markLayout(root!, { ...layout, ghosts: { ...layout.ghosts, [ghost]: at } });
    }
    return {
        saver,
        layoutFailed,
        setLayoutFailed,
        withUnsaved,
        savePositions,
        saveViewport,
        saveGhost,
    };
}

export type LayoutSaving = ReturnType<typeof useLayoutSaving>;
