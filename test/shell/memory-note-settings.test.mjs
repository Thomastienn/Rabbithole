import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: MemoryNoteSettings } = await import('../../src/settings/MemoryNoteSettings.tsx');

test('memory note section shows the saved note, saves edits and reports status', async (t) => {
    let saved = { note: '- Knows Python' };
    const writes = [];
    const api = async (path, body) => {
        assert.equal(path, '/api/settings/memory-note');
        if (body) writes.push((saved = body));
        return saved;
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(MemoryNoteSettings), (w) => ui(w));
    t.after(cleanup);
    await act(async () => {});
    const box = container.querySelector('textarea');
    assert.equal(box.value, '- Knows Python');
    await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(
            box,
            '- Knows Rust',
        );
        box.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => button(container, 'Save').click());
    assert.deepEqual(writes, [{ note: '- Knows Rust' }]);
    assert.ok(
        [...container.querySelectorAll('[role=status]')].some(
            (e) => e.textContent === 'Memory note saved.',
        ),
    );
});
