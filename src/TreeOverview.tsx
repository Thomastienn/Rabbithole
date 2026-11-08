import { useEffect, useMemo, useRef } from 'react';
import { ReactFlow, Handle, Position, useNodesInitialized, useNodesState, type NodeProps, type Node, type ReactFlowInstance } from '@xyflow/react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';

export type Summary = { id: string; title: string; parent: string | null; messageId: string | null; start: number | null; end: number | null; passage: string | null };
type ConversationNode = Node<{ conversation: Summary; open: (id: string) => void; active: boolean; focus: boolean }, 'conversation'>;

function Conversation({ data }: NodeProps<ConversationNode>) {
  const t = data.conversation;
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!data.focus || !initialized) return;
    const frame = requestAnimationFrame(() => document.getElementById(`open-${t.id}`)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [data.focus, t.id, initialized]);
  return <VStack gap={3} padding={4} className="conversation-box">
    <Handle type="target" position={Position.Left} />
    <Heading level={3}>{t.title}</Heading>
    {t.parent && <Text className="source-passage" type="supporting" color="secondary">From passage: “{t.passage}”</Text>}
    {data.active && <Text type="supporting" role="status">Responding…</Text>}
    <Button id={`open-${t.id}`} className="nodrag nopan" label={`Open ${t.title}`} onClick={() => data.open(t.id)} />
    <Handle type="source" position={Position.Right} />
  </VStack>;
}
const nodeTypes = { conversation: Conversation };

export default function TreeOverview({ root, trees, active, open, focus }: { root: string; trees: Summary[]; active: string[]; open: (id: string) => void; focus?: string }) {
  const flow = useRef<ReactFlowInstance<ConversationNode>>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ConversationNode>([]);
  const desiredNodes = useMemo(() => {
    const nodes: ConversationNode[] = [];
    const rows = new Map<number, number>();
    const queue = [{ id: root, depth: 0 }], seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const { id, depth } = queue[i];
      const conversation = trees.find(t => t.id === id);
      if (!conversation || seen.has(id)) continue;
      seen.add(id);
      const row = rows.get(depth) ?? 0;
      rows.set(depth, row + 1);
      nodes.push({ id, type: 'conversation', position: { x: depth * 360, y: row * 300 }, data: { conversation, open, active: active.includes(id), focus: focus === id } });
      for (const child of trees.filter(t => t.parent === id).reverse()) queue.push({ id: child.id, depth: depth + 1 });
    }
    return nodes;
  }, [root, trees, active, open, focus]);
  useEffect(() => {
    setNodes(previous => desiredNodes.map(node => ({ ...previous.find(old => old.id === node.id), ...node })));
  }, [desiredNodes, setNodes]);
  const edges = desiredNodes.filter(n => n.data.conversation.parent).map(n => {
    const t = n.data.conversation;
    return { id: t.id, source: t.parent!, target: t.id, ariaLabel: `Passage “${t.passage}” to ${t.title}`, data: { messageId: t.messageId, start: t.start, end: t.end } };
  });
  return <>
    <HStack padding={4} gap={2} wrap="wrap" aria-label="Tree view controls">
      <Button label="Zoom in" variant="ghost" onClick={() => void flow.current?.zoomIn()} />
      <Button label="Zoom out" variant="ghost" onClick={() => void flow.current?.zoomOut()} />
      <Button label="Fit tree" variant="secondary" onClick={() => void flow.current?.fitView({ padding: 0.2 })} />
      <Text type="supporting" color="secondary">Drag the background to explore. Open a conversation to ask a question.</Text>
    </HStack>
    <VStack className="tree-canvas" aria-label="Conversation tree overview">
      <ReactFlow<ConversationNode> nodes={nodes} onNodesChange={onNodesChange} edges={edges} nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} autoPanOnNodeFocus={false} deleteKeyCode={null} fitView minZoom={0.2} maxZoom={1.5} />
    </VStack>
  </>;
}
