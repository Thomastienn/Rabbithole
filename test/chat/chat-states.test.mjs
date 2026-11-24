import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { FirstQuestion, TreeLoading, TreeLoadFailure } =
    await import('../../src/chat/ChatStates.tsx');

test('first-question focus belongs to the composer frame, never the editor or placeholder', async (t) => {
    const { container, act, cleanup } = await render(
        h(
            'div',
            { className: 'overview library-content' },
            h(FirstQuestion, {
                draft: '',
                setDraft() {},
                files: [],
                setFiles() {},
                busy: false,
                available: true,
                modelMenu: null,
                submit() {},
                modelError: '',
                loadModels() {},
                noModels: false,
            }),
        ),
        ui,
    );
    t.after(cleanup);
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = ['library', 'workspace', 'states']
        .map((file) => readFileSync(`src/styles/${file}.css`, 'utf8'))
        .join('\n');
    const outer = container.querySelector('.astryx-chat-composer');
    const input = outer.querySelector('.astryx-chat-composer-input');
    const editor = input.querySelector('[role=textbox]');
    const placeholder = input.querySelector('[aria-hidden=true]');
    assert.ok(outer.classList.contains('single-ring-composer'));
    assert.ok(!input.classList.contains('single-ring-composer'));
    await act(async () => editor.focus());
    for (const element of [input, editor, placeholder]) {
        assert.equal(getComputedStyle(element).outline, 'none');
        assert.equal(getComputedStyle(element).boxShadow, 'none');
    }
});

test('first question retains its controlled draft, selects a model before sending, and exposes model recovery', async (t) => {
    let update;
    const submitted = [],
        retried = [];
    function Fixture() {
        const [value, set] = useState({
            draft: 'How do fungi trade?',
            available: true,
            busy: false,
            modelError: 'Models could not load',
            noModels: false,
        });
        update = set;
        return h(FirstQuestion, {
            ...value,
            setDraft: (draft) => set((v) => ({ ...v, draft })),
            files: [],
            setFiles() {},
            modelMenu: h('button', null, 'Model for next reply'),
            submit: (text) => submitted.push(text),
            loadModels: () => retried.push('models'),
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    assert.equal(
        container.querySelector('[role=textbox]').getAttribute('aria-label'),
        'Your question',
    );
    assert.equal(container.querySelector('[role=textbox]').textContent, 'How do fungi trade?');
    assert.ok(button(container, 'Model for next reply'));
    assert.match(container.querySelector('[role=alert]').textContent, /Models could not load/);
    await act(async () => button(container, 'Retry loading models').click());
    assert.deepEqual(retried, ['models']);
    await act(async () =>
        container
            .querySelector('[role=textbox]')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    assert.deepEqual(submitted, ['How do fungi trade?']);
    await act(async () =>
        update({
            draft: 'Keep my failed question',
            available: false,
            busy: false,
            modelError: '',
            noModels: true,
        }),
    );
    assert.equal(button(container, 'Send').disabled, true);
    assert.match(
        container.querySelector('.astryx-chat-composer').textContent,
        /No model is connected. Open Settings, then Connections./,
    );
    assert.equal(container.querySelector('[role=textbox]').textContent, 'Keep my failed question');
    assert.equal(container.querySelector('[role=alert]'), null);
});

test('loading tree announces four skeletons; load failure offers its retry handler', async (t) => {
    let finish;
    const calls = [];
    function Fixture() {
        const [loaded, set] = useState(false);
        finish = set;
        return loaded ? h(TreeLoadFailure, { retry: () => calls.push('tree') }) : h(TreeLoading);
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    assert.ok(
        container.querySelector('[role=status]').getAttribute('aria-label'),
        'named for assistive tech',
    );
    assert.equal(container.querySelectorAll('.astryx-skeleton').length, 4);
    await act(async () => finish(true));
    assert.match(container.textContent, /Tree could not load/);
    await act(async () => button(container, 'Retry loading tree').click());
    assert.deepEqual(calls, ['tree']);
});

test('with no chat model chosen, the first question asks for one in Settings', async (t) => {
    const opened = [];
    const props = {
        draft: 'Why?',
        setDraft() {},
        files: [],
        setFiles() {},
        busy: false,
        available: false,
        modelMenu: null,
        submit() {},
        modelError: '',
        loadModels() {},
        noModels: false,
        openSettings: (opener) => opened.push(opener),
    };
    const { container, act, cleanup } = await render(
        h('div', null, h(FirstQuestion, { ...props, needsModel: true })),
        ui,
    );
    t.after(cleanup);
    assert.match(container.textContent, /Choose a chat model in Settings/);
    const open = button(container, 'Open Settings');
    await act(async () => open.click());
    assert.deepEqual(opened, [open]);
    assert.equal(button(container, 'Send').disabled, true);
});

test('while the first question is sending, the box stays editable but Send, Enter and Attach wait', async (t) => {
    const submitted = [];
    function Fixture() {
        const [draft, setDraft] = useState('');
        return h(FirstQuestion, {
            draft,
            setDraft,
            files: [],
            setFiles() {},
            busy: true,
            available: true,
            modelMenu: null,
            submit: (text) => submitted.push(text),
            modelError: '',
            loadModels() {},
            noModels: false,
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    const editor = container.querySelector('[role=textbox]');
    assert.equal(editor.getAttribute('contenteditable'), 'true');
    assert.equal(editor.getAttribute('aria-disabled'), null);
    await act(async () => {
        editor.textContent = 'And lichens?';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(button(container, 'Send').disabled, true);
    assert.equal(button(container, 'Attach files').disabled, true);
    await act(async () =>
        editor.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
    );
    assert.deepEqual(submitted, []);
    assert.equal(container.querySelector('[role=textbox]').textContent, 'And lichens?');
});
