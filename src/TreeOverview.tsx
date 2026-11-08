import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Handle, Position, useNodesInitialized, useNodesState, useUpdateNodeInternals, type NodeProps, type Node, type ReactFlowInstance } from '@xyflow/react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { placeBox, type Point } from './canvas';

export type Summary = { id: string; title: string; parent: string | null; messageId: string | null; start: number | null; end: number | null; passage: string | null; x: number | null; y: number | null };
export type Source = { messageId: string; start: number; end: number; text: string };
type Open = (id: string, source?: Source) => void;
type ConversationNode = Node<{ conversation: Summary; sources: Summary[]; open: Open; active: boolean; focus: boolean }, 'conversation'>;
const sourceOf = (t: Summary): Source => ({ messageId: t.messageId!, start: t.start!, end: t.end!, text: t.passage! });

function Conversation({ data }: NodeProps<ConversationNode>) {
  const t = data.conversation;
  const initialized = useNodesInitialized();
  const update = useUpdateNodeInternals();
  useEffect(() => { update(t.id); }, [data.sources, t.id, update]);
  useEffect(() => {
    if (!data.focus || !initialized) return;
    const frame = requestAnimationFrame(() => document.getElementById(`open-${t.id}`)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [data.focus, t.id, initialized]);
  return <VStack gap={3} padding={4} className="conversation-box">
    <Handle type="target" position={Position.Left} />
    <Heading level={3}>{t.title}</Heading>
    {t.parent && <>
      <Text className="source-passage" type="supporting" color="secondary">From passage: “{t.passage}”</Text>
      <Button className="nodrag nopan" label={`Reveal source passage for ${t.title}`} variant="ghost" onClick={() => data.open(t.parent!, sourceOf(t))} />
    </>}
    {data.active && <Text type="supporting" role="status">Responding…</Text>}
    <Button id={`open-${t.id}`} className="nodrag nopan" label={`Open ${t.title}`} onClick={() => data.open(t.id)} />
    {data.sources.map(child => <VStack key={child.id} gap={1} className="passage-anchor" data-source={child.id}>
      <Text type="supporting" maxLines={3}>“{child.passage}”</Text>
      <Handle id={child.id} type="source" position={Position.Right} />
    </VStack>)}
  </VStack>;
}
const nodeTypes = { conversation: Conversation };

export default function TreeOverview({ root, trees, active, open, focus, save }: { root: string; trees: Summary[]; active: string[]; open: Open; focus?: string; save: (id: string, position: Point) => Promise<void> }) {
  const flow = useRef<ReactFlowInstance<ConversationNode>>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ConversationNode>([]);
  const placed = useRef(new Set<string>());
  const pending = useRef(new Map<string, Point>());
  const queue = useRef(Promise.resolve());
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  function persist(id: string, position: Point) {
    pending.current.set(id, position);
    queue.current = queue.current.then(async () => {
      try {
        await save(id, position);
        if (pending.current.get(id) === position) pending.current.delete(id);
        if (!pending.current.size) setFailed(false);
      } catch { setFailed(true); }
    });
  }
  const desiredNodes = useMemo(() => {
    const nodes: ConversationNode[] = [];
    const queue = [root], seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      const conversation = trees.find(t => t.id === id);
      if (!conversation || seen.has(id)) continue;
      seen.add(id);
      const sources = trees.filter(t => t.parent === id).reverse();
      nodes.push({ id, type: 'conversation', position: { x: conversation.x ?? 0, y: conversation.y ?? 0 }, ariaLabel: `${conversation.title}. Use arrow keys to move; Shift moves farther.`, data: { conversation, sources, open, active: active.includes(id), focus: focus === id } });
      queue.push(...sources.map(t => t.id));
    }
    return nodes;
  }, [root, trees, active, open, focus]);
  useEffect(() => {
    setNodes(previous => desiredNodes.map(node => {
      const old = previous.find(old => old.id === node.id);
      return { ...old, ...node, position: old?.position ?? node.position };
    }));
  }, [desiredNodes, setNodes]);
  useEffect(() => {
    if (!nodes.length || nodes.some(n => !n.measured?.width || !n.measured?.height)) return;
    const next = nodes.map(n => ({ ...n }));
    let changed = false;
    for (const node of next) {
      if (placed.current.has(node.id)) continue;
      placed.current.add(node.id);
      if (node.data.conversation.x !== null && node.data.conversation.y !== null) continue;
      const parent = next.find(n => n.id === node.data.conversation.parent);
      const handle = document.querySelector<HTMLElement>(`[data-source="${node.id}"]`);
      const parentElement = handle?.closest('.react-flow__node');
      const offset = handle && parentElement ? (handle.getBoundingClientRect().top - parentElement.getBoundingClientRect().top) / (flow.current?.getZoom() ?? 1) : 0;
      const preferred = parent ? { x: parent.position.x + parent.measured!.width! + 72, y: parent.position.y + offset } : { x: 0, y: 0 };
      const occupied = next.filter(n => n.id !== node.id && (placed.current.has(n.id) || n.data.conversation.x !== null)).map(n => ({ ...n.position, width: n.measured!.width!, height: n.measured!.height! }));
      node.position = placeBox(preferred, { width: node.measured!.width!, height: node.measured!.height! }, occupied);
      persist(node.id, node.position);
      changed = true;
    }
    if (changed) { setNodes(next); void requestAnimationFrame(() => flow.current?.fitView({ padding: 0.2 })); }
  }, [nodes]);
  const edges = desiredNodes.filter(n => n.data.conversation.parent).map(n => {
    const t = n.data.conversation;
    return { id: t.id, source: t.parent!, sourceHandle: t.id, target: t.id, ariaLabel: `Passage “${t.passage}” to ${t.title}`, data: { messageId: t.messageId, start: t.start, end: t.end } };
  });
  return <>
    <HStack padding={4} gap={2} wrap="wrap" aria-label="Tree view controls">
      <Button label="Zoom in" variant="ghost" onClick={() => void flow.current?.zoomIn()} />
      <Button label="Zoom out" variant="ghost" onClick={() => void flow.current?.zoomOut()} />
      <Button label="Fit tree" variant="secondary" onClick={() => void flow.current?.fitView({ padding: 0.2 })} />
      <Text type="supporting" color="secondary">Drag boxes to move. Select a box and use arrows; Shift moves farther.</Text>
    </HStack>
    <Text role="status" type="supporting" aria-live="polite">{notice}</Text>
    {failed && <HStack padding={3} gap={2} role="alert"><Text>Box position not saved. Keep this tree open and retry.</Text><Button label="Retry saving positions" onClick={() => { for (const [id, point] of pending.current) persist(id, point); }} /></HStack>}
    <VStack className="tree-canvas" aria-label="Conversation tree overview" onKeyDown={e => {
      if (e.target !== (e.target as HTMLElement).closest('.react-flow__node') || e.altKey || e.ctrlKey || e.metaKey) return;
      const delta: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      if (!delta[e.key]) return;
      e.preventDefault(); e.stopPropagation();
      const id = (e.target as HTMLElement).dataset.id;
      const node = nodes.find(n => n.id === id);
      if (!node) return;
      const step = e.shiftKey ? 100 : 10;
      const position = { x: node.position.x + delta[e.key].x * step, y: node.position.y + delta[e.key].y * step };
      setNodes(current => current.map(n => n.id === id ? { ...n, position, selected: true } : n));
      persist(node.id, position);
      setNotice(`${node.data.conversation.title} moved to ${Math.round(position.x)}, ${Math.round(position.y)}.`);
    }}>
      <ReactFlow<ConversationNode> nodes={nodes} onNodesChange={onNodesChange} edges={edges} nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} onNodeDragStop={(_, node) => { persist(node.id, node.position); setNotice(`${node.data.conversation.title} moved to ${Math.round(node.position.x)}, ${Math.round(node.position.y)}.`); }} nodesConnectable={false} edgesReconnectable={false} autoPanOnNodeFocus={false} deleteKeyCode={null} disableKeyboardA11y fitView minZoom={0.2} maxZoom={1.5} />
    </VStack>
  </>;
}
