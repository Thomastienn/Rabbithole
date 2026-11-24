import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup } from '../support/knowledge-kit.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: KnowledgePage } = await import('../../src/knowledge/KnowledgePage.tsx');

const DAY = 24 * 60 * 60 * 1000;
const stats = (now = Date.now()) => ({
    since: now - 14 * DAY,
    growth: [
        { at: now - 7 * DAY, met: 2, known: 1 },
        { at: now, met: 3, known: 0 },
    ],
    topics: [
        { name: 'Operating systems', familiarity: 0.5, concepts: 2 },
        { name: 'Concurrency', familiarity: 0.3, concepts: 2 },
    ],
    fading: [{ name: 'Scheduler', until: now - 3 * DAY }],
    misconceptions: [
        { name: 'Mutex', at: now - DAY, text: 'Is a mutex a semaphore?', cleared: null },
        { name: 'Mutual exclusion', at: now - 2 * DAY, text: 'q', cleared: now - DAY },
    ],
    activity: [{ day: new Date(now).toLocaleDateString('sv'), messages: 4 }],
});

test('knowledge points, relations, zoom labels retain accessible state', async (t) => {
    const graph = initial();
    const calls = [];
    const api = async (path, body) => {
        calls.push([path, body]);
        return path === '/api/graph/stats' ? stats() : graph;
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(KnowledgePage, { activity: '' }), setup);
    t.after(cleanup);
    const click = async (label, root = container) => {
        const b = button(root, label);
        assert.ok(b, label);
        await act(async () => {
            b.focus();
            b.click();
        });
    };
    const detail = () => container.querySelector('#concept-detail');
    // Read-only: facts, then observation counts by level in level order with zeros, and no controls.
    assert.equal(
        detail().textContent,
        'MutexTopicsConcurrencyFamiliarityUnfamiliarBuilds onMutual exclusionMet in replies2' +
            'From your messagesMisconception1Heard of it0Partial2Explains it1Applies it0Teaches it0',
    );
    assert.equal(detail().querySelector('[aria-label="Evidence for Mutex"]').tagName, 'DL');
    assert.equal(detail().querySelectorAll('button').length, 0);
    // Familiarity reads without colour: ring form plus words for screen readers.
    assert.deepEqual(
        [...container.querySelectorAll('[data-concept]')].map((b) => [
            b.querySelector('.fam').dataset.fill,
            b.querySelector('.sr-only:last-child').textContent,
        ]),
        [
            ['none', ', Unfamiliar'],
            ['none', ', Unfamiliar'],
            ['none', ', Unfamiliar'],
        ],
    );
    assert.ok(container.querySelector('.knowledge-field .knowledge-key'));
    assert.equal(
        container.querySelector('[data-concept=Mutex]').getAttribute('aria-controls'),
        'concept-detail',
    );
    assert.deepEqual(
        [...container.querySelectorAll('[data-topic-label]')].map((e) => e.textContent),
        ['Concurrency', 'Operating systems'],
    );
    assert.equal(
        container.querySelector('[data-kind="builds on"]').getAttribute('marker-end'),
        'url(#knowledge-arrow)',
    );
    assert.equal(container.querySelector('[data-kind=related]').getAttribute('marker-end'), null);
    const names = () => [...container.querySelectorAll('[data-concept]')].map((e) => e.textContent);
    const beforeNames = names();
    await act(async () => {
        for (let i = 0; i < 8; i++) button(container, 'Zoom out').click();
    });
    assert.deepEqual(
        [...container.querySelectorAll('.concept-name:not(.sr-only)')].map((e) => e.textContent),
        ['Mutex'],
    );
    await act(async () => container.querySelector('[data-concept=Scheduler]').click());
    assert.equal(detail().querySelector('h2').textContent, 'Scheduler');
    assert.match(detail().textContent, /Related toMutual exclusionMet in replies/);
    // Relations read from the other end too: Leads to reverses builds on, Related to runs both ways.
    await act(async () => container.querySelector('[data-concept="Mutual exclusion"]').click());
    assert.match(detail().textContent, /Leads toMutexRelated toSchedulerMet in replies/);
    await act(async () => container.querySelector('[data-concept=Scheduler]').click());
    assert.deepEqual(
        [...container.querySelectorAll('.concept-name:not(.sr-only)')].map((e) => e.textContent),
        ['Scheduler'],
    );
    assert.deepEqual(names(), beforeNames);
    await act(async () => {
        for (let i = 0; i < 8; i++) button(container, 'Zoom in').click();
    });
    assert.equal(container.querySelectorAll('.concept-name:not(.sr-only)').length, 3);
});

test('the stats panel shows the figures and choosing a concept opens it in the graph', async (t) => {
    const graph = initial();
    fakeServer(t, async (path) => (path === '/api/graph/stats' ? stats() : graph));
    let dom;
    const { container, act, cleanup } = await render(
        h(KnowledgePage, { activity: '' }),
        (w) => (dom = setup(w)),
    );
    t.after(cleanup);
    const panel = container.querySelector('.knowledge-stats');
    const rows = (title) =>
        [...panel.querySelectorAll('.stats-section')]
            .find((s) => s.querySelector('h3').textContent === title)
            .querySelectorAll('[data-stats-concept]');
    // Growth chart: the end labels and the hidden table carry the stored figures.
    assert.deepEqual(
        [...panel.querySelectorAll('.stats-chart .end')].map((e) => e.textContent),
        ['Met 3', 'Known 0'],
    );
    assert.deepEqual(
        [...panel.querySelectorAll('table')[0].querySelectorAll('tbody td:not(:first-child)')].map(
            (e) => e.textContent,
        ),
        ['2', '1', '3', '0'],
    );
    // Topics keep the route's order and say familiarity in the graph's words.
    assert.deepEqual(
        [...panel.querySelectorAll('.stats-rank .track')].map((e) => [
            e.previousElementSibling.textContent,
            e.getAttribute('aria-label'),
            e.firstChild.style.width,
        ]),
        [
            ['Operating systems', 'Some familiarity', '50%'],
            ['Concurrency', 'Unfamiliar', '30%'],
        ],
    );
    assert.deepEqual(
        [...rows('Fading')].map((b) => b.dataset.statsConcept),
        ['Scheduler'],
    );
    assert.deepEqual(
        [...rows('Misconceptions')].map((b) => [b.dataset.statsConcept, b.lastChild.className]),
        [
            ['Mutex', 'open'],
            ['Mutual exclusion', 'cleared'],
        ],
    );
    // Today's four messages shade the last heatmap day.
    const cells = panel.querySelectorAll('.stats-heat .cells i');
    assert.equal(cells[cells.length - 1].dataset.l, '2');
    assert.equal(
        panel.querySelectorAll('.stats-heat .cells i[data-l="0"]').length,
        cells.length - 1,
    );
    // Choosing a concept anywhere in the panel selects it in the graph and focuses its detail.
    for (const [title, name] of [
        ['Fading', 'Scheduler'],
        ['Misconceptions', 'Mutual exclusion'],
    ]) {
        await act(async () => {
            rows(title)[title === 'Fading' ? 0 : 1].click();
            dom.frames();
        });
        const detail = container.querySelector('#concept-detail');
        assert.equal(detail.querySelector('h2').textContent, name);
        assert.ok(document.activeElement === detail);
        assert.equal(
            container.querySelector('[aria-pressed=true][data-concept]').dataset.concept,
            name,
        );
    }
});

test('concepts wear their main topic hue and each topic draws a hull; a concept without a topic stays neutral', async (t) => {
    const graph = initial();
    graph.concepts.push({ ...graph.concepts[0], name: 'Loose', topics: [] });
    fakeServer(t, async (path) => (path === '/api/graph/stats' ? stats() : graph));
    const { container, cleanup } = await render(h(KnowledgePage, { activity: '' }), setup);
    t.after(cleanup);
    const hue = (name) => container.querySelector(`[data-concept="${name}"]`).dataset.hue;
    const hulls = [...container.querySelectorAll('.knowledge-regions path')];
    assert.deepEqual(
        hulls.map((p) => p.dataset.topic),
        ['Concurrency', 'Operating systems'],
    );
    assert.equal(hue('Mutex'), hulls[0].style.getPropertyValue('--h'));
    assert.equal(hue('Mutual exclusion'), hue('Mutex'));
    assert.equal(hue('Scheduler'), hulls[1].style.getPropertyValue('--h'));
    assert.notEqual(hue('Scheduler'), hue('Mutex'));
    assert.equal(hue('Loose'), undefined);
    // Familiarity keeps its ring form under the hue.
    assert.equal(container.querySelector('[data-concept="Mutex"] .fam').dataset.fill, 'none');
});
