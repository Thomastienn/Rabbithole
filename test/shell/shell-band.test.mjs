import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
const { default: ShellBand, SaveAlert, viewTab } = await import('../../src/shell/ShellBand.tsx');

test('desktop sidebar and narrow band keep control order, current views, drawer actions and layout Retry', async (t) => {
    let update;
    const calls = [];
    function Fixture() {
        const [value, set] = useState({ mobile: false, drawer: false, tab: 'Map', failed: true });
        update = set;
        const views = ['Read', 'Map', 'Knowledge', 'Videos'].map((label) =>
            viewTab(label, null, value.tab === label, () => {
                calls.push(label);
                set((v) => ({ ...v, tab: label }));
            }),
        );
        const setDrawer = (drawer) => set((v) => ({ ...v, drawer }));
        return h(
            'div',
            null,
            h(ShellBand, {
                ...value,
                busy: false,
                views,
                saveAlert:
                    value.failed &&
                    h(SaveAlert, {
                        retry: () => {
                            calls.push('retry');
                            set((v) => ({ ...v, failed: false }));
                        },
                    }),
                contents: h('aside', { className: 'contents' }, h('button', null, '1 Fungi')),
                setDrawer,
                newChat: () => calls.push('new'),
                search: () => calls.push('search'),
                library: () => calls.push('library'),
                settings: () => calls.push('settings'),
            }),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    assert.equal(container.querySelector('.shell-band, header'), null, 'no desktop top bar');
    let band = () => container.querySelector('nav.sidebar');
    assert.deepEqual([...band().querySelectorAll('button')].map(name), [
        'Shrink sidebar to rail',
        'Rabbithole',
        'New chat',
        'Search learning trees',
        'Read',
        'Map',
        'Knowledge',
        'Videos',
        'Library',
        'Retry saving layout',
        '1 Fungi',
        'Settings',
    ]);
    assert.ok(
        band().querySelector('.sidebar-top + .contents'),
        'page contents sit below the controls',
    );
    assert.match(
        band().querySelector('[role=alert]').textContent,
        /Map layout not saved.*retries every minute/s,
    );
    for (const label of ['Read', 'Knowledge', 'Videos', 'Map']) {
        await act(async () => button(band(), label).click());
        assert.equal(band().querySelector('[aria-current=page]').textContent, label);
    }
    for (const [label, expected] of [
        ['Search learning trees', 'search'],
        ['New chat', 'new'],
        ['Settings', 'settings'],
        ['Rabbithole', 'library'],
        ['Library', 'library'],
        ['Retry saving layout', 'retry'],
    ]) {
        await act(async () => button(band(), label).click());
        assert.equal(calls.at(-1), expected);
    }
    assert.equal(band().querySelector('[role=alert]'), null);
    await act(async () => update({ mobile: true, drawer: false, tab: 'Map', failed: false }));
    band = () => container.querySelector('.shell-band');
    assert.equal(
        container.querySelector('nav.sidebar:not(.sidebar-drawer)'),
        null,
        'no side column',
    );
    assert.equal(document.querySelector('dialog[open]'), null, 'the drawer starts closed');
    assert.deepEqual([...band().querySelectorAll('button')].map(name), [
        'Contents',
        'Rabbithole',
        'Hide top bar',
        'Search learning trees',
        'New chat',
    ]);
    for (const [label, expected] of [
        ['Search learning trees', 'search'],
        ['New chat', 'new'],
        ['Rabbithole', 'library'],
    ]) {
        await act(async () => button(band(), label).click());
        assert.equal(calls.at(-1), expected);
    }
    const contents = button(band(), 'Contents');
    // The drawer holds the whole sidebar; every choice in it closes the drawer and focus returns to Contents.
    for (const [label, expected] of [
        ['Close contents', undefined],
        ['New chat', 'new'],
        ['Search learning trees', 'search'],
        ['Knowledge', 'Knowledge'],
        ['Library', 'library'],
        ['1 Fungi', undefined],
        ['Settings', 'settings'],
    ]) {
        calls.length = 0;
        await act(async () => {
            contents.focus();
            contents.click();
        });
        assert.equal(contents.getAttribute('aria-expanded'), 'true');
        const drawer = document.querySelector('dialog[open]');
        assert.ok(drawer?.querySelector('nav.sidebar-drawer'), label);
        assert.deepEqual([...drawer.querySelectorAll('.sidebar-views button')].map(name), [
            'Read',
            'Map',
            'Knowledge',
            'Videos',
            'Library',
        ]);
        assert.ok(
            drawer.querySelector('.sidebar-top + .contents'),
            'the outline sits below the views',
        );
        assert.ok(
            button(drawer.querySelector('.sidebar-foot'), 'Settings'),
            'Settings at the foot',
        );
        await act(async () => button(drawer, label).click());
        assert.equal(calls.at(-1), expected, label);
        assert.equal(contents.getAttribute('aria-expanded'), 'false', label);
        // jsdom has no CSS transitions; finish the drawer exit without waiting for its timer.
        const exit = new Event('transitionend', { bubbles: true });
        Object.defineProperty(exit, 'propertyName', { value: 'transform' });
        await act(async () => drawer.dispatchEvent(exit));
        assert.equal(document.querySelector('dialog[open]'), null, label);
        assert.ok(document.activeElement === contents, `${label} returns focus to Contents`);
    }
    await act(async () => contents.click());
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => document.querySelector('dialog[open]').dispatchEvent(escape));
    assert.equal(contents.getAttribute('aria-expanded'), 'false', 'Escape closes the drawer');
});

// Astryx renders a button's tooltip right after it, and skips aria-describedby when it only repeats the name.
const tip = (b) => {
    let e = b.nextElementSibling;
    while (e && e.getAttribute('role') !== 'tooltip') e = e.nextElementSibling;
    return e?.textContent;
};

test('focus mode shrinks the sidebar to a labelled rail of named icons that keep focus mode', async (t) => {
    const calls = [];
    function Fixture() {
        const [tab, setTab] = useState('Map');
        const views = ['Read', 'Map', 'Knowledge', 'Videos', 'Pieces'].map((label) =>
            viewTab(label, h('svg'), tab === label, () => setTab(label)),
        );
        return h(ShellBand, {
            mobile: false,
            tab,
            busy: false,
            drawer: false,
            views,
            saveAlert: h(SaveAlert, { retry() {} }),
            contents: h('aside', { className: 'contents' }, h('button', null, '1 Fungi')),
            setDrawer() {},
            search: () => calls.push('search'),
            newChat: () => calls.push('new'),
            library: () => (calls.push('library'), setTab('library')),
            settings: () => (calls.push('settings'), setTab('settings')),
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), (w) => {
        ui(w);
        w.localStorage.setItem('rabbithole.focus-mode', 'on');
    });
    t.after(() => {
        localStorage.removeItem('rabbithole.focus-mode');
        return cleanup();
    });
    const rail = () => container.querySelector('nav.sidebar-rail[aria-label="App"]');
    const buttons = () => [...rail().querySelectorAll('button')];
    assert.deepEqual(buttons().map(name), [
        'Show full sidebar',
        'New chat',
        'Search learning trees',
        'Read',
        'Map',
        'Knowledge',
        'Videos',
        'Pieces',
        'Library',
        'Settings',
    ]);
    assert.ok(
        rail().querySelector('.sidebar-foot button[aria-label="Settings"]'),
        'Settings at the foot',
    );
    assert.equal(rail().querySelector('.contents'), null, 'no contents outline in the rail');
    assert.equal(rail().querySelector('[role=alert]'), null);
    assert.match(
        container.querySelector('.focus-save [role=alert]').textContent,
        /Map layout not saved/,
    );
    for (const b of buttons()) {
        assert.equal(b.textContent.trim(), '', `${name(b)} shows its icon only`);
        assert.ok(tip(b)?.startsWith(name(b)), `${name(b)} tooltip carries its name`);
    }
    assert.equal(tip(button(rail(), 'Show full sidebar')), 'Show full sidebar (Ctrl+Shift+F)');
    assert.equal(tip(button(rail(), 'New chat')), 'New chat (Ctrl+Shift+O)');
    assert.equal(button(rail(), 'Map').getAttribute('aria-current'), 'page');
    for (const label of ['Read', 'Knowledge', 'Videos', 'Pieces', 'Map']) {
        await act(async () => button(rail(), label).click());
        assert.equal(rail().querySelector('[aria-current=page]').getAttribute('aria-label'), label);
    }
    for (const [label, expected] of [
        ['New chat', 'new'],
        ['Search learning trees', 'search'],
        ['Library', 'library'],
        ['Settings', 'settings'],
    ]) {
        await act(async () => button(rail(), label).click());
        assert.equal(calls.at(-1), expected);
        assert.ok(rail(), `${label} keeps focus mode`);
    }
    assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'on');
});

test('the toggle and shortcut switch between rail and full sidebar, survive a shell remount and ignore text entry, alternate chords and held keys', async (t) => {
    let mount;
    function Fixture() {
        const [mounted, setMounted] = useState(true);
        mount = setMounted;
        return h(
            'div',
            null,
            mounted &&
                h(ShellBand, {
                    mobile: false,
                    tab: 'learning',
                    busy: false,
                    drawer: false,
                    views: [],
                    saveAlert: h(SaveAlert, { retry() {} }),
                    contents: h('aside', { className: 'contents' }, h('button', null, '1 Fungi')),
                    setDrawer() {},
                    search() {},
                    newChat() {},
                    library() {},
                    settings() {},
                }),
            h('input'),
            h('textarea'),
            h('select'),
            h(
                'div',
                { contentEditable: true, suppressContentEditableWarning: true },
                h('span', null, 'Editable'),
            ),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(() => {
        localStorage.removeItem('rabbithole.focus-mode');
        return cleanup();
    });
    const full = 'nav.sidebar:not(.sidebar-rail) .contents';
    const rail = 'nav.sidebar-rail';
    const chord = async (target, options = {}) => {
        const e = new KeyboardEvent('keydown', {
            key: 'F',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
            ...options,
        });
        await act(async () => target.dispatchEvent(e));
        return e;
    };
    for (const target of container.querySelectorAll(
        'input, textarea, select, [contenteditable] span',
    )) {
        assert.equal((await chord(target)).defaultPrevented, false);
        assert.ok(container.querySelector(full));
    }
    for (const options of [
        { ctrlKey: false },
        { shiftKey: false },
        { altKey: true },
        { metaKey: true },
        { repeat: true },
        { isComposing: true },
        { key: 'G' },
    ]) {
        assert.equal((await chord(container, options)).defaultPrevented, false);
        assert.ok(container.querySelector(full));
    }
    const handled = new KeyboardEvent('keydown', {
        key: 'F',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
    });
    handled.preventDefault();
    await act(async () => container.dispatchEvent(handled));
    assert.ok(container.querySelector(full));
    await chord(container);
    assert.ok(container.querySelector(rail));
    assert.equal(container.querySelector('.contents'), null);
    assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'on');
    assert.equal(container.querySelector('.focus-hot-zone'), null, 'desktop has no top hot zone');
    await chord(container);
    assert.ok(container.querySelector(full));
    await chord(container);
    await act(async () => mount(false));
    await act(async () => mount(true));
    assert.ok(container.querySelector(rail), 'the rail survives a remount');
    // One toggle, first in both the rail and the full sidebar, the same button across the switch.
    const toggle = container.querySelector('nav button');
    assert.equal(name(toggle), 'Show full sidebar');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    const railIcon = toggle.querySelector('svg path').getAttribute('d');
    await act(async () => {
        toggle.focus();
        toggle.click();
    });
    assert.ok(container.querySelector(full));
    assert.equal(container.querySelector('nav button'), toggle, 'same button, not remounted');
    assert.equal(name(toggle), 'Shrink sidebar to rail');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.notEqual(
        toggle.querySelector('svg path').getAttribute('d'),
        railIcon,
        'the icon changes',
    );
    assert.equal(document.activeElement, toggle);
    assert.equal(container.querySelectorAll('button[aria-expanded]').length, 1, 'one toggle');
    assert.equal(container.querySelector('.focus-save'), null);
    await act(async () => mount(false));
    await act(async () => mount(true));
    assert.ok(container.querySelector(full));
    assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'off');
});

test('Ctrl+Shift+O starts one new chat per press from anywhere, including text entry, but not while opening', async (t) => {
    let setBusy;
    const calls = [];
    function Fixture() {
        const [busy, set] = useState(false);
        setBusy = set;
        return h(
            'div',
            null,
            h(ShellBand, {
                mobile: false,
                tab: 'library',
                busy,
                drawer: false,
                views: [],
                saveAlert: null,
                setDrawer() {},
                search() {},
                newChat: () => calls.push('new'),
                library() {},
                settings() {},
            }),
            h('textarea'),
            h('div', { className: 'astryx-chat-composer', contentEditable: true, role: 'textbox' }),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    const press = async (target, options = {}) => {
        const e = new KeyboardEvent('keydown', {
            key: 'O',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
            ...options,
        });
        await act(async () => target.dispatchEvent(e));
        return e.defaultPrevented;
    };
    for (const target of [
        container,
        container.querySelector('textarea'),
        container.querySelector('[role=textbox]'),
    ])
        assert.equal(await press(target), true, 'browser default prevented');
    assert.deepEqual(calls, ['new', 'new', 'new']);
    assert.equal(await press(container, { repeat: true }), true);
    assert.equal(await press(container, { isComposing: true }), false);
    for (const options of [
        { ctrlKey: false },
        { shiftKey: false },
        { altKey: true },
        { metaKey: true },
        { key: 'P' },
    ])
        assert.equal(await press(container, options), false);
    assert.equal(calls.length, 3, 'repeats, composition and other chords do nothing');
    await act(async () => setBusy(true));
    assert.equal(await press(container), true);
    assert.equal(calls.length, 3, 'nothing while a tree is opening');
});
