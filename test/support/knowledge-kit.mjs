import './tsx.mjs';
import { createElement as h } from 'react';
import { useKnowledge } from '../../src/knowledge/useKnowledge.ts';
const { KnowledgeHeader, KnowledgeActions, KnowledgeMerge } =
  await import('../../src/knowledge/KnowledgeControls.tsx');
import { ui } from './ui.mjs';

const concept = (name, topics = ['Concurrency']) => ({
  name,
  topics,
  familiarity: 0,
  correction: null,
  evidence: { met: 2, asked: 1, used: 0, ignored: 3 },
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
  const selected =
    state.graph?.concepts.find((c) => c.name === state.chosen) ?? state.graph?.concepts[0];
  return h(
    'div',
    null,
    h(KnowledgeHeader, state),
    state.graph?.concepts.map((c) => h('button', { key: c.name, 'data-concept': c.name }, c.name)),
    selected && h(KnowledgeActions, { ...state, selected }),
    h(KnowledgeMerge, state),
  );
}
