import { Fragment, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { familiarity, LEVELS, type Concept, type Graph } from './knowledge';

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
        <dl className="knowledge-evidence" aria-label={`Evidence for ${selected.name}`}>
          <dt>Met in replies</dt>
          <dd>{selected.met}</dd>
          <dt className="knowledge-evidence-head">From your messages</dt>
          {LEVELS.map((label, i) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{selected.observations[i]}</dd>
            </Fragment>
          ))}
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
