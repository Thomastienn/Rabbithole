import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
const { default: ShellBand } = await import('../../src/shell/ShellBand.tsx');

const band = () =>
    h(ShellBand, {
        mobile: false,
        tab: 'Read',
        busy: false,
        drawer: false,
        views: [],
        saveAlert: null,
        setDrawer() {},
        search() {},
        newChat() {},
        library() {},
        settings() {},
    });

// The desktop preload's bridge: the page asks for actions, the shell pushes each new state.
function fakeDesktop(w, initial) {
    let state = initial,
        listener;
    const desktop = { asked: [], push: (update) => listener((state = update)) };
    w.rabbitholeDesktop = {
        update: async (action) => (desktop.asked.push(action), state),
        onUpdate: (next) => ((listener = next), () => {}),
    };
    return desktop;
}

test('the update card offers Install, shows progress, Restart and Retry, and hides until next launch', async (t) => {
    let desktop;
    const { container, act, cleanup } = await render(band(), (w) => {
        ui(w);
        desktop = fakeDesktop(w, null);
    });
    t.after(cleanup);
    const card = () => container.querySelector('.update-card');
    assert.equal(card(), null, 'nothing shows without a newer release');
    const push = (update) => act(async () => desktop.push(update));
    const base = { version: '1.0.214', current: '1.0.198' };

    await push({ ...base, stage: 'available' });
    assert.match(card().textContent, /1\.0\.214.*1\.0\.198/);
    assert.equal(card().querySelector('[role=progressbar]'), null, 'nothing downloads yet');
    await act(async () => button(card(), 'Install').click());
    assert.deepEqual(desktop.asked, ['get', 'install']);

    await push({ ...base, stage: 'downloading', percent: 46, transferred: 58e6, total: 126e6 });
    assert.equal(card().querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '46');
    assert.match(card().textContent, /46%.*58 of 126 MB/);

    await push({ ...base, stage: 'ready' });
    await act(async () => button(card(), 'Restart to update').click());
    assert.equal(desktop.asked.at(-1), 'restart');

    await push({ ...base, stage: 'failed', reason: 'The connection dropped.' });
    assert.equal(card().getAttribute('role'), 'alert');
    assert.match(card().textContent, /The connection dropped\./);
    await act(async () => button(card(), 'Retry').click());
    assert.equal(desktop.asked.at(-1), 'install');

    await act(async () => button(card(), 'Hide until next launch').click());
    assert.equal(card(), null);
    await push({ ...base, stage: 'ready' });
    assert.equal(card(), null, 'stays hidden for this launch');
});

test('the sidebar rail marks an update on Settings', async (t) => {
    const { container, cleanup } = await render(band(), (w) => {
        ui(w);
        w.localStorage.setItem('rabbithole.focus-mode', 'on');
        fakeDesktop(w, { stage: 'available', version: '1.0.214', current: '1.0.198' });
    });
    t.after(() => {
        localStorage.removeItem('rabbithole.focus-mode');
        return cleanup();
    });
    await new Promise((done) => setImmediate(done));
    const settings = container.querySelector('.sidebar-rail .update-dot button');
    assert.match(name(settings), /^Settings.*1\.0\.214/);
    assert.equal(container.querySelector('.update-card'), null, 'no card in the rail');
});
