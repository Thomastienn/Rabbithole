import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { remPx } from '../map/mapWidth';

// View state and refs shared by the ChatPage hooks and regions; learning tree data lives in useLearningTrees,
// live turns, drafts and pending files in useReplyStream, the branch form in useBranchForm,
// chat targets in useChatTargets and map view state in useMapViewState.
export function useChatState() {
    const [error, setError] = useState('');
    const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 48rem)').matches);
    const [today, setToday] = useState(() => new Date());
    const [tab, setTab] = useState('learning');
    const [drawer, setDrawer] = useState(false);
    const [renaming, setRenaming] = useState<{ id: string; place: 'header' | 'library' }>();
    const [workspaceWidth, setWorkspaceWidth] = useState(() => window.innerWidth / remPx());
    const workspace = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = workspace.current!,
            observer = new ResizeObserver(() => setWorkspaceWidth(el.clientWidth / remPx()));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const [root, setRoot] = useState<string>();
    const [overview, setOverview] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [statsOpen, setStatsOpen] = useState(false);
    const statsPanel = useRef<HTMLDivElement>(null);
    const [transitionBox, setTransitionBox] = useState<string>();
    const overviewOrigin = useRef<{ id: string; control: string }>(undefined);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 48rem)');
        const resize = () => {
            setMobile(media.matches);
            setDrawer(false);
        };
        media.addEventListener('change', resize);
        return () => media.removeEventListener('change', resize);
    }, []);
    useEffect(() => {
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        const timer = setTimeout(() => setToday(new Date()), midnight.getTime() - Date.now());
        return () => clearTimeout(timer);
    }, [today]);

    // Map stays mounted while hidden, so its pan and zoom are intact when it returns.
    function toggleExpanded() {
        const panel = document.querySelector<HTMLElement>('.focused-chat');
        if (
            !document.startViewTransition ||
            !panel ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setExpanded((e) => !e);
            return;
        }
        panel.style.viewTransitionName = 'chat-panel';
        document
            .startViewTransition(() => flushSync(() => setExpanded((e) => !e)))
            .finished.finally(() => {
                panel.style.viewTransitionName = '';
            });
    }
    return {
        error,
        setError,
        mobile,
        today,
        tab,
        setTab,
        drawer,
        setDrawer,
        renaming,
        setRenaming,
        workspaceWidth,
        workspace,
        root,
        setRoot,
        overview,
        setOverview,
        expanded,
        setExpanded,
        statsOpen,
        setStatsOpen,
        statsPanel,
        transitionBox,
        setTransitionBox,
        overviewOrigin,
        toggleExpanded,
    };
}

export type ChatState = ReturnType<typeof useChatState>;
