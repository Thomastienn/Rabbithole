import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Handle, Position, useNodesInitialized, useNodesState, useUpdateNodeInternals, type NodeProps, type Node, type ReactFlowInstance } from '@xyflow/react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MinusIcon, PlusIcon, ArrowsPointingOutIcon, ChevronDownIcon, ChevronRightIcon, LinkIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { parseViewport, placeBox, type Point, type Viewport } from './canvas';

export type Layout = { folded: string[]; selected: string | null; panel: 'collapsed' | 'beside'; viewport?: Viewport };
export type Summary = { id: string; title: string; parent: string | null; messageId: string | null; start: number | null; end: number | null; passage: string | null; x: number | null; y: number | null; layout?: Layout | null; started?: number };
export type Source = { messageId: string; start: number; end: number; text: string };
export type Preview = { question: string | null; answer: string | null; status: string | null };
type Open = (id: string, source?: Source) => void;
export type MapActions = { expand: () => void; collapse: () => void; keep: () => void; canKeep: boolean };
type ConversationNode = Node<{ conversation: Summary; sources: Summary[]; preview?: Preview; open: Open; active: boolean; focus: boolean; focusControl?: string; transition: boolean; childCount: number; hiddenCount: number; folded: boolean; toggle: (id: string) => void }, 'conversation'>;
const fit = { padding: 0.2, maxZoom: 1 };
const sourceOf = (t: Summary): Source => ({ messageId: t.messageId!, start: t.start!, end: t.end!, text: t.passage! });

function Conversation({ data }: NodeProps<ConversationNode>) {
  const t = data.conversation;
  const initialized = useNodesInitialized();
  const update = useUpdateNodeInternals();
  useEffect(() => { update(t.id); }, [data.sources, t.id, update]);
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
      <Button id={`open-${t.id}`} className="node-title nodrag nopan" label={`Open ${t.title}`} variant="ghost" size="sm" onClick={() => data.open(t.id)}><Heading level={3} style={{ viewTransitionName: data.transition ? 'conversation' : undefined }}>{t.title}</Heading></Button>
      {data.active && <Text className="activity-dot" role="status"><Text className="sr-only">Responding</Text></Text>}
      {t.parent && <IconButton id={`reveal-${t.id}`} className="node-extra nodrag nopan" label={`Reveal source passage for ${t.title}`} tooltip={`From “${t.passage}”`} icon={<LinkIcon />} variant="ghost" size="sm" onClick={() => data.open(t.parent!, sourceOf(t))} />}
    </HStack>
    {preview?.question && <VStack gap={1} className="node-preview">
      <Text type="supporting" color="primary" maxLines={2}><Text type="inherit" className="sr-only">Question: </Text>{preview.question}</Text>
      <Text type="supporting" color="secondary" maxLines={2}><Text type="inherit" className="sr-only">Answer: </Text>{preview.answer || (preview.status === 'streaming' ? 'Thinking…' : 'No reply yet.')}</Text>
    </VStack>}
    {preview?.status && !['completed', 'streaming'].includes(preview.status) && <Text type="supporting" color="secondary">Reply {preview.status}.</Text>}
    {data.folded && <Text type="supporting" color="secondary">{data.hiddenCount} hidden {data.hiddenCount === 1 ? 'branch' : 'branches'}</Text>}
    {data.sources.map(child => <HStack key={child.id} gap={1} className="passage-anchor" data-source={child.id}>
      <Text type="supporting" color="secondary" maxLines={1}>“{child.passage}”</Text>
      <Handle id={child.id} type="source" position={Position.Right} />
    </HStack>)}
  </VStack>;
}
const nodeTypes = { conversation: Conversation };

export default function TreeOverview({ root, trees, previews, active, open, focus, focusControl, transition, save, saveViewport, menu, toolbar, selected, current, initialFolded, onFold }: { toolbar?: ReactNode; saveViewport: (viewport: Viewport) => void; initialFolded?: string[]; onFold: (folded: string[]) => void; menu: (actions: MapActions) => ReactNode; root: string; trees: Summary[]; previews: Record<string, Preview>; active: string[]; open: Open; focus?: string; focusControl?: string; transition?: string; selected?: string; current?: string; save: (id: string, position: Point) => void }) {
  const flow = useRef<ReactFlowInstance<ConversationNode>>(null);
  // Legacy views lived in localStorage; read once until the first batched save replaces them.
  const [savedViewport] = useState(() => {
    try { return trees.find(t => t.id === root)?.layout?.viewport ?? parseViewport(localStorage.getItem(`treetutor.viewport.${root}`)); } catch { return undefined; }
  });
  const navigated = useRef(!!savedViewport);
  const [nodes, setNodes, onNodesChange] = useNodesState<ConversationNode>([]);
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
  function toggle(id: string) {
    const focused = document.activeElement?.closest<HTMLElement>('.react-flow__node');
    if (!folded.has(id) && focused && focused.dataset.id !== id) document.getElementById(`fold-${id}`)?.focus({ preventScroll: true });
    setFolded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
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
  const restoredSelection = useRef(savedViewport && restored?.panel === 'beside' ? restored.selected ?? undefined : undefined);
  useEffect(() => {
    if (!selected) return;
    if (restoredSelection.current === selected) return;
    restoredSelection.current = undefined;
    const frame = requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLElement>('.tree-canvas');
      const box = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node')).find(node => node.dataset.id === selected);
      if (!canvas || !box || !flow.current) return;
      const bounds = canvas.getBoundingClientRect(), rect = box.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dx = rect.left < bounds.left ? bounds.left - rect.left : rect.right > bounds.right ? bounds.right - rect.right : 0;
      const dy = rect.top < bounds.top ? bounds.top - rect.top : rect.bottom > bounds.bottom ? bounds.bottom - rect.bottom : 0;
      if (dx || dy) { const view = flow.current.getViewport(); void flow.current.setViewport({ ...view, x: view.x + dx, y: view.y + dy }, { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200 }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, nodes.length, nodes.find(node => node.id === selected)?.measured?.width]);
  function pan(x: number, y: number) {
    const instance = flow.current;
    if (!instance) return;
    navigated.current = true;
    const view = instance.getViewport();
    void instance.setViewport({ ...view, x: view.x + x, y: view.y + y });
  }
  const desiredNodes = useMemo(() => {
    const nodes: ConversationNode[] = [];
    const queue = [root], seen = new Set<string>(), hidden = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      const conversation = trees.find(t => t.id === id);
      if (!conversation || seen.has(id)) continue;
      seen.add(id);
      const sources = trees.filter(t => t.parent === id).reverse();
      const descendants = [...sources];
      for (let j = 0; j < descendants.length; j++) descendants.push(...trees.filter(t => t.parent === descendants[j].id && !descendants.some(d => d.id === t.id)));
      if (hidden.has(id) || folded.has(id)) for (const child of sources) hidden.add(child.id);
      nodes.push({ id, type: 'conversation', hidden: hidden.has(id), position: { x: conversation.x ?? 0, y: conversation.y ?? 0 }, ariaLabel: `${conversation.title}. Use arrow keys to move; Shift moves farther.`, data: { conversation, sources: folded.has(id) ? [] : sources, preview: previews[id], open, active: active.includes(id), focus: focus === id && !hidden.has(id), focusControl, transition: transition === id, childCount: sources.length, hiddenCount: descendants.length, folded: folded.has(id), toggle } });
      queue.push(...sources.map(t => t.id));
    }
    return nodes;
  }, [root, trees, previews, active, open, focus, focusControl, transition, folded]);
  useEffect(() => {
    setNodes(previous => desiredNodes.map(node => {
      const old = previous.find(old => old.id === node.id);
      return { ...old, ...node, position: old?.position ?? node.position };
    }));
  }, [desiredNodes, setNodes]);
  useEffect(() => {
    if (!nodes.length || nodes.some(n => !n.hidden && (!n.measured?.width || !n.measured?.height))) return;
    const next = nodes.map(n => ({ ...n }));
    let changed = false;
    for (const node of next) {
      if (node.hidden) continue;
      if (placed.current.has(node.id)) continue;
      placed.current.add(node.id);
      if (node.data.conversation.x !== null && node.data.conversation.y !== null) continue;
      const parent = next.find(n => n.id === node.data.conversation.parent);
      const handle = document.querySelector<HTMLElement>(`[data-source="${node.id}"]`);
      const parentElement = handle?.closest('.react-flow__node');
      const offset = handle && parentElement ? (handle.getBoundingClientRect().top - parentElement.getBoundingClientRect().top) / (flow.current?.getZoom() ?? 1) : 0;
      const preferred = parent ? { x: parent.position.x + parent.measured!.width! + 72, y: parent.position.y + offset } : { x: 0, y: 0 };
      const occupied = next.filter(n => n.id !== node.id && n.measured?.width && n.measured?.height && (placed.current.has(n.id) || n.data.conversation.x !== null)).map(n => ({ ...n.position, width: n.measured!.width!, height: n.measured!.height! }));
      node.position = placeBox(preferred, { width: node.measured!.width!, height: node.measured!.height! }, occupied);
      save(node.id, node.position);
      changed = true;
    }
    if (changed) { setNodes(next); if (!navigated.current) void requestAnimationFrame(() => flow.current?.fitView(fit)); }
  }, [nodes]);
  const edges = desiredNodes.filter(n => !n.hidden && n.data.conversation.parent).map(n => {
    const t = n.data.conversation;
    return { id: t.id, source: t.parent!, sourceHandle: t.id, target: t.id, ariaLabel: `Passage “${t.passage}” to ${t.title}`, data: { messageId: t.messageId, start: t.start, end: t.end } };
  });
  return <>
    <HStack padding={1} gap={1} vAlign="center" className="map-toolbar" aria-label="Tree view controls">
      <IconButton label="Zoom out" tooltip="Zoom out" icon={<MinusIcon />} variant="ghost" size="sm" onClick={() => { navigated.current = true; void flow.current?.zoomOut(); }} />
      <Text aria-label="Current zoom">{Math.round(zoom * 100)}%</Text>
      <IconButton label="Zoom in" tooltip="Zoom in" icon={<PlusIcon />} variant="ghost" size="sm" onClick={() => { navigated.current = true; void flow.current?.zoomIn(); }} />
      <IconButton label="Fit tree" tooltip="Fit tree" icon={<ArrowsPointingOutIcon />} variant="ghost" size="sm" onClick={() => { navigated.current = true; void flow.current?.fitView(fit); }} />
      {menu({ expand: () => setFolded(new Set()), collapse: () => setFolded(new Set([root])), keep: keepCurrent, canKeep: !!current && trees.some(t => t.id === current) })}
      {toolbar}
    </HStack>
    <Text role="status" type="supporting" aria-live="polite" className="sr-only">{notice}</Text>
    <VStack className="tree-canvas" role="region" tabIndex={0} aria-label="Conversation tree overview" onWheelCapture={e => { if (e.ctrlKey || e.metaKey) e.stopPropagation(); }} onTouchStartCapture={e => { if (e.touches.length > 1) e.stopPropagation(); }} onKeyDown={e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const nodeTarget = e.target === (e.target as HTMLElement).closest('.react-flow__node') ? (e.target as HTMLElement).dataset.id : undefined;
      if (nodeTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(nodeTarget); return; }
      const delta: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      if (!delta[e.key]) return;
      if (e.target === e.currentTarget) {
        e.preventDefault(); e.stopPropagation();
        const step = e.shiftKey ? 300 : 100;
        pan(-delta[e.key].x * step, -delta[e.key].y * step);
        return;
      }
      if (e.target !== (e.target as HTMLElement).closest('.react-flow__node')) return;
      e.preventDefault(); e.stopPropagation();
      const id = (e.target as HTMLElement).dataset.id;
      const node = nodes.find(n => n.id === id);
      if (!node) return;
      const step = e.shiftKey ? 100 : 10;
      const position = { x: node.position.x + delta[e.key].x * step, y: node.position.y + delta[e.key].y * step };
      setNodes(current => current.map(n => n.id === id ? { ...n, position, selected: true } : n));
      save(node.id, position);
      setNotice(`${node.data.conversation.title} moved to ${Math.round(position.x)}, ${Math.round(position.y)}.`);
    }}>
      <ReactFlow<ConversationNode> nodes={nodes} onNodesChange={onNodesChange} edges={edges} nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} onMoveStart={event => { if (event) navigated.current = true; }} onMove={(_, viewport) => setZoom(viewport.zoom)} onMoveEnd={(_, viewport) => saveViewport(viewport)} defaultViewport={savedViewport} onNodeClick={(event, node) => { if (!(event.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"], [role="menuitem"], .nodrag')) open(node.id); }} onNodeDragStop={(_, node) => { save(node.id, node.position); setNotice(`${node.data.conversation.title} moved to ${Math.round(node.position.x)}, ${Math.round(node.position.y)}.`); }} nodesConnectable={false} edgesReconnectable={false} autoPanOnNodeFocus={false} deleteKeyCode={null} disableKeyboardA11y fitView={!savedViewport} fitViewOptions={fit} minZoom={0.2} maxZoom={1.5} zoomOnScroll zoomOnPinch={false} zoomActivationKeyCode={null} />
    </VStack>
  </>;
}
