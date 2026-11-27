import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
import { threadProps } from '../support/thread-props.mjs';

test('a board reply left halfway shows its saved text and snapshot, no notice, and can be copied and branched', async (t) => {
    const { default: ChatThread } = await import('../../src/chat/ChatThread.tsx');
    const text = 'Pressure pushes the soft tip outward.';
    const message = {
        id: 'reply',
        role: 'assistant',
        status: 'interrupted',
        stopped: 'learner',
        text,
        board: true,
        snapshot: [
            { id: 'a', kind: 'text', at: [400, 400], text: 'soft tip' },
            { id: 'b', kind: 'text', at: [800, 400], text: 'pressure' },
        ],
    };
    const copied = [];
    const { container, act, cleanup } = await render(
        h(ChatThread, threadProps({ tree: { id: 'tree', messages: [message] } })),
        (window) => {
            ui(window);
            Object.defineProperty(window.navigator, 'clipboard', {
                value: { writeText: async (value) => copied.push(value) },
            });
        },
    );
    t.after(cleanup);
    const reply = container.querySelector('[data-chat-message="reply"]');
    assert.ok(reply.textContent.includes(text));
    assert.doesNotMatch(reply.textContent, /Reply interrupted/, 'no notice (mockup)');
    assert.match(
        reply.querySelector('[role=img]').getAttribute('aria-label'),
        /soft tip, pressure$/,
    );
    await act(async () => button(reply, 'Copy tutor reply 1').click());
    assert.deepEqual(copied, [text]);
    assert.ok(
        button(reply, 'Select passage in tutor reply 1'),
        'branchable like a completed reply',
    );
});
