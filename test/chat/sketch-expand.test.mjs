import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import ChatThread from '../../src/chat/ChatThread.tsx';
import { render } from '../support/render.mjs';
import { threadProps } from '../support/thread-props.mjs';
import { ui, button } from '../support/ui.mjs';

const speeds = [
    'title: Approximate eastward speed of the ground',
    'Equator: 465 m/s',
    '*60° latitude*: 233 m/s',
    'North Pole: 0 m/s',
].join('\n');

test('Expand into visual asks for a visual at the sketch, which then draws in its place a switch away from the sketch', async (t) => {
    const text = `Before.\n\n\`\`\`sketch bars\n${speeds}\n\`\`\`\n\nAfter.`,
        at = text.indexOf('```'),
        calls = [];
    const visual = (sketch) => ({
        id: 'v',
        kind: 'visual',
        conversation: 'root',
        message: 'r',
        title: 'Ground speed',
        description: 'Ground speed by latitude.',
        status: 'ready',
        source: '<p>speeds</p>',
        created: 0,
        position: at,
        sketch,
    });
    let update, dom;
    function Fixture() {
        const [artifacts, set] = useState([]);
        update = set;
        return h(
            ChatThread,
            threadProps({
                tree: {
                    id: 'root',
                    messages: [
                        { id: 'q', role: 'user', status: 'completed', text: 'Why?' },
                        { id: 'r', role: 'assistant', status: 'completed', text },
                    ],
                    artifacts,
                },
                expandSketch: async (...args) => void calls.push(['expand', ...args]),
                videoAction: async (...args) => void calls.push(args),
            }),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture), (w) => (dom = ui(w)));
    t.after(cleanup);
    const reply = () => container.querySelector('[data-chat-message="r"]');
    await act(async () => button(reply(), 'Expand into visual').click());
    assert.deepEqual(calls.shift(), ['expand', 'root', 'r', at]);
    await act(async () => update([visual('hidden')]));
    assert.equal(reply().querySelector('figure.sketch'), null);
    const figure = reply().querySelector('[data-artifact="v"]');
    assert.ok(figure.matches('figure.visual'), 'the visual draws where the sketch was');
    await act(async () => button(figure, 'Visual actions: Ground speed').click());
    await act(async () => dom.frames());
    const items = [...document.querySelectorAll('[role=menuitem]')];
    assert.deepEqual(
        items.map((e) => e.textContent.trim()),
        ['Try a new version…', 'Show sketch', 'Enlarge'],
    );
    await act(async () => items[1].click());
    assert.deepEqual(calls.shift(), ['root', 'v', 'sketch', undefined]);
    await act(async () => update([visual('shown')]));
    assert.equal(reply().querySelector('figure.visual'), null);
    await act(async () => button(reply(), 'Show visual').click());
    assert.deepEqual(calls.shift(), ['root', 'v', 'sketch', undefined]);
    // A failed expanded visual still leads back to its sketch.
    await act(async () =>
        update([{ ...visual('hidden'), status: 'failed', source: null, error: 'No model.' }]),
    );
    await act(async () => button(reply(), 'Show sketch').click());
    assert.deepEqual(calls.shift(), ['root', 'v', 'sketch', undefined]);
});
