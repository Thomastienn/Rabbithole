import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup } from '../support/knowledge-kit.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: Page } = await import('../../src/knowledge/KnowledgePage.tsx');
const KnowledgePage = (props) => h(Page, { open: () => {}, ...props });
// The detail's sources for Mutex; other concepts have none.
const sources = (path) =>
    path === '/api/graph/concept?name=Mutex'
        ? {
              messages: [
                  {
                      message: 'm1',
                      conversation: 'c12',
                      root: 'r',
                      address: '1.2',
                      ink: 1,
                      text: 'What is a mutex?',
                  },
              ],
              replies: [
                  {
                      message: 'a1',
                      conversation: 'r',
                      root: 'r',
                      address: '1',
                      ink: 0,
                      text: 'How do locks work?',
                  },
              ],
          }
        : { messages: [], replies: [] };

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
        {
            name: 'Mutex',
            at: now - DAY,
            text: 'Is a mutex a semaphore?',
            cleared: null,
            place: { root: 'r', address: '1.3', ink: 3 },
        },
        { name: 'Mutual exclusion', at: now - 2 * DAY, text: 'q', cleared: now - DAY, place: null },
    ],
    activity: [{ day: new Date(now).toLocaleDateString('sv'), messages: 4 }],
});

test('knowledge points, relations, zoom labels retain accessible state', async (t) => {
    const graph = initial();
    const calls = [];
    const opened = [];
    const api = async (path, body) => {
        calls.push([path, body]);
        if (path.startsWith('/api/graph/concept')) return sources(path);
        return path === '/api/graph/stats' ? stats() : graph;
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(
        h(KnowledgePage, { activity: '', open: (s) => opened.push(s.message) }),
        setup,
    );
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
    // Facts, then the learner's messages and the replies that met it; each opens its conversation.
    assert.equal(
        detail().textContent,
        'MutexTopicConcurrencyFamiliarityNew to youBuilds onMutual exclusion' +
            'From your messages1.2 · What is a mutex?Met in replies1 · How do locks work?',
    );
    await click('1.2 · What is a mutex?', detail());
    await click('1 · How do locks work?', detail());
    assert.deepEqual(opened, ['m1', 'a1']);
    // Familiarity reads without colour: ring form plus words for screen readers.
    assert.deepEqual(
        [...container.querySelectorAll('[data-concept]')].map((b) => [
            b.querySelector('.fam').dataset.fill,
            b.querySelector('.sr-only:last-child').textContent,
        ]),
        [
            ['none', ', New to you'],
            ['none', ', New to you'],
            ['none', ', New to you'],
        ],
    );
    // The legend: three rings and one sentence.
    assert.deepEqual(
        [...container.querySelectorAll('.knowledge-key > span')].map((e) => e.textContent),
        [
            'New to you',
            'Getting there',
            'You know this',
            'Colour shows the topic. An arrow points to the concept that builds on the other.',
        ],
    );
    // The zoom readout sits between Zoom out and Zoom in.
    assert.equal(
        container.querySelector('.map-toolbar').textContent,
        'Zoom outCurrent zoom100%Zoom inFit map',
    );
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
    assert.match(detail().textContent, /Related toMutual exclusion$/);
    // Relations read from the other end too: Leads to reverses builds on, Related to runs both ways.
    await act(async () => container.querySelector('[data-concept="Mutual exclusion"]').click());
    assert.match(
        detail().textContent,
        /TopicsConcurrency, Operating systems.*Leads toMutexRelated toScheduler$/,
    );
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
            ['Operating systems', 'Getting there', '50%'],
            ['Concurrency', 'New to you', '30%'],
        ],
    );
    // Each topic's swatch wears its hull's hue.
    assert.deepEqual(
        [...panel.querySelectorAll('.stats-rank .swatch')].map((e) => e.dataset.hue),
        ['Operating systems', 'Concurrency'].map(
            (t) => container.querySelector(`.knowledge-regions [data-topic="${t}"]`).dataset.hue,
        ),
    );
    // The growth chart's x-axis names the month of its first point.
    assert.ok(
        [...panel.querySelectorAll('.stats-chart .ax')].some(
            (e) =>
                e.textContent ===
                new Date(Date.now() - 7 * DAY).toLocaleDateString(undefined, { month: 'short' }),
        ),
    );
    assert.deepEqual(
        [...rows('Fading')].map((b) => b.dataset.statsConcept),
        ['Scheduler'],
    );
    assert.deepEqual(
        [...rows('Misconceptions')].map((b) => [
            b.dataset.statsConcept,
            b.querySelector('.address-chip')?.textContent,
            b.lastChild.className,
        ]),
        [
            ['Mutex', '1.3', 'open'],
            ['Mutual exclusion', undefined, 'cleared'],
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

test('heatmap shade rules outrank the empty cell rule, so busy days show', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(
        new URL('../../src/styles/knowledge-stats.css', import.meta.url),
        'utf8',
    );
    // Specificity of a plain selector list entry: [classes, attributes and pseudo-classes; elements].
    const specificity = (selector) =>
        selector
            .trim()
            .split(/\s+/)
            .reduce(
                ([a, b], part) => [
                    a + (part.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length,
                    b + (/^[a-z]/i.test(part) ? 1 : 0),
                ],
                [0, 0],
            );
    const selectors = [...css.matchAll(/([^{}]+)\{[^}]*\bbackground:/g)].flatMap((m) =>
        m[1].split(',').map((s) => s.trim()),
    );
    const base = specificity('.stats-heat .cells i');
    assert.ok(selectors.includes('.stats-heat .cells i'));
    for (const level of ['1', '2', '3', '4']) {
        const rule = selectors.find((s) => s.startsWith('.stats-heat') && s.includes(`'${level}'`));
        const [a, b] = specificity(rule);
        assert.ok(a > base[0] || (a === base[0] && b > base[1]), rule);
    }
});
