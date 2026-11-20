import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { Conversation } = await import('../../src/map/Conversation.tsx');

test('media chips keep artifact order, kind/title/status labels and current status text', async (t) => {
    const artifacts = [];
    const expected = [];
    for (const kind of ['visual', 'mermaid', 'video']) {
        for (const status of ['pending', 'ready', 'failed', 'interrupted', 'canceled']) {
            const id = `${kind}-${status}`;
            artifacts.push({ id, kind, title: `Title ${id}`, status });
            if (kind === 'visual' && status === 'canceled') continue;
            const state =
                status === 'pending' ? 'creating' : status === 'failed' ? 'unavailable' : status;
            expected.push({
                id,
                label: `Open ${kind === 'mermaid' ? 'diagram' : kind} Title ${id}, ${state}`,
                text:
                    status === 'pending'
                        ? 'creating…'
                        : kind === 'video'
                          ? status
                          : status === 'failed'
                            ? 'unavailable'
                            : '',
            });
        }
    }
    artifacts.push({
        id: 'missing-video',
        kind: 'video',
        title: 'Missing video',
        status: 'ready',
        available: false,
    });
    expected.push({
        id: 'missing-video',
        label: 'Open video Missing video, unavailable',
        text: 'unavailable',
    });
    // Failed videos retain their existing raw status text.
    expected.find((e) => e.id === 'video-failed').label = 'Open video Title video-failed, failed';
    for (const [status, classmates] of [
        ['pending', 0],
        ['ready', 3],
        ['failed', 0],
    ]) {
        const id = `discussion-${status}`;
        const state =
            status === 'pending' ? 'creating' : status === 'failed' ? 'unavailable' : 'ready';
        artifacts.push({ id, kind: 'discussion', title: 'Discussion', status, classmates });
        expected.push({
            id,
            label: `Open discussion with ${classmates} classmates, ${state}`,
            text: status === 'pending' ? 'creating…' : status === 'failed' ? 'unavailable' : '',
        });
    }
    const opens = [];
    const { container, act, cleanup } = await render(
        h(
            ReactFlowProvider,
            null,
            h(
                'div',
                { onClick: () => opens.push(['bubbled']) },
                h(Conversation, {
                    id: 'root',
                    data: {
                        conversation: { id: 'root', title: 'Fungi', parent: null },
                        sources: [],
                        preview: [
                            {
                                id: 'reply',
                                role: 'assistant',
                                text: 'Answer',
                                status: 'completed',
                                artifacts,
                            },
                        ],
                        open: (...args) => opens.push(args),
                        retry() {},
                        toggle() {},
                        active: false,
                        focused: false,
                        focus: false,
                        childCount: 0,
                        address: '1',
                        ink: 0,
                        stubs: [],
                        folded: false,
                    },
                }),
            ),
        ),
        ui,
    );
    t.after(cleanup);
    const group = container.querySelector('.node-chips');
    assert.equal(group.getAttribute('role'), 'group');
    assert.ok(group.getAttribute('aria-label'), 'named for assistive tech');
    const chips = [...group.querySelectorAll('button')];
    assert.deepEqual(
        chips.map((c) => c.dataset.artifact),
        expected.map((e) => e.id),
    );
    for (const [index, chip] of chips.entries()) {
        const e = expected[index];
        assert.equal(chip.getAttribute('aria-label'), e.label);
        assert.equal(chip.querySelector('.node-chip__status')?.textContent ?? '', e.text);
        if (e.id.startsWith('discussion'))
            assert.equal(
                chip.querySelector('.node-chip__title').textContent,
                `Discussion · ${artifacts.find((a) => a.id === e.id).classmates} classmates`,
            );
        assert.equal(chip.dataset.status, artifacts.find((a) => a.id === e.id).status);
        assert.ok(chip.querySelector('svg[aria-hidden=true]'));
        assert.ok(chip.classList.contains('nodrag') && chip.classList.contains('nopan'));
        await act(async () => chip.focus());
        assert.equal(document.activeElement, chip);
        await act(async () => chip.click());
        assert.deepEqual(opens.at(-1), ['root', undefined, undefined, e.id]);
    }
    assert.equal(opens.length, chips.length, 'clicks do not bubble to the conversation');
    assert.equal(container.querySelector('[data-artifact=visual-canceled]'), null);
    assert.equal(container.querySelector('.node-visuals').textContent, '1 of 4 visuals ready');
    assert.equal(container.querySelector('iframe'), null, 'map chips never load their media');
});
