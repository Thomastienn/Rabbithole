import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: VisualFrame } = await import('../../src/media/VisualFrame.tsx');
const { default: DiagramCard } = await import('../../src/media/DiagramCard.tsx');

const visual = (status, extra = {}) => ({
    id: 'bars',
    kind: 'visual',
    conversation: 'root',
    message: 'reply',
    title: 'Bar heights',
    description: 'Three bars of heights 3, 7 and 5.',
    status,
    source: status === 'ready' ? '<svg></svg>' : null,
    ...extra,
});

test('progressive visual keeps its frame, posts the latest partial on load, then final markup; failure removes it', async (t) => {
    let set;
    const parts = [];
    function Host() {
        const [artifact, setArtifact] = useState(visual('pending'));
        set = setArtifact;
        return h(VisualFrame, {
            artifact,
            onPart: (...args) => parts.push(args),
            onRetry: async () => {},
        });
    }
    const { container, act, cleanup } = await render(h(Host), (w) => {
        ui(w);
        w.CSSStyleDeclaration.prototype[Symbol.iterator] = function* () {
            for (let i = 0; i < this.length; i++) yield this[i];
        };
    });
    t.after(cleanup);
    const frame = container.querySelector('iframe');
    const posted = [];
    frame.contentWindow.postMessage = (data) => posted.push(data);
    await act(async () => set(visual('pending', { source: '<p>First</p>' })));
    assert.equal(posted.length, 0, 'wait for the sandbox to load');
    await act(async () => frame.dispatchEvent(new Event('load')));
    assert.deepEqual(
        posted.find((m) => m.type === 'render'),
        {
            type: 'render',
            source: '<p>First</p>',
            complete: false,
        },
    );
    const receive = (data) =>
        act(async () =>
            window.dispatchEvent(
                new window.MessageEvent('message', { source: frame.contentWindow, data }),
            ),
        );
    await receive({ type: 'height', height: 180 });
    assert.equal(container.querySelector('.visual-shimmer'), null);
    await receive({ type: 'branch', label: 'Early', explanation: 'Not ready.' });
    assert.equal(parts.length, 0);
    await act(async () => set(visual('pending', { source: '<p>First Second</p>' })));
    assert.deepEqual(posted.at(-1), {
        type: 'render',
        source: '<p>First Second</p>',
        complete: false,
    });
    const final = '<p>Final</p>';
    await act(async () => set(visual('ready', { source: final })));
    assert.equal(container.querySelector('iframe'), frame, 'completion never remounts the frame');
    assert.deepEqual(posted.at(-1), { type: 'render', source: final, complete: true });
    await act(async () => set(visual('failed', { error: 'Visual generation canceled.' })));
    assert.equal(container.querySelector('iframe'), null);
    assert.match(container.querySelector('[role=status]').textContent, /unavailable.*canceled/);
    assert.ok(button(container, 'Retry visual'));
});

test('visuals: pending shimmer announces; ready frame is sandboxed; only the frame’s valid branch messages reach onPart', async (t) => {
    const parts = [];
    let set;
    function Host() {
        const [artifact, setArtifact] = useState(visual('pending'));
        set = setArtifact;
        return h(VisualFrame, {
            artifact,
            onPart: (a, part) => parts.push([a.id, part]),
        });
    }
    const { container, act, cleanup } = await render(h(Host), ui);
    t.after(cleanup);
    const figure = () => container.querySelector('figure.visual');
    assert.equal(figure().querySelectorAll('iframe').length, 1);
    assert.ok(figure().querySelector('.visual-shimmer'));
    assert.equal(
        figure().querySelector('[role=status]').textContent,
        'Drawing visual: Bar heights',
    );

    await act(async () => set(visual('ready')));
    const frame = figure().querySelector('iframe');
    assert.deepEqual(
        [
            frame.getAttribute('sandbox'),
            frame.getAttribute('src'),
            frame.title,
            figure().getAttribute('aria-label'),
        ],
        [
            'allow-scripts',
            '/sandbox.html',
            'Three bars of heights 3, 7 and 5.',
            'Three bars of heights 3, 7 and 5.',
        ],
    );
    const post = (data, source) =>
        act(async () => window.dispatchEvent(new window.MessageEvent('message', { data, source })));
    await post({ type: 'branch', label: 'Forged', explanation: 'From the app window.' }, window);
    await post({ type: 'branch', label: '', explanation: 'Empty label' }, frame.contentWindow);
    await post({ type: 'branch', label: ' Tall ', explanation: 'The 7 bar.' }, frame.contentWindow);
    assert.deepEqual(
        parts,
        [],
        'frame messages never start a branch; only the host Ask button does',
    );
    await post({ type: 'height', height: 120 }, frame.contentWindow);
    assert.equal(frame.dataset.ready, 'true');
    assert.equal(frame.style.height, '120px');

    await act(async () => set(visual('canceled')));
    assert.equal(figure(), null, 'canceled visuals leave no figure');
});

const diagram = (id, status, source, extra = {}) => ({
    id,
    kind: 'mermaid',
    conversation: 'root',
    message: 'reply',
    title: `${id} title`,
    description: `${id} description`,
    status,
    source,
    ...extra,
});

test('diagrams: steps name their position; failures and unsafe sources keep a text fallback with the source open', async (t) => {
    const retried = [];
    const steps = [
        diagram('first', 'pending', null),
        diagram('second', 'failed', 'flowchart TD\n A --> B', {
            error: 'The diagram source has an error.',
        }),
        diagram('third', 'ready', 'flowchart TD\n click A href "https://example.test"'),
    ];
    const { container, act, cleanup } = await render(
        h(
            'div',
            null,
            steps.map((artifact) =>
                h(DiagramCard, {
                    key: artifact.id,
                    artifact,
                    steps,
                    onRetry: async () => retried.push(artifact.id),
                }),
            ),
        ),
        ui,
    );
    t.after(cleanup);
    const card = (id) => container.querySelector(`[data-artifact=${id}]`);
    const label = (c) =>
        c
            .getAttribute('aria-labelledby')
            .split(' ')
            .map((id) => document.getElementById(id).textContent)
            .join(' ');
    assert.deepEqual(
        steps.map(({ id }) => label(card(id))),
        ['Step 1 of 3 first title', 'Step 2 of 3 second title', 'Step 3 of 3 third title'],
    );
    assert.equal(
        document.getElementById(card('first').getAttribute('aria-describedby')).textContent,
        'first description',
    );
    // The head's step buttons carry Astryx's own empty status regions; the card's status is in its body.
    const status = (id) => card(id).querySelector('.diagram-body > [role=status]');
    assert.equal(status('first').textContent, 'Creating diagram…');
    assert.match(
        status('second').textContent,
        /^Diagram unavailable\. The diagram source has an error\.$/,
    );
    assert.match(
        status('third').textContent,
        /could not be rendered\. Read the description and Mermaid source below\./,
    );
    for (const id of ['second', 'third']) {
        assert.equal(card(id).dataset.state, 'failed');
        assert.equal(
            card(id).querySelector('[aria-expanded]').getAttribute('aria-expanded'),
            'true',
            id,
        );
        assert.ok(
            card(id).querySelector('pre.diagram-source').textContent.startsWith('flowchart TD'),
        );
        assert.equal(card(id).querySelectorAll('img, a, script, iframe, foreignObject').length, 0);
    }
    // Previous and Next step between the cards; the ends cannot go further.
    const stepButton = (id, label) => button(card(id), label);
    assert.ok(stepButton('first', 'Previous step').matches(':disabled, [aria-disabled=true]'));
    assert.ok(stepButton('third', 'Next step').matches(':disabled, [aria-disabled=true]'));
    await act(async () => stepButton('first', 'Next step').click());
    assert.ok(document.activeElement === card('second'));
    await act(async () => stepButton('second', 'Previous step').click());
    assert.ok(document.activeElement === card('first'));
    // The head's source button hides and shows the fallback source.
    await act(async () => button(card('second'), 'Mermaid source').click());
    assert.equal(card('second').querySelector('pre.diagram-source'), null);
    await act(async () => button(card('second'), 'Mermaid source').click());
    assert.ok(card('second').querySelector('pre.diagram-source'));
    await act(async () => button(card('second'), 'Retry diagram').click());
    assert.deepEqual(retried, ['second']);
});

test('a diagram card heads itself with its figure number', async (t) => {
    const artifact = diagram('tip', 'pending', null, { title: 'Tip growth' });
    const { container, cleanup } = await render(h(DiagramCard, { artifact, figure: 2 }), ui);
    t.after(cleanup);
    assert.equal(container.querySelector('.diagram-card h3').textContent, 'Fig 2 · Tip growth');
});
