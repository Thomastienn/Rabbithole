import { createContext, memo, useContext, useEffect, useRef } from 'react';
import {
  Handle,
  Position,
  useNodesInitialized,
  useUpdateNodeInternals,
  type NodeProps,
  type Node,
} from '@xyflow/react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import ChevronDownIcon from '@heroicons/react/24/outline/ChevronDownIcon';
import ChevronRightIcon from '@heroicons/react/24/outline/ChevronRightIcon';
import LinkIcon from '@heroicons/react/24/outline/LinkIcon';
import ExclamationTriangleIcon from '@heroicons/react/24/outline/ExclamationTriangleIcon';
import type { CSSProperties } from 'react';
import type { Summary, Preview } from './TreeOverview';
import { inkStyle } from './treeList';
import { snippet, sourceOf, type Open } from './mapState';

export type ConversationNode = Node<
  {
    conversation: Summary;
    sources: Summary[];
    preview?: Preview;
    open: Open;
    retry: (id: string) => void;
    active: boolean;
    focused: boolean;
    focus: boolean;
    focusControl?: string;
    childCount: number;
    address: string;
    ink: number;
    stubs: { child: Summary; beneath: number; address: string; ink: number }[];
    folded: boolean;
    toggle: (id: string) => void;
  },
  'conversation'
>;
export const ConversationTransition = createContext<string | undefined>(undefined);
export const Conversation = memo(function Conversation({ data }: NodeProps<ConversationNode>) {
  const t = data.conversation;
  const transition = useContext(ConversationTransition);
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!data.focus || !initialized) return;
    // Only restore focus lost by leaving chat; a box remounting after a fold must not steal it.
    const frame = requestAnimationFrame(() => {
      if (!document.activeElement?.closest('.overview'))
        document
          .getElementById(data.focusControl ?? `open-${t.id}`)
          ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [data.focus, data.focusControl, t.id, initialized]);
  const preview = data.preview;
  const handle = (child: Summary, style?: CSSProperties) => {
    const stub = data.stubs.find((s) => s.child === child);
    const name = `Show hidden branch ${child.title}${stub?.beneath ? `, ${stub.beneath} more ${stub.beneath === 1 ? 'conversation' : 'conversations'} hidden beneath` : ''}`;
    // Focus the fold toggle first; the stub unmounts once the fold expands.
    return (
      <Handle
        key={child.id}
        id={child.id}
        data-source={child.id}
        type="source"
        position={Position.Right}
        style={style}
      >
        {stub && (
          <HStack gap={0} className="fold-stub nodrag nopan" style={inkStyle(stub.ink)}>
            <Button
              label={name}
              tooltip={name}
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById(`fold-${t.id}`)?.focus({ preventScroll: true });
                data.toggle(t.id);
              }}
            >
              <Text type="supporting" hasTabularNumbers>
                {stub.address} · {1 + stub.beneath} folded
              </Text>
            </Button>
          </HStack>
        )}
      </Handle>
    );
  };
  return (
    <VStack
      gap={2}
      padding={3}
      className="conversation-box"
      data-active={data.active}
      data-focused={data.focused}
      data-folded={data.folded}
      style={inkStyle(data.ink)}
    >
      {t.parent && <Handle type="target" position={Position.Left} />}
      <HStack gap={1} vAlign="center" className="node-band">
        {data.childCount > 0 && (
          <IconButton
            id={`fold-${t.id}`}
            className="nodrag nopan"
            label={`${data.folded ? 'Expand' : 'Collapse'} descendants of ${t.title}`}
            tooltip={`${data.folded ? 'Expand' : 'Collapse'} descendants`}
            aria-expanded={!data.folded}
            icon={data.folded ? <ChevronRightIcon /> : <ChevronDownIcon />}
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              data.toggle(t.id);
            }}
          />
        )}
        <Text
          className="activity-dot"
          role={data.active ? 'status' : undefined}
          aria-hidden={!data.active || undefined}
        >
          {data.active && <Text className="sr-only">Responding</Text>}
        </Text>
        <Text className="node-address" hasTabularNumbers>
          {data.address}
        </Text>
        <Button
          id={`open-${t.id}`}
          className="node-title nodrag nopan"
          label={`Open ${t.title}`}
          variant="ghost"
          size="sm"
          onClick={() => data.open(t.id)}
        >
          <Heading
            level={2}
            style={{ viewTransitionName: transition === t.id ? 'conversation' : undefined }}
          >
            {t.title}
          </Heading>
        </Button>
        {t.parent && (
          <IconButton
            id={`reveal-${t.id}`}
            className="node-extra nodrag nopan"
            label={`Reveal source passage for ${t.title}`}
            tooltip={`From “${t.passage}”`}
            icon={<LinkIcon />}
            variant="ghost"
            size="sm"
            onClick={() => data.open(t.parent!, sourceOf(t))}
          />
        )}
      </HStack>
      {!!preview?.length && (
        <VStack gap={1} className="node-preview">
          {preview.map((m) => {
            const sources = data.sources.filter((child) => child.messageId === m.id);
            return (
              <VStack
                key={m.id}
                gap={0}
                className="node-message"
                data-message={m.id}
                data-role={m.role}
                style={
                  sources.length
                    ? {
                        minHeight: `calc(var(--spacing-${data.folded ? 8 : 2}) * ${sources.length + 1})`,
                      }
                    : undefined
                }
              >
                {(m.text || m.status === 'streaming') && (
                  <Button
                    className="node-bubble nodrag nopan"
                    label={`Jump to ${m.role === 'user' ? 'question' : 'reply'}: ${snippet(m.text || 'Thinking…')}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => data.open(t.id, undefined, m.id)}
                  >
                    <Text
                      type="supporting"
                      color={m.role === 'user' ? 'primary' : 'secondary'}
                      className={m.role === 'user' ? 'question-bubble' : undefined}
                      maxLines={3}
                      hasTruncateTooltip={false}
                    >
                      <Text type="inherit" className="sr-only">
                        {m.role === 'user' ? 'Question: ' : 'Answer: '}
                      </Text>
                      {m.text || 'Thinking…'}
                    </Text>
                  </Button>
                )}
                {m.role === 'assistant' && m.status !== 'completed' && (
                  <Text type="supporting" className="node-status" data-status={m.status}>
                    {m.status === 'failed' && <ExclamationTriangleIcon aria-hidden />}
                    {m.status === 'streaming' ? 'Replying…' : `Reply ${m.status}.`}
                  </Text>
                )}
                {m.role === 'assistant' &&
                  m.status === 'failed' &&
                  m === preview.at(-1) &&
                  preview.at(-2)?.role === 'user' &&
                  !data.active && (
                    <Button
                      label="Retry reply"
                      className="node-retry nodrag nopan"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        document.getElementById(`open-${t.id}`)?.focus({ preventScroll: true });
                        data.retry(t.id);
                      }}
                    />
                  )}
                {m.role === 'assistant' &&
                  m.artifacts
                    ?.filter((a) => a.kind !== 'visual' || a.status !== 'canceled')
                    .map((a) => (
                      <Text key={a.id} type="supporting" color="secondary">
                        {a.kind === 'video' ? (
                          `Video: ${a.title} · ${a.status === 'pending' ? 'creating…' : a.status === 'ready' ? (a.available === false ? 'unavailable' : 'ready') : a.status}`
                        ) : (
                          <>
                            {a.kind === 'visual' ? 'Visual' : 'Diagram'}: {a.title}
                            {a.status === 'pending'
                              ? ' · creating…'
                              : a.status === 'failed'
                                ? ' · unavailable'
                                : ''}
                          </>
                        )}
                      </Text>
                    ))}
                {sources.map((child, index) =>
                  handle(child, { top: `${(100 * (index + 1)) / (sources.length + 1)}%` }),
                )}
              </VStack>
            );
          })}
          {preview.at(-1)?.role === 'user' && (
            <Text type="supporting" color="secondary">
              <Text type="inherit" className="sr-only">
                Answer:{' '}
              </Text>
              No reply yet.
            </Text>
          )}
        </VStack>
      )}
      {data.sources
        .filter((child) => !preview?.some((m) => m.id === child.messageId))
        .map((child) => handle(child))}
    </VStack>
  );
});

// Batch handle measurements so loading 200 transcripts schedules one React Flow update.
export function MeasureHandles({ nodes }: { nodes: ConversationNode[] }) {
  const update = useUpdateNodeInternals();
  const previous = useRef(new Map<string, ConversationNode['data']>());
  useEffect(() => {
    const changed = nodes.filter((n) => {
      const old = previous.current.get(n.id);
      return (
        !n.hidden &&
        (!old ||
          old.preview !== n.data.preview ||
          old.sources !== n.data.sources ||
          old.folded !== n.data.folded)
      );
    });
    previous.current = new Map(nodes.filter((n) => !n.hidden).map((n) => [n.id, n.data]));
    if (changed.length) update(changed.map((n) => n.id));
  }, [nodes, update]);
  return null;
}
