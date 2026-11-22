import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import type { Source } from '../map/TreeOverview';
import type { BranchState } from './branch';
import { DEFAULT_MAP_WIDTH, clampMapWidth, remPx, savedMapWidth } from '../map/mapWidth';

// View state and refs shared by the ChatPage hooks and regions; learning tree data lives in useLearningTrees,
// live turns, drafts and pending files in useReplyStream.
export function useChatState() {
    const [error, setError] = useState('');
    const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 48rem)').matches);
    const [today, setToday] = useState(() => new Date());
    const [tab, setTab] = useState('learning');
    const [drawer, setDrawer] = useState(false);
    const [renaming, setRenaming] = useState<{ id: string; place: 'header' | 'library' }>();
    const [mapWidth, setMapWidth] = useState(() => {
        try {
            return savedMapWidth(localStorage.getItem('rabbithole.map-width'));
        } catch {
            return DEFAULT_MAP_WIDTH;
        }
    });
    const [workspaceWidth, setWorkspaceWidth] = useState(() => window.innerWidth / remPx());
    useEffect(() => {
        try {
            localStorage.setItem('rabbithole.map-width', String(mapWidth));
        } catch {}
    }, [mapWidth]);
    const workspace = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = workspace.current!,
            observer = new ResizeObserver(() => setWorkspaceWidth(el.clientWidth / remPx()));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const shownMapWidth = clampMapWidth(mapWidth, workspaceWidth);
    const [root, setRoot] = useState<string>();
    const [overview, setOverview] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [statsOpen, setStatsOpen] = useState(false);
    const statsPanel = useRef<HTMLDivElement>(null);
    const [folds, setFolds] = useState<{ root: string; ids: string[] }>();
    // Conversations marked after arriving from a ghost tree on map `from`.
    const [ghostMarks, setGhostMarks] = useState<{ root: string; from: string; ids: string[] }>();
    const [transitionBox, setTransitionBox] = useState<string>();
    const overviewOrigin = useRef<{ id: string; control: string }>(undefined);
    const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
    const [figureTarget, setFigureTarget] = useState<{ conversation: string; artifact: string }>();
    const [messageTarget, setMessageTarget] = useState<{ conversation: string; message: string }>();
    const [branch, setBranch] = useState<BranchState>();
    const [selectingMessage, setSelectingMessage] = useState<string>();
    // The ask button remounts after the branch form closes, so keep its ref, not the element.
    const branchOrigin = useRef<React.RefObject<HTMLElement | null>>(undefined);
    const composer = useRef<ChatComposerInputHandle>(null);
    const focusComposer = useRef(false);
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
        setMapWidth,
        workspaceWidth,
        workspace,
        shownMapWidth,
        root,
        setRoot,
        overview,
        setOverview,
        expanded,
        setExpanded,
        statsOpen,
        setStatsOpen,
        statsPanel,
        folds,
        setFolds,
        ghostMarks,
        setGhostMarks,
        transitionBox,
        setTransitionBox,
        overviewOrigin,
        reveal,
        setReveal,
        figureTarget,
        setFigureTarget,
        messageTarget,
        setMessageTarget,
        branch,
        setBranch,
        selectingMessage,
        setSelectingMessage,
        branchOrigin,
        composer,
        focusComposer,
        toggleExpanded,
    };
}

export type ChatState = ReturnType<typeof useChatState>;
