import { useEffect, useMemo, useState, type SetStateAction } from 'react';
import { DEFAULT_MAP_WIDTH, clampMapWidth, savedMapWidth } from './mapWidth';
import type { ChatState } from '../chat/useChatState';
import type { State } from '../chat/types';

// Map view state: the open map's folds, ghost tree marks and the docked map width.
// useLearningTrees calls it with the app state it owns.
export function useMapViewState({ root, overview, workspaceWidth }: ChatState, state?: State) {
    // Folds the learner changed on map `root`; until then a map shows the folds saved in its layout.
    const [changed, setChanged] = useState<{ root: string; ids: Set<string> }>();
    const saved = state?.trees.find((t) => t.id === root)?.layout?.folded;
    const savedIds = useMemo(() => new Set(saved), [saved]);
    const folded = root && changed?.root === root ? changed.ids : savedIds;
    function setFolded(update: SetStateAction<Set<string>>) {
        if (!root) return;
        setChanged((previous) => {
            const current = previous?.root === root ? previous.ids : savedIds;
            const ids = typeof update === 'function' ? update(current) : update;
            return ids === current && previous?.root === root ? previous : { root, ids };
        });
    }
    // Deleted conversations leave the folds.
    const drop = (ids: Set<string>) =>
        setChanged((f) => f && { ...f, ids: new Set([...f.ids].filter((id) => !ids.has(id))) });
    // Conversations marked after arriving from a ghost tree on map `from`.
    const [ghostMarks, setGhostMarks] = useState<{ root: string; from: string; ids: string[] }>();
    useEffect(() => {
        if (!overview || root !== ghostMarks?.root) setGhostMarks(undefined);
    }, [overview, root]);
    const [mapWidth, setMapWidth] = useState(() => {
        try {
            return savedMapWidth(localStorage.getItem('rabbithole.map-width'));
        } catch {
            return DEFAULT_MAP_WIDTH;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem('rabbithole.map-width', String(mapWidth));
        } catch {}
    }, [mapWidth]);
    const shownMapWidth = clampMapWidth(mapWidth, workspaceWidth);
    return { folded, setFolded, drop, ghostMarks, setGhostMarks, shownMapWidth, setMapWidth };
}

export type MapViewState = ReturnType<typeof useMapViewState>;
