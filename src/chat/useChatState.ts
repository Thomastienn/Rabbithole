import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import type { Preview, Source } from '../map/TreeOverview';
import type { Turn } from './turn';
import type { Anchor } from './branch';
import type { State, Tree } from './types';
import { conversationAddresses } from '../map/treeList';
import { DEFAULT_MAP_WIDTH, clampMapWidth, remPx, savedMapWidth } from '../map/mapWidth';
import { session } from '../media/ExportButton';

// State and refs shared by the ChatPage hooks and regions; each hook takes this object.
export function useChatState() {
    const [state, setState] = useState<State>();
    session.csrf = state?.csrf ?? '';
    const [tree, setTree] = useState<Tree>();
    const addresses = useMemo(() => conversationAddresses(state?.trees ?? []), [state?.trees]);
    const [previews, setPreviews] = useState<Record<string, Preview>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    // Pending composer files, keyed like drafts: a conversation id, or 'first' for the first question.
    const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 48rem)').matches);
    const [today, setToday] = useState(() => new Date());
    const [tab, setTab] = useState('learning');
    const [drawer, setDrawer] = useState(false);
    const [renaming, setRenaming] = useState<{ id: string; place: 'header' | 'library' }>();
    const removed = useRef(new Set<string>());
    const renamed = useRef(new Map<string, string>());
    const streams = useRef(new Map<string, AbortController>());
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
    useEffect(() => {
        if (!statsOpen) return;
        const frame = requestAnimationFrame(() =>
            statsPanel.current?.scrollIntoView({ block: 'nearest' }),
        );
        return () => cancelAnimationFrame(frame);
    }, [statsOpen, tree?.id]);
    const [folds, setFolds] = useState<{ root: string; ids: string[] }>();
    // Conversations marked after arriving from a ghost tree on map `from`.
    const [ghostMarks, setGhostMarks] = useState<{ root: string; from: string; ids: string[] }>();
    const [transitionBox, setTransitionBox] = useState<string>();
    const overviewOrigin = useRef<{ id: string; control: string }>(undefined);
    const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
    const [figureTarget, setFigureTarget] = useState<{ conversation: string; artifact: string }>();
    const [messageTarget, setMessageTarget] = useState<{ conversation: string; message: string }>();
    const [branch, setBranch] = useState<{ parent: string; anchor: Anchor; question: string }>();
    const [selectingMessage, setSelectingMessage] = useState<string>();
    // The ask button remounts after the branch form closes, so keep its ref, not the element.
    const branchOrigin = useRef<React.RefObject<HTMLElement | null>>(undefined);
    const composer = useRef<ChatComposerInputHandle>(null);
    const focusComposer = useRef(false);
    const selected = useRef<string | undefined>(undefined);
    const request = useRef(0);
    const turns = useRef(new Map<string, Turn>());
    const checkpoints = useRef(0);
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

    const visibleIds = (() => {
        if (!root || !state) return [];
        const ids = [root];
        for (let i = 0; i < ids.length; i++)
            for (const child of state.trees)
                if (child.parent === ids[i] && !ids.includes(child.id)) ids.push(child.id);
        return ids;
    })();
    function changeView(showOverview: boolean, id?: string) {
        // Snapshotting thousands of preview rows stalls large maps; their viewport still animates.
        if (
            visibleIds.length > 50 ||
            !document.startViewTransition ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setOverview(showOverview);
            return;
        }
        flushSync(() => setTransitionBox(id));
        document.startViewTransition(() => flushSync(() => setOverview(showOverview)));
    }
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
    function returnToTree() {
        setExpanded(false);
        // Chats reached by branching have no map origin; return focus to their own box.
        if (!overviewOrigin.current && tree)
            overviewOrigin.current = { id: tree.id, control: `open-${tree.id}` };
        changeView(true, overviewOrigin.current?.id);
    }

    async function api(path: string, body?: unknown) {
        const response = await fetch(
            path,
            body === undefined
                ? undefined
                : {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'X-Rabbithole-CSRF': state?.csrf ?? '',
                      },
                      body: JSON.stringify(body),
                  },
        );
        const data = await response.json();
        if (!response.ok)
            throw Object.assign(new Error(data.error ?? 'Request failed. Reload and try again.'), {
                data,
            });
        return data;
    }

    return {
        state,
        setState,
        tree,
        setTree,
        addresses,
        previews,
        setPreviews,
        drafts,
        setDrafts,
        pendingFiles,
        setPendingFiles,
        error,
        setError,
        busy,
        setBusy,
        loading,
        setLoading,
        mobile,
        today,
        tab,
        setTab,
        drawer,
        setDrawer,
        renaming,
        setRenaming,
        removed,
        renamed,
        streams,
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
        selected,
        request,
        turns,
        checkpoints,
        visibleIds,
        changeView,
        toggleExpanded,
        returnToTree,
        api,
    };
}

export type ChatState = ReturnType<typeof useChatState>;
