import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { familiarity, type Concept, type Graph } from './knowledge';

export default function ConceptDetail({
  selected,
  graph,
  children,
}: {
  selected: Concept;
  graph: Graph;
  children: ReactNode;
}) {
  return (
    <aside id="concept-detail" className="knowledge-detail" aria-label={`${selected.name} details`}>
      <VStack gap={3}>
        <Heading level={2}>{selected.name}</Heading>
        <Text className="knowledge-reading">
          <strong>{familiarity(selected)}.</strong>
        </Text>
        <Text className="knowledge-reading" color="secondary">
          Topics: {selected.topics.join(', ')}
        </Text>
        <dl className="knowledge-evidence">
          <dt>Met in replies</dt>
          <dd>{selected.evidence.met}</dd>
          <dt>Asked about</dt>
          <dd>{selected.evidence.asked}</dd>
          <dt>Used in your questions</dt>
          <dd>{selected.evidence.used}</dd>
          <dt>Underlines ignored (weak hint)</dt>
          <dd>{selected.evidence.ignored}</dd>
        </dl>
        {graph.links
          .filter((l) => l.from === selected.name || l.to === selected.name)
          .map((l) => (
            <Text
              key={`${l.from}-${l.to}-${l.kind}`}
              className="knowledge-reading"
              color="secondary"
            >
              {l.from} {l.kind === 'related' ? 'is related to' : 'builds on'} {l.to}
            </Text>
          ))}
        {children}
      </VStack>
    </aside>
  );
}
