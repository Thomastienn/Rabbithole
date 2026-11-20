import './tsx.mjs';
import { createElement as h } from 'react';
import { useKnowledge } from '../../src/knowledge/useKnowledge.ts';
const { KnowledgeHeader, KnowledgeMerge } =
    await import('../../src/knowledge/KnowledgeControls.tsx');
import { ui } from './ui.mjs';

const concept = (name, topics = ['Concurrency']) => ({
    name,
    topics,
    familiarity: 0.3,
    met: 2,
    observations: [1, 0, 2, 1, 0, 0],
});
export const initial = () => ({
    topics: ['Concurrency', 'Operating systems'],
    concepts: [
        concept('Mutex'),
        concept('Mutual exclusion', ['Concurrency', 'Operating systems']),
        concept('Scheduler', ['Operating systems']),
    ],
    links: [
        { from: 'Mutex', to: 'Mutual exclusion', kind: 'builds on' },
        { from: 'Scheduler', to: 'Mutual exclusion', kind: 'related' },
    ],
});
export function setup(w) {
    const dom = ui(w);
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => 1000 });
    Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get: () => 800 });
    return dom;
}

// Exercise the real controls/controller without D3; concept buttons supply only its focus targets.
export function KnowledgeFixture({ api, activity }) {
    const state = useKnowledge({ api, activity });
    return h(
        'div',
        null,
        h(KnowledgeHeader, state),
        state.graph?.concepts.map((c) =>
            h('button', { key: c.name, 'data-concept': c.name }, c.name),
        ),
        h(KnowledgeMerge, state),
    );
}
