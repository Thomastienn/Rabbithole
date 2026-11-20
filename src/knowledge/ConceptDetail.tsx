import { Fragment } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Text';
import { level, LEVELS, type Concept, type Graph } from './knowledge';

export default function ConceptDetail({ selected, graph }: { selected: Concept; graph: Graph }) {
  const linked = (kind: string, side: 'from' | 'to', other: 'from' | 'to') =>
    graph.links
      .filter((l) => l.kind === kind && l[side] === selected.name)
      .map((l) => l[other])
      .join(', ');
  const related = [linked('related', 'from', 'to'), linked('related', 'to', 'from')]
    .filter(Boolean)
    .join(', ');
  const facts: [string, string | number][] = [
    ['Topics', selected.topics.join(', ')],
    ['Familiarity', level(selected)],
    ['Builds on', linked('builds on', 'from', 'to')],
    ['Leads to', linked('builds on', 'to', 'from')],
    ['Related to', related],
    ['Met in replies', selected.met],
  ];
  return (
    <aside id="concept-detail" className="knowledge-detail" aria-label={`${selected.name} details`}>
      <VStack gap={3}>
        <Heading level={2}>{selected.name}</Heading>
        <dl className="knowledge-facts">
          {facts
            .filter(([, v]) => v !== '')
            .map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
        </dl>
        <Heading level={3}>From your messages</Heading>
        <dl className="knowledge-facts" aria-label={`Evidence for ${selected.name}`}>
          {LEVELS.map((label, i) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{selected.observations[i]}</dd>
            </Fragment>
          ))}
        </dl>
      </VStack>
    </aside>
  );
}
