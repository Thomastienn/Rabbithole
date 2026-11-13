import type { CSSProperties } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import type { Preview, Summary } from './TreeOverview';
import type { Artifact } from './artifacts';
import { conversationAddresses, inkStyle } from './treeList';
import { conversationContext, type Message } from './turn';

type Current = { id: string; provider: string; model: string | null; messages: Message[]; artifacts: Artifact[] };

export default function Contents({ root, trees, addresses, previews, current, active, open, openFigure, collapse }: {
  root: string; trees: Summary[]; addresses: ReturnType<typeof conversationAddresses>; previews: Record<string, Preview>;
  current?: Current; active: string[]; open: (id: string) => void; openFigure: (conversation: string, artifact: string) => void; collapse?: () => void;
}) {
  const byId = new Map(trees.map(t => [t.id, t]));
  const conversations = [...addresses].flatMap(([id, address]) => byId.has(id) ? [{ ...byId.get(id)!, ...address }] : []);
  const figures = conversations.flatMap(t => (t.id === current?.id
    ? current.messages.map(m => ({ artifacts: current.artifacts.filter(a => a.message === m.id) }))
    : previews[t.id] ?? []).flatMap(m => (m.artifacts ?? []).filter(a => !(a.kind === 'visual' && a.status === 'canceled')).map(a => ({ ...a, conversation: t.id }))));
  const context = current && conversationContext(current);
  const used = context?.used.toLocaleString();
  const percentage = context?.limit ? (100 * context.used / context.limit).toLocaleString(undefined, { maximumFractionDigits: 1 }) : undefined;
  return <aside className="contents" aria-label="Learning tree contents">
    <VStack gap={0} className="contents-panel">
      <VStack gap={1} className="contents-head">
        {collapse && <IconButton className="contents-collapse" label="Hide contents" tooltip="Hide contents" aria-expanded icon={<ChevronLeftIcon />} variant="ghost" size="sm" onClick={collapse} />}
        <Heading level={2}>{byId.get(root)?.title}</Heading>
        <Text type="supporting" color="secondary">{conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'} · {figures.length} {figures.length === 1 ? 'figure' : 'figures'}</Text>
      </VStack>
      <VStack gap={0} className="contents-scroll">
        <nav aria-label="Contents">
          <Heading level={3} className="contents-label">Contents</Heading>
          <ol className="contents-list">{conversations.map(t => <li key={t.id} style={{ ...inkStyle(t.ink), '--depth': Math.min(t.address.split('.').length - 1, 3) } as CSSProperties}>
            <Button className="contents-row" label={`${t.address} ${t.title}`} variant="ghost" size="sm" aria-current={current?.id === t.id ? 'location' : undefined} onClick={() => open(t.id)}>
              <Text as="span" type="inherit" className="contents-row-body">
              <Text type="supporting" className="contents-address">{t.address}</Text><Text as="span" className="contents-dot" aria-hidden>{''}</Text><Text as="span" className="contents-name">{t.title}</Text>
              {active.includes(t.id) && <Text type="supporting" className="contents-busy">Responding…</Text>}
              </Text>
            </Button>
          </li>)}</ol>
        </nav>
        <nav aria-label="Figures">
          <Heading level={3} className="contents-label">Figures</Heading>
          <ol className="contents-list">{figures.map((figure, i) => <li key={figure.id}>
            <Button className="contents-row contents-figure" label={`Fig ${i + 1} ${figure.title}`} variant="ghost" size="sm" onClick={() => openFigure(figure.conversation, figure.id)}>
              <Text as="span" type="inherit" className="contents-row-body">
              <Text type="supporting" className="contents-address">Fig {i + 1}</Text><Text as="span" className="contents-name">{figure.title}</Text><Text type="supporting" color="secondary">{figure.kind === 'mermaid' || !figure.kind ? 'diagram' : figure.kind}</Text>
              </Text>
            </Button>
          </li>)}</ol>
          {!figures.length && <Text type="supporting" color="secondary" className="contents-empty">No figures yet.</Text>}
        </nav>
      </VStack>
      <VStack gap={2} className="contents-context" role="region" aria-label="Conversation context">
        <Text type="supporting" color="secondary">Context used by {current ? addresses.get(current.id)?.address : '…'}</Text>
        <Text type="supporting" color="secondary">{context ? `${used} tokens${context.limit ? ` · ${percentage}% of ${context.limit.toLocaleString()}` : ' · limit unavailable'}` : 'Context usage unavailable'}</Text>
        {context?.limit && <meter min={0} max={context.limit} value={Math.min(context.used, context.limit)} aria-label="Context used" aria-valuetext={`${used} tokens · ${percentage}% of ${context.limit.toLocaleString()}`} />}
        <Text type="supporting" color="secondary">Last completed reply<Text as="span" type="inherit" className="sr-only">: reported input, cache read and output; excludes background tasks and unsent text.</Text></Text>
      </VStack>
    </VStack>
  </aside>;
}
