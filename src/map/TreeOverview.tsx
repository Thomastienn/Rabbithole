import { useTheme } from '@astryxdesign/core/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, useNodesState } from '@xyflow/react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';
import {
    MIN_ZOOM,
    foldHierarchy,
    offsetCoveredBoxes,
    placeBox,
    vimAction,
    type Point,
    type Viewport,
} from './canvas';
import type { ArtifactSummary, VisualPart } from '../media/artifacts';
import { conversationAddresses } from './treeList';
import {
    Conversation,
    ConversationTransition,
    MeasureHandles,
    type ConversationNode,
} from './Conversation';
import Branch from './Branch';
import { GhostTree } from './GhostTree';
import { useGhostTrees, type GhostOptions } from './useGhostTrees';
import { fit, useMapViewport } from './useMapViewport';
import { InkLegend, MapToolbar } from './MapControls';
import {
    branchEdges,
    familyLegend,
    keepCurrentFolded,
    revealAddedBranches,
    reconcileNodes,
    keyMovement,
    type Open,
} from './mapState';

export type Layout = {
    folded: string[];
    selected: string | null;
    panel: 'collapsed' | 'beside' | 'expanded';
    viewport?: Viewport;
    // Ghost tree positions on this map, keyed by the other tree's root.
    ghosts?: Record<string, Point>;
};
export type Summary = {
    id: string;
    title: string;
    created: number;
    parent: string | null;
    messageId: string | null;
    start: number | null;
    end: number | null;
    passage: string | null;
    artifactId?: string;
    line?: number;
    label?: string;
    explanation?: string;
    // A picked visual part's trail and step.
    trail?: string[];
    step?: number | null;
    x: number | null;
    y: number | null;
    layout?: Layout | null;
    // The conversation's explored concept name, and how many learner messages it holds.
    concept?: string | null;
    learnerMessages?: number;
};
export type Source = { messageId: string; text: string } & (
    | { start: number; end: number; artifactId?: undefined }
    // A discussion passage: offsets inside one line of a discussion card.
    | { artifactId: string; line: number; start: number; end: number }
    | ({ artifactId: string; line?: undefined; start?: undefined; end?: undefined } & VisualPart)
);
export type Preview = {
    id: string;
    role: string;
    text: string;
    status: string;
    artifacts?: ArtifactSummary[];
}[];
export type MapActions = {
    expand: () => void;
    collapse: () => void;
    keep: () => void;
    canKeep: boolean;
};
const noStubs: ConversationNode['data']['stubs'] = [];
const noMarks: string[] = [];
const nodeTypes = { conversation: Conversation, ghost: GhostTree };
const edgeTypes = { branch: Branch };

export default function TreeOverview({
    root,
    trees,
    previews,
    active,
    open,
    retry,
    focus,
    focusControl,
    transition,
    save,
    saveViewport,
    menu,
    toolbar,
    selected,
    current,
    initialFolded,
    onFold,
    vim,
    marked = noMarks,
    from,
    ghosts,
}: {
    vim?: boolean;
    // Conversations marked after arriving from the ghost tree of map `from`.
    marked?: string[];
    from?: string;
    ghosts: GhostOptions;
    toolbar?: ReactNode;
    saveViewport: (viewport: Viewport) => void;
    initialFolded?: string[];
    onFold: (folded: string[]) => void;
    menu: (actions: MapActions) => ReactNode;
    root: string;
    trees: Summary[];
    previews: Record<string, Preview>;
    active: string[];
    open: Open;
    retry: (id: string) => void;
    focus?: string;
    focusControl?: string;
    transition?: string;
    selected?: string;
    current?: string;
    save: (positions: Record<string, Point>) => void;
}) {
    const { mode } = useTheme();
    const callbacks = useRef({ open, retry, save });
    callbacks.current = { open, retry, save };
    const openNode = useCallback<Open>(
        (id, source, message, artifact) => callbacks.current.open(id, source, message, artifact),
        [],
    );
    const retryNode = useCallback((id: string) => callbacks.current.retry(id), []);
    const [nodes, setNodes, onNodesChange] = useNodesState<ConversationNode>([]);
    const { flow, savedViewport, navigated, zoom, setZoom, pan, zoomOut, zoomIn, fitTree } =
        useMapViewport({ root, trees, nodes, selected });
    const [canCull, setCanCull] = useState(false);
    const [folded, setFolded] = useState<Set<string>>(() => new Set(initialFolded));
    useEffect(() => onFold([...folded]), [folded]);
    const known = useRef(new Set(trees.map((t) => t.id)));
    const createdBranches = useRef(new Map<string, number>());
    useEffect(() => {
        const added = trees.filter((t) => !known.current.has(t.id));
        known.current = new Set(trees.map((t) => t.id));
        if (!added.length) return;
        for (const child of added) createdBranches.current.set(child.id, performance.now());
        setFolded((previous) => revealAddedBranches(previous, added, trees));
    }, [trees]);
    const toggle = useCallback(
        (id: string) => {
            const focused = document.activeElement?.closest<HTMLElement>('.react-flow__node');
            if (!folded.has(id) && focused && focused.dataset.id !== id)
                document.getElementById(`fold-${id}`)?.focus({ preventScroll: true });
            setFolded((previous) => {
                const next = new Set(previous);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        },
        [folded],
    );
    function keepCurrent() {
        const next = keepCurrentFolded(root, trees, current);
        if (next) setFolded(next);
    }
    const placed = useRef(new Set<string>());
    const [notice, setNotice] = useState('');
    const hierarchy = useMemo(() => foldHierarchy(root, trees, folded), [root, trees, folded]);
    const focusedPath = useMemo(() => {
        const path = new Set<string>();
        let id = current;
        while (id && !path.has(id)) {
            path.add(id);
            id = trees.find((t) => t.id === id)?.parent ?? undefined;
        }
        return path;
    }, [current, trees]);
    const addresses = useMemo(() => conversationAddresses(trees), [trees]);
    const legend = familyLegend(root, trees, addresses);
    const desiredNodes = useMemo(
        () =>
            hierarchy.map(({ conversation, sources, hidden, stubs }): ConversationNode => {
                const id = conversation.id;
                return {
                    id,
                    type: 'conversation',
                    hidden,
                    position: { x: conversation.x ?? 0, y: conversation.y ?? 0 },
                    ariaLabel: `${conversation.title}.${marked.includes(id) ? ' Explored where you came from.' : ''} Use arrow keys to move; Shift moves farther.`,
                    data: {
                        conversation,
                        sources,
                        preview: previews[id],
                        open: openNode,
                        retry: retryNode,
                        active: active.includes(id),
                        focused: current === id,
                        focus: focus === id && !hidden,
                        focusControl: focus === id ? focusControl : undefined,
                        childCount: sources.length,
                        address: addresses.get(id)?.address ?? '1',
                        ink: addresses.get(id)?.ink ?? 0,
                        stubs: stubs.length
                            ? stubs.map((stub) => ({ ...stub, ...addresses.get(stub.child.id)! }))
                            : noStubs,
                        folded: folded.has(id),
                        marked: marked.includes(id),
                        created: createdBranches.current.get(id),
                        toggle,
                    },
                };
            }),
        [
            hierarchy,
            previews,
            active,
            openNode,
            retryNode,
            focus,
            focusControl,
            current,
            folded,
            toggle,
            addresses,
            marked,
        ],
    );
    useEffect(() => {
        setNodes((previous) => reconcileNodes(previous, desiredNodes));
    }, [desiredNodes, setNodes]);
    const measured = useRef(new Map<string, { height: number; hidden: boolean }>());
    const deferredGrowth = useRef(new Set<string>());
    const deferredReveal = useRef(new Set<string>());
    useEffect(() => {
        if (
            !nodes.length ||
            nodes.some(
                (n) => !n.hidden && (!n.measured?.width || !n.measured?.height || !n.data.preview),
            )
        )
            return;
        // React Flow applies node data in its own store before the transcript reaches the DOM.
        const frame = requestAnimationFrame(() => {
            // Measure the initial transcripts before culling; cached empty-box heights break Fit tree.
            if (
                !canCull &&
                nodes.every(
                    (n) =>
                        n.hidden ||
                        document.querySelector<HTMLElement>(`.react-flow__node[data-id="${n.id}"]`)
                            ?.offsetHeight === n.measured?.height,
                )
            )
                setCanCull(true);
            let next = [...nodes];
            const positions: Record<string, Point> = {};
            for (let i = 0; i < next.length; i++) {
                const node = next[i];
                if (node.hidden || node.dragging) continue;
                if (placed.current.has(node.id)) continue;
                placed.current.add(node.id);
                if (node.data.conversation.x !== null && node.data.conversation.y !== null)
                    continue;
                const parent = next.find((n) => n.id === node.data.conversation.parent);
                const handle = document.querySelector<HTMLElement>(`[data-source="${node.id}"]`);
                const parentElement = handle?.closest('.react-flow__node');
                const bounds = handle?.getBoundingClientRect();
                const cachedHandle =
                    parent &&
                    flow.current
                        ?.getInternalNode(parent.id)
                        ?.internals.handleBounds?.source?.find((h) => h.id === node.id);
                const offset =
                    bounds && parentElement
                        ? (bounds.top +
                              bounds.height / 2 -
                              parentElement.getBoundingClientRect().top) /
                          (flow.current?.getZoom() ?? 1)
                        : cachedHandle
                          ? cachedHandle.y + cachedHandle.height / 2
                          : 0;
                const preferred = parent
                    ? {
                          x: parent.position.x + parent.measured!.width! + 96,
                          y: parent.position.y + offset,
                      }
                    : { x: 0, y: 0 };
                const occupied = next
                    .filter(
                        (n) =>
                            !n.hidden &&
                            n.id !== node.id &&
                            n.measured?.width &&
                            n.measured?.height &&
                            (placed.current.has(n.id) || n.data.conversation.x !== null),
                    )
                    .map((n) => ({
                        ...n.position,
                        width: n.measured!.width!,
                        height: n.measured!.height!,
                    }));
                const position = placeBox(
                    preferred,
                    { width: node.measured!.width!, height: node.measured!.height! },
                    occupied,
                );
                next[i] = { ...node, position };
                positions[node.id] = position;
            }
            const growing = next
                .filter(
                    (n) =>
                        !n.hidden &&
                        measured.current.has(n.id) &&
                        !measured.current.get(n.id)!.hidden &&
                        n.measured!.height! > measured.current.get(n.id)!.height,
                )
                .map((n) => n.id);
            const revealed = next
                .filter((n) => !n.hidden && measured.current.get(n.id)?.hidden)
                .map((n) => n.id);
            for (const id of growing) deferredGrowth.current.add(id);
            for (const id of revealed) deferredReveal.current.add(id);
            Object.assign(
                positions,
                offsetCoveredBoxes(
                    next.map((n) => ({
                        id: n.id,
                        parent: n.data.conversation.parent,
                        ...n.position,
                        width: n.measured?.width ?? 0,
                        height: n.measured?.height ?? 0,
                        hidden: n.hidden,
                        dragging: n.dragging,
                    })),
                    [...deferredGrowth.current],
                    [...deferredReveal.current],
                ),
            );
            if (!next.some((n) => n.dragging)) {
                deferredGrowth.current.clear();
                deferredReveal.current.clear();
            }
            measured.current = new Map(
                next.map((n) => [n.id, { height: n.measured?.height ?? 0, hidden: !!n.hidden }]),
            );
            if (Object.keys(positions).length) {
                next = next.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n));
                setNodes(next);
                callbacks.current.save(positions);
                if (!navigated.current)
                    void requestAnimationFrame(() => flow.current?.fitView(fit));
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [nodes]);
    const edges = useMemo(
        () => branchEdges(hierarchy, folded, focusedPath, addresses, createdBranches.current),
        [hierarchy, folded, focusedPath, addresses],
    );
    const ghost = useGhostTrees({ trees, root, from, nodes, ...ghosts });
    // Ghost nodes stay out of `nodes`: conversation placement covers conversations only.
    const mapNodes = useMemo(() => [...nodes, ...(ghost.nodes as never[])], [nodes, ghost.nodes]);
    const mapEdges = useMemo(() => [...edges, ...ghost.edges], [edges, ghost.edges]);
    return (
        <>
            <MapToolbar zoom={zoom} zoomOut={zoomOut} zoomIn={zoomIn} fitTree={fitTree}>
                {menu({
                    expand: () => setFolded(new Set()),
                    collapse: () => setFolded(new Set([root])),
                    keep: keepCurrent,
                    canKeep: !!current && trees.some((t) => t.id === current),
                })}
                {toolbar}
            </MapToolbar>
            <InkLegend legend={legend} root={root} />
            <Text role="status" type="supporting" aria-live="polite" className="sr-only">
                {notice}
            </Text>
            <VStack
                className="tree-canvas"
                role="region"
                tabIndex={0}
                aria-label="Conversation tree overview"
                onWheelCapture={(e) => {
                    if (e.ctrlKey || e.metaKey) e.stopPropagation();
                }}
                onTouchStartCapture={(e) => {
                    if (e.touches.length > 1) e.stopPropagation();
                }}
                onKeyDown={(e) => {
                    if (e.altKey || e.ctrlKey || e.metaKey) return;
                    const nodeTarget =
                        e.target === (e.target as HTMLElement).closest('.react-flow__node')
                            ? (e.target as HTMLElement).dataset.id
                            : undefined;
                    if (nodeTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        open(nodeTarget);
                        return;
                    }
                    // Aliases only on the map or a box wrapper itself, and never while a dialog or menu is open (closed dialogs stay mounted).
                    const alias =
                        vim &&
                        (nodeTarget || e.target === e.currentTarget) &&
                        ![
                            ...document.querySelectorAll<HTMLElement>(
                                '[aria-haspopup][aria-expanded="true"], dialog[open], [aria-modal="true"]',
                            ),
                        ].some((open) => open.checkVisibility())
                            ? vimAction(e.nativeEvent)
                            : undefined;
                    if (alias === 'zoomIn' || alias === 'zoomOut' || alias === 'fit') {
                        e.preventDefault();
                        e.stopPropagation();
                        ({ zoomIn, zoomOut, fit: fitTree })[alias]();
                        return;
                    }
                    const key = alias ?? e.key;
                    const delta = keyMovement(key, e.shiftKey, e.target === e.currentTarget);
                    if (!delta) return;
                    if (e.target === e.currentTarget) {
                        e.preventDefault();
                        e.stopPropagation();
                        pan(delta.x, delta.y);
                        return;
                    }
                    if (e.target !== (e.target as HTMLElement).closest('.react-flow__node')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const id = (e.target as HTMLElement).dataset.id;
                    const node = nodes.find((n) => n.id === id);
                    if (!node) return;
                    const position = {
                        x: node.position.x + delta.x,
                        y: node.position.y + delta.y,
                    };
                    setNodes((current) =>
                        current.map((n) => (n.id === id ? { ...n, position, selected: true } : n)),
                    );
                    save({ [node.id]: position });
                    setNotice(
                        `${node.data.conversation.title} moved to ${Math.round(position.x)}, ${Math.round(position.y)}.`,
                    );
                }}
            >
                <ConversationTransition.Provider value={transition}>
                    <ReactFlow<ConversationNode>
                        nodes={mapNodes}
                        onlyRenderVisibleElements={canCull && nodes.length > 50}
                        onNodesChange={(changes) => onNodesChange(ghost.move(changes))}
                        edges={mapEdges}
                        edgeTypes={edgeTypes}
                        nodeTypes={nodeTypes}
                        onInit={(instance) => {
                            flow.current = instance;
                        }}
                        onMoveStart={(event) => {
                            if (event) navigated.current = true;
                        }}
                        onMove={(_, viewport) => setZoom(viewport.zoom)}
                        onMoveEnd={(_, viewport) => saveViewport(viewport)}
                        defaultViewport={savedViewport}
                        onNodeClick={(event, node) => {
                            if (
                                node.type === 'conversation' &&
                                !(event.target as HTMLElement).closest(
                                    'button, a, input, select, textarea, [role="button"], [role="menuitem"], .nodrag',
                                )
                            )
                                open(node.id);
                        }}
                        onNodeDragStop={(_, node) => {
                            if (node.type !== 'conversation') return;
                            save({ [node.id]: node.position });
                            setNotice(
                                `${node.data.conversation.title} moved to ${Math.round(node.position.x)}, ${Math.round(node.position.y)}.`,
                            );
                        }}
                        nodesConnectable={false}
                        edgesReconnectable={false}
                        autoPanOnNodeFocus={false}
                        deleteKeyCode={null}
                        disableKeyboardA11y
                        colorMode={mode}
                        proOptions={{ hideAttribution: true }}
                        fitView={!savedViewport}
                        fitViewOptions={fit}
                        minZoom={MIN_ZOOM}
                        maxZoom={1.5}
                        zoomOnScroll
                        zoomOnPinch={false}
                        zoomActivationKeyCode={null}
                    >
                        <MeasureHandles nodes={nodes} />
                    </ReactFlow>
                </ConversationTransition.Provider>
            </VStack>
        </>
    );
}
