import { Fragment, useEffect, useState } from 'react';
import { Heading } from '@astryxdesign/core/Text';
import { request as api } from '../serverAccess';
import { level, type Concept, type Graph } from './knowledge';

// A learner message observed for the concept, or a conversation whose reply met it (GET /api/graph/concept).
export type Source = {
    message: string;
    conversation: string;
    root: string;
    address: string;
    ink: number;
    text: string;
};
export type OpenSource = (source: Source) => void;

export default function ConceptDetail({
    selected,
    graph,
    open,
}: {
    selected: Concept;
    graph: Graph;
    open: OpenSource;
}) {
    const [sources, setSources] = useState<{
        name: string;
        messages: Source[];
        replies: Source[];
    }>();
    // Refetched with every graph load, so Refresh and new activity update the lists too.
    useEffect(() => {
        let live = true;
        api(`/api/graph/concept?name=${encodeURIComponent(selected.name)}`).then(
            (s: { messages: Source[]; replies: Source[] }) =>
                live && setSources({ name: selected.name, ...s }),
            () => live && setSources(undefined),
        );
        return () => {
            live = false;
        };
    }, [selected.name, graph]);
    const linked = (kind: string, side: 'from' | 'to', other: 'from' | 'to') =>
        graph.links
            .filter((l) => l.kind === kind && l[side] === selected.name)
            .map((l) => l[other])
            .join(', ');
    const related = [linked('related', 'from', 'to'), linked('related', 'to', 'from')]
        .filter(Boolean)
        .join(', ');
    const facts: [string, string][] = [
        [selected.topics.length > 1 ? 'Topics' : 'Topic', selected.topics.join(', ') || 'None yet'],
        ['Familiarity', level(selected)],
        ['Builds on', linked('builds on', 'from', 'to')],
        ['Leads to', linked('builds on', 'to', 'from')],
        ['Related to', related],
    ];
    const list = (title: string, items: Source[] = []) =>
        items.length > 0 && (
            <>
                <Heading level={3}>{title}</Heading>
                <ul className="knowledge-sources">
                    {items.map((s) => (
                        <li key={s.message}>
                            <button type="button" onClick={() => open(s)}>
                                {s.address} · {s.text}
                            </button>
                        </li>
                    ))}
                </ul>
            </>
        );
    const shown = sources?.name === selected.name ? sources : undefined;
    return (
        <aside
            id="concept-detail"
            className="knowledge-detail"
            tabIndex={-1}
            aria-label={`${selected.name} details`}
        >
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
            {list('From your messages', shown?.messages)}
            {list('Met in replies', shown?.replies)}
        </aside>
    );
}
