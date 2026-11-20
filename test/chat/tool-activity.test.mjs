import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
import { applyStreamEvent, toolLine } from '../../src/chat/turn.ts';
const { default: ToolActivity } = await import('../../src/chat/ToolActivity.tsx');

const tool = (id, status, output = null) => ({
    id,
    name: 'read_page',
    input: { url: `https://example.com/${id}` },
    status,
    output,
    elapsed: status === 'running' ? 0 : 1500,
});

test('tool events fold into the live reply in call order, updating each call in place', () => {
    const turn = {};
    applyStreamEvent(turn, { type: 'saved', id: 'r', user: { id: 'u' } }, 'c');
    assert.equal(applyStreamEvent(turn, { type: 'tool', tool: tool('a', 'running') }, 'c'), true);
    applyStreamEvent(turn, { type: 'tool', tool: tool('b', 'running') }, 'c');
    applyStreamEvent(turn, { type: 'tool', tool: tool('a', 'done', 'Page') }, 'c');
    assert.deepEqual(turn.reply.tools, [tool('a', 'done', 'Page'), tool('b', 'running')]);
    assert.equal(toolLine(turn.reply.tools), 'Running read_page…');
    assert.equal(toolLine([tool('a', 'done', 'x')]), 'Used 1 tool: read_page');
    assert.equal(
        toolLine([tool('a', 'done', 'x'), tool('b', 'failed', 'Error')]),
        'Used 2 tools: read_page · 1 failed',
    );
    const memo = (status) => ({ ...tool('m', status, 'x'), name: 'update_memory_note' });
    assert.equal(toolLine([memo('done')]), 'Updated memory note');
    assert.equal(
        toolLine([tool('a', 'done', 'x'), memo('done'), memo('done')]),
        'Used 1 tool: read_page · Updated memory note',
    );
    assert.equal(toolLine([memo('failed')]), 'Used 1 tool: update_memory_note · 1 failed');
});

test('tool activity line starts collapsed and expands to each input and raw output', async (t) => {
    const { container, act, cleanup } = await render(
        h(ToolActivity, {
            tools: [
                tool('a', 'done', 'URL: https://example.com/a\n\nRaw page text'),
                tool('b', 'running'),
            ],
        }),
        ui,
    );
    t.after(cleanup);
    const trigger = button(container, 'Running read_page…');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    await act(async () => trigger.click());
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    const blocks = [...container.querySelectorAll('pre')].map((p) => p.textContent);
    assert.deepEqual(blocks, [
        JSON.stringify({ url: 'https://example.com/a' }, null, 2),
        'URL: https://example.com/a\n\nRaw page text',
        JSON.stringify({ url: 'https://example.com/b' }, null, 2),
        'Running…',
    ]);
    assert.match(container.textContent, /read_page · done · 1\.5 s/);
});
