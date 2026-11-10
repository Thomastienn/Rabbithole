import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Handle, Position, useNodesInitialized, useNodesState, useUpdateNodeInternals, type NodeProps, type Node, type ReactFlowInstance } from '@xyflow/react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MinusIcon, PlusIcon, ArrowsPointingOutIcon, ChevronDownIcon, ChevronRightIcon, LinkIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { MIN_ZOOM, offsetCoveredBoxes, parseViewport, placeBox, vimAction, type Point, type Viewport } from './canvas';
import type { ArtifactSummary } from './artifacts';

export type Layout = { folded: string[]; selected: string | null; panel: 'collapsed' | 'beside' | 'expanded'; viewport?: Viewport };
export type Summary = { id: string; title: string; created: number; parent: string | null; messageId: string | null; start: number | null; end: number | null; passage: string | null; x: number | null; y: number | null; layout?: Layout | null };
export type Source = { messageId: string; start: number; end: number; text: string };
export type Preview = { id: string; role: string; text: string; status: string; artifacts?: ArtifactSummary[] }[];
type Open = (id: string, source?: Source) => void;
export type MapActions = { expand: () => void; collapse: () => void; keep: () => void; canKeep: boolean };
type ConversationNode = Node<{ conversation: Summary; sources: Summary[]; preview?: Preview; open: Open; active: boolean; focus: boolean; focusControl?: string; childCount: number; hiddenCount: number; folded: boolean; toggle: (id: string) => void }, 'conversation'>;
const fit = { padding: 0.2, maxZoom: 1 };
const noSources: Summary[] = [];
const ConversationTransition = createContext<string | undefined>(undefined);
const sourceOf = (t: Summary): Source => ({ messageId: t.messageId!, start: t.start!, end: t.end!, text: t.passage! });

const Conversation = memo(function Conversation({ data }: NodeProps<ConversationNode>) {
  const t = data.conversation;
  const transition = useContext(ConversationTransition);
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!data.focus || !initialized) return;
    // Only restore focus lost by leaving chat; a box remounting after a fold must not steal it.
    const frame = requestAnimationFrame(() => { if (!document.activeElement?.closest('.overview')) document.getElementById(data.focusControl ?? `open-${t.id}`)?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [data.focus, data.focusControl, t.id, initialized]);
  const preview = data.preview;
  return <VStack gap={2} padding={3} className="conversation-box" data-active={data.active}>
    {t.parent && <Handle type="target" position={Position.Left} />}
    <HStack gap={1} vAlign="center">
      {data.childCount > 0 && <IconButton id={`fold-${t.id}`} className="nodrag nopan" label={`${data.folded ? 'Expand' : 'Collapse'} descendants of ${t.title}`} tooltip={`${data.folded ? 'Expand' : 'Collapse'} descendants`} aria-expanded={!data.folded} icon={data.folded ? <ChevronRightIcon /> : <ChevronDownIcon />} variant="ghost" size="sm" onClick={e => { e.stopPropagation(); data.toggle(t.id); }} />}
      <Button id={`open-${t.id}`} className="node-title nodrag nopan" label={`Open ${t.title}`} variant="ghost" size="sm" onClick={() => data.open(t.id)}><Heading level={3} style={{ viewTransitionName: transition === t.id ? 'conversation' : undefined }}>{t.title}</Heading></Button>
      {data.active && <Text className="activity-dot" role="status"><Text className="sr-only">Responding</Text></Text>}
      {t.parent && <IconButton id={`reveal-${t.id}`} className="node-extra nodrag nopan" label={`Reveal source passage for ${t.title}`} tooltip={`From “${t.passage}”`} icon={<LinkIcon />} variant="ghost" size="sm" onClick={() => data.open(t.parent!, sourceOf(t))} />}
    </HStack>
    {!!preview?.length && <VStack gap={1} className="node-preview">
      {preview.map(m => {
        const sources = data.sources.filter(child => child.messageId === m.id);
        return <VStack key={m.id} gap={0} className="node-message" data-message={m.id} data-role={m.role} style={sources.length ? { minHeight: `calc(var(--spacing-2) * ${sources.length + 1})` } : undefined}>
          <Text type="supporting" color={m.role === 'user' ? 'primary' : 'secondary'} className={m.role === 'user' ? 'question-bubble' : undefined} maxLines={3}><Text type="inherit" className="sr-only">{m.role === 'user' ? 'Question: ' : 'Answer: '}</Text>{m.text || (m.status === 'streaming' ? 'Thinking…' : 'No text.')}</Text>
          {m.role === 'assistant' && m.status !== 'completed' && <Text type="supporting" color="secondary">{m.status === 'streaming' ? 'Replying…' : `Reply ${m.status}.`}</Text>}
          {m.role === 'assistant' && m.artifacts?.map(a => <Text key={a.id} type="supporting" color="secondary">{a.kind === 'video' ? `Video: ${a.title} · ${a.status === 'pending' ? (a.phase === 'rendering' ? 'rendering…' : 'preparing…') : a.status === 'ready' ? (a.available === false ? 'unavailable' : 'ready') : a.status}` : <>Diagram: {a.title}{a.status === 'pending' ? ' · creating…' : a.status === 'failed' ? ' · unavailable' : ''}</>}</Text>)}
          {sources.map((child, index) => <Handle key={child.id} id={child.id} data-source={child.id} type="source" position={Position.Right} style={{ top: `${100 * (index + 1) / (sources.length + 1)}%` }} />)}
        </VStack>;
      })}
      {preview.at(-1)?.role === 'user' && <Text type="supporting" color="secondary"><Text type="inherit" className="sr-only">Answer: </Text>No reply yet.</Text>}
    </VStack>}
    {data.folded && <Text type="supporting" color="secondary">{data.hiddenCount} hidden {data.hiddenCount === 1 ? 'branch' : 'branches'}</Text>}
    {data.sources.filter(child => !preview?.some(m => m.id === child.messageId)).map(child => <Handle key={child.id} id={child.id} data-source={child.id} type="source" position={Position.Right} />)}
  </VStack>;
});
const nodeTypes = { conversation: Conversation };

// Batch handle measurements so loading 200 transcripts schedules one React Flow update.
function MeasureHandles({ nodes }: { nodes: ConversationNode[] }) {
  const update = useUpdateNodeInternals();
  const previous = useRef(new Map<string, ConversationNode['data']>());
  useEffect(() => {
    const changed = nodes.filter(n => {
      const old = previous.current.get(n.id);
      return !n.hidden && (!old || old.preview !== n.data.preview || old.sources !== n.data.sources || old.folded !== n.data.folded);
    });
    previous.current = new Map(nodes.filter(n => !n.hidden).map(n => [n.id, n.data]));
    if (changed.length) update(changed.map(n => n.id));
  }, [nodes, update]);
  return null;
}

export default function TreeOverview({ root, trees, previews, active, open, focus, focusControl, transition, save, saveViewport, menu, toolbar, selected, current, initialFolded, onFold, vim }: { vim?: boolean; toolbar?: ReactNode; saveViewport: (viewport: Viewport) => void; initialFolded?: string[]; onFold: (folded: string[]) => void; menu: (actions: MapActions) => ReactNode; root: string; trees: Summary[]; previews: Record<string, Preview>; active: string[]; open: Open; focus?: string; focusControl?: string; transition?: string; selected?: string; current?: string; save: (positions: Record<string, Point>) => void }) {
  const flow = useRef<ReactFlowInstance<ConversationNode>>(null);
  const callbacks = useRef({ open, save });
  callbacks.current = { open, save };
  const openNode = useCallback<Open>((id, source) => callbacks.current.open(id, source), []);
  // Legacy views lived in localStorage; read once until the first batched save replaces them.
  const [savedViewport] = useState(() => {
    try { return trees.find(t => t.id === root)?.layout?.viewport ?? parseViewport(localStorage.getItem(`treetutor.viewport.${root}`)); } catch { return undefined; }
  });
  const navigated = useRef(!!savedViewport);
  const [nodes, setNodes, onNodesChange] = useNodesState<ConversationNode>([]);
  const [canCull, setCanCull] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(() => new Set(initialFolded));
  useEffect(() => onFold([...folded]), [folded]);
  const known = useRef(new Set(trees.map(t => t.id)));
  useEffect(() => {
    const added = trees.filter(t => !known.current.has(t.id));
    known.current = new Set(trees.map(t => t.id));
    if (!added.length) return;
    setFolded(previous => {
      const next = new Set(previous);
      for (const child of added) {
        let parent = child.parent;
        const seen = new Set<string>();
        while (parent && !seen.has(parent)) { seen.add(parent); next.delete(parent); parent = trees.find(t => t.id === parent)?.parent ?? null; }
      }
      return next;
    });
  }, [trees]);
  const toggle = useCallback((id: string) => {
    const focused = document.activeElement?.closest<HTMLElement>('.react-flow__node');
    if (!folded.has(id) && focused && focused.dataset.id !== id) document.getElementById(`fold-${id}`)?.focus({ preventScroll: true });
    setFolded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, [folded]);
  function keepCurrent() {
    const path = new Set<string>();
    let id = current;
    while (id && !path.has(id)) { path.add(id); id = trees.find(t => t.id === id)?.parent ?? undefined; }
    if (!path.has(root)) return;
    setFolded(new Set(trees.filter(t => t.parent && t.parent !== current && path.has(t.parent) && !path.has(t.id)).map(t => t.id)));
  }
  const placed = useRef(new Set<string>());
  const [zoom, setZoom] = useState(savedViewport?.zoom ?? 1);
  const [notice, setNotice] = useState('');
  // A restored viewport wins for the restored selection; later selections are still revealed.
  const restored = trees.find(t => t.id === root)?.layout;
  const restoredSelection = useRef(savedViewport && restored?.panel !== 'collapsed' ? restored?.selected ?? undefined : undefined);
  useEffect(() => {
    if (!selected) return;
    if (restoredSelection.current === selected) return;
    restoredSelection.current = undefined;
    const frame = requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLElement>('.tree-canvas');
      const instance = flow.current, node = instance?.getNode(selected);
      if (!canvas || !node?.measured?.width || !node.measured.height || !instance) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const view = instance.getViewport();
      const toolbar = document.querySelector('.map-toolbar')?.getBoundingClientRect();
      const top = toolbar ? toolbar.bottom - bounds.top + toolbar.height / 2 : 0;
      // Scale a tall transcript to the available map; keep its title reachable at 20%.
      const zoom = Math.max(0.2, Math.min(view.zoom, bounds.width / node.measured.width, (bounds.height - top) / node.measured.height));
      const left = node.position.x * zoom + view.x, y = node.position.y * zoom + view.y;
      const right = left + node.measured.width * zoom, bottom = y + node.measured.height * zoom;
      const dx = left < 0 ? -left : right > bounds.width ? bounds.width - right : 0;
      const dy = y < top || node.measured.height * zoom > bounds.height - top ? top - y : bottom > bounds.height ? bounds.height - bottom : 0;
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches || (nodes.length > 50 && zoom > view.zoom * 2) ? 0 : 200;
      if (dx || dy || zoom !== view.zoom) void instance.setViewport({ x: view.x + dx, y: view.y + dy, zoom }, { duration });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, nodes.length, nodes.find(node => node.id === selected)?.measured?.width, nodes.find(node => node.id === selected)?.measured?.height]);
  function pan(x: number, y: number) {
    const instance = flow.current;
    if (!instance) return;
    navigated.current = true;
    const view = instance.getViewport();
    void instance.setViewport({ ...view, x: view.x + x, y: view.y + y });
  }
  const zoomOut = () => { navigated.current = true; void flow.current?.zoomOut(); };
  const zoomIn = () => { navigated.current = true; void flow.current?.zoomIn(); };
  const fitTree = () => { navigated.current = true; void flow.current?.fitView(fit); };
  const hierarchy = useMemo(() => {
    const byId = new Map(trees.map(t => [t.id, t]));
    const children = new Map<string, Summary[]>();
    for (const t of trees) if (t.parent) children.set(t.parent, [...(children.get(t.parent) ?? []), t]);
    for (const list of children.values()) list.reverse();
    const queue = [root], seen = new Set<string>(), hidden = new Set<string>();
    const result: { conversation: Summary; sources: Summary[]; hidden: boolean; hiddenCount: number }[] = [];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i], conversation = byId.get(id);
      if (!conversation || seen.has(id)) continue;
      seen.add(id);
      const sources = children.get(id) ?? [];
      if (hidden.has(id) || folded.has(id)) for (const child of sources) hidden.add(child.id);
      result.push({ conversation, sources, hidden: hidden.has(id), hiddenCount: 0 });
      queue.push(...sources.map(t => t.id));
    }
    const counts = new Map<string, number>();
    for (const item of [...result].reverse()) {
      const count = item.sources.reduce((sum, t) => sum + 1 + (counts.get(t.id) ?? 0), 0);
      counts.set(item.conversation.id, count); item.hiddenCount = count;
    }
    return result;
  }, [root, trees, folded]);
  const desiredNodes = useMemo(() => hierarchy.map(({ conversation, sources, hidden, hiddenCount }): ConversationNode => {
    const id = conversation.id;
    return { id, type: 'conversation', hidden, position: { x: conversation.x ?? 0, y: conversation.y ?? 0 }, ariaLabel: `${conversation.title}. Use arrow keys to move; Shift moves farther.`, data: { conversation, sources: folded.has(id) ? noSources : sources, preview: previews[id], open: openNode, active: active.includes(id), focus: focus === id && !hidden, focusControl: focus === id ? focusControl : undefined, childCount: sources.length, hiddenCount, folded: folded.has(id), toggle } };
  }), [hierarchy, previews, active, openNode, focus, focusControl, folded, toggle]);
  useEffect(() => {
    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      return desiredNodes.map(node => {
        const old = byId.get(node.id);
        if (old && old.data.sources.length === node.data.sources.length && node.data.sources.every((source, i) => source === old.data.sources[i])) node.data.sources = old.data.sources;
        if (old && old.hidden === node.hidden && (Object.keys(node.data) as (keyof ConversationNode['data'])[]).every(key => old.data[key] === node.data[key])) return old;
        return { ...old, ...node, position: old?.position ?? node.position };
      });
    });
  }, [desiredNodes, setNodes]);
  const measured = useRef(new Map<string, { height: number; hidden: boolean }>());
  const deferredGrowth = useRef(new Set<string>());
  const deferredReveal = useRef(new Set<string>());
  useEffect(() => {
    if (!nodes.length || nodes.some(n => !n.hidden && (!n.measured?.width || !n.measured?.height || !n.data.preview))) return;
    // React Flow applies node data in its own store before the transcript reaches the DOM.
    const frame = requestAnimationFrame(() => {
      // Measure the initial transcripts before culling; cached empty-box heights break Fit tree.
      if (!canCull && nodes.every(n => n.hidden || document.querySelector<HTMLElement>(`.react-flow__node[data-id="${n.id}"]`)?.offsetHeight === n.measured?.height)) setCanCull(true);
      let next = [...nodes];
      const positions: Record<string, Point> = {};
      for (let i = 0; i < next.length; i++) {
        const node = next[i];
        if (node.hidden || node.dragging) continue;
        if (placed.current.has(node.id)) continue;
        placed.current.add(node.id);
        if (node.data.conversation.x !== null && node.data.conversation.y !== null) continue;
        const parent = next.find(n => n.id === node.data.conversation.parent);
        const handle = document.querySelector<HTMLElement>(`[data-source="${node.id}"]`);
        const parentElement = handle?.closest('.react-flow__node');
        const bounds = handle?.getBoundingClientRect();
        const cachedHandle = parent && flow.current?.getInternalNode(parent.id)?.internals.handleBounds?.source?.find(h => h.id === node.id);
        const offset = bounds && parentElement ? (bounds.top + bounds.height / 2 - parentElement.getBoundingClientRect().top) / (flow.current?.getZoom() ?? 1) : cachedHandle ? cachedHandle.y + cachedHandle.height / 2 : 0;
        const preferred = parent ? { x: parent.position.x + parent.measured!.width! + 72, y: parent.position.y + offset } : { x: 0, y: 0 };
        const occupied = next.filter(n => !n.hidden && n.id !== node.id && n.measured?.width && n.measured?.height && (placed.current.has(n.id) || n.data.conversation.x !== null)).map(n => ({ ...n.position, width: n.measured!.width!, height: n.measured!.height! }));
        const position = placeBox(preferred, { width: node.measured!.width!, height: node.measured!.height! }, occupied);
        next[i] = { ...node, position };
        positions[node.id] = position;
      }
      const growing = next.filter(n => !n.hidden && measured.current.has(n.id) && !measured.current.get(n.id)!.hidden && n.measured!.height! > measured.current.get(n.id)!.height).map(n => n.id);
      const revealed = next.filter(n => !n.hidden && measured.current.get(n.id)?.hidden).map(n => n.id);
      for (const id of growing) deferredGrowth.current.add(id);
      for (const id of revealed) deferredReveal.current.add(id);
      Object.assign(positions, offsetCoveredBoxes(next.map(n => ({ id: n.id, parent: n.data.conversation.parent, ...n.position, width: n.measured?.width ?? 0, height: n.measured?.height ?? 0, hidden: n.hidden, dragging: n.dragging })), [...deferredGrowth.current], [...deferredReveal.current]));
      if (!next.some(n => n.dragging)) { deferredGrowth.current.clear(); deferredReveal.current.clear(); }
      measured.current = new Map(next.map(n => [n.id, { height: n.measured?.height ?? 0, hidden: !!n.hidden }]));
      if (Object.keys(positions).length) {
        next = next.map(n => positions[n.id] ? { ...n, position: positions[n.id] } : n);
        setNodes(next); callbacks.current.save(positions);
        if (!navigated.current) void requestAnimationFrame(() => flow.current?.fitView(fit));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes]);
  const edges = useMemo(() => hierarchy.filter(n => !n.hidden && n.conversation.parent && !folded.has(n.conversation.parent)).map(n => {
    const t = n.conversation;
    return { id: t.id, source: t.parent!, sourceHandle: t.id, target: t.id, ariaLabel: `Passage “${t.passage}” to ${t.title}`, data: { messageId: t.messageId, start: t.start, end: t.end } };
  }), [hierarchy, folded]);
  return <>
    <HStack padding={1} gap={1} vAlign="center" className="map-toolbar" role="group" aria-label="Tree view controls">
      <IconButton label="Zoom out" tooltip="Zoom out" icon={<MinusIcon />} variant="ghost" size="sm" onClick={zoomOut} />
      <Text className="sr-only">Current zoom</Text><Text data-zoom="">{zoom < 0.01 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%</Text>
      <IconButton label="Zoom in" tooltip="Zoom in" icon={<PlusIcon />} variant="ghost" size="sm" onClick={zoomIn} />
      <IconButton label="Fit tree" tooltip="Fit tree" icon={<ArrowsPointingOutIcon />} variant="ghost" size="sm" onClick={fitTree} />
      {menu({ expand: () => setFolded(new Set()), collapse: () => setFolded(new Set([root])), keep: keepCurrent, canKeep: !!current && trees.some(t => t.id === current) })}
      {toolbar}
    </HStack>
    <Text role="status" type="supporting" aria-live="polite" className="sr-only">{notice}</Text>
    <VStack className="tree-canvas" role="region" tabIndex={0} aria-label="Conversation tree overview" onWheelCapture={e => { if (e.ctrlKey || e.metaKey) e.stopPropagation(); }} onTouchStartCapture={e => { if (e.touches.length > 1) e.stopPropagation(); }} onKeyDown={e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const nodeTarget = e.target === (e.target as HTMLElement).closest('.react-flow__node') ? (e.target as HTMLElement).dataset.id : undefined;
      if (nodeTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(nodeTarget); return; }
      // Aliases only on the map or a box wrapper itself, and never while a dialog or menu is open (closed dialogs stay mounted).
      const alias = vim && (nodeTarget || e.target === e.currentTarget) && ![...document.querySelectorAll<HTMLElement>('[aria-haspopup][aria-expanded="true"], dialog[open], [aria-modal="true"]')].some(open => open.checkVisibility()) ? vimAction(e.nativeEvent) : undefined;
      if (alias === 'zoomIn' || alias === 'zoomOut' || alias === 'fit') { e.preventDefault(); e.stopPropagation(); ({ zoomIn, zoomOut, fit: fitTree })[alias](); return; }
      const key = alias ?? e.key;
      const delta: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      if (!delta[key]) return;
      if (e.target === e.currentTarget) {
        e.preventDefault(); e.stopPropagation();
        const step = e.shiftKey ? 300 : 100;
        pan(-delta[key].x * step, -delta[key].y * step);
        return;
      }
      if (e.target !== (e.target as HTMLElement).closest('.react-flow__node')) return;
      e.preventDefault(); e.stopPropagation();
      const id = (e.target as HTMLElement).dataset.id;
      const node = nodes.find(n => n.id === id);
      if (!node) return;
      const step = e.shiftKey ? 100 : 10;
      const position = { x: node.position.x + delta[key].x * step, y: node.position.y + delta[key].y * step };
      setNodes(current => current.map(n => n.id === id ? { ...n, position, selected: true } : n));
      save({ [node.id]: position });
      setNotice(`${node.data.conversation.title} moved to ${Math.round(position.x)}, ${Math.round(position.y)}.`);
    }}>
      <ConversationTransition.Provider value={transition}><ReactFlow<ConversationNode> nodes={nodes} onlyRenderVisibleElements={canCull && nodes.length > 50} onNodesChange={onNodesChange} edges={edges} nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} onMoveStart={event => { if (event) navigated.current = true; }} onMove={(_, viewport) => setZoom(viewport.zoom)} onMoveEnd={(_, viewport) => saveViewport(viewport)} defaultViewport={savedViewport} onNodeClick={(event, node) => { if (!(event.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"], [role="menuitem"], .nodrag')) open(node.id); }} onNodeDragStop={(_, node) => { save({ [node.id]: node.position }); setNotice(`${node.data.conversation.title} moved to ${Math.round(node.position.x)}, ${Math.round(node.position.y)}.`); }} nodesConnectable={false} edgesReconnectable={false} autoPanOnNodeFocus={false} deleteKeyCode={null} disableKeyboardA11y colorMode="system" fitView={!savedViewport} fitViewOptions={fit} minZoom={MIN_ZOOM} maxZoom={1.5} zoomOnScroll zoomOnPinch={false} zoomActivationKeyCode={null}><MeasureHandles nodes={nodes} /></ReactFlow></ConversationTransition.Provider>
    </VStack>
  </>;
}
