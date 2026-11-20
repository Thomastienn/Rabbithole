import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicDiscussion } from '../fixtures/discussion.mjs';
import { button } from '../support/ui.mjs';
import { mount, summary, tree } from '../support/chat-page-kit.mjs';

// Composition check for the split ChatPage: its hooks load state, models and a chat into the regions.

test('inline discussion replies reach their card endpoint and main-thread closing removes the reply box live', async (t) => {
    let artifact = {
        id: 'd',
        conversation: 't1',
        message: 'a1',
        kind: 'discussion',
        status: 'ready',
        title: 'Discussion',
        description: '',
        position: 7,
        discussion: publicDiscussion,
        error: null,
    };
    let stream, mainStream, request;
    const wire = (event) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
    const { container, act } = await mount(t, [summary], {
        artifacts: [artifact],
        respond: (path, options) => {
            if (path === '/api/trees/t1')
                return { ok: true, json: async () => ({ ...tree, artifacts: [artifact] }) };
            if (path === '/api/trees/t1/discussions/d/replies') {
                request = options;
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            stream = controller;
                        },
                    }),
                );
            }
            if (path === '/api/trees/t1/messages') {
                artifact = { ...artifact, discussion: { ...artifact.discussion, closed: true } };
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            mainStream = controller;
                            controller.enqueue(
                                wire({
                                    type: 'saved',
                                    id: 'a2',
                                    title: 'Fungi',
                                    user: {
                                        id: 'q2',
                                        role: 'user',
                                        text: 'Continue',
                                        status: 'completed',
                                    },
                                }),
                            );
                            controller.enqueue(wire({ type: 'artifact', artifact }));
                        },
                    }),
                );
            }
        },
    });
    const card = () => container.querySelector('.discussion-card');
    const reply = card().querySelector('[role=textbox]');
    await act(async () => {
        reply.textContent = 'Theo, both benefit.';
        reply.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(card(), 'Send to the discussion').click());
    assert.equal(request.headers['X-Rabbithole-CSRF'], 'c');
    assert.deepEqual(JSON.parse(request.body), { text: 'Theo, both benefit.' });
    artifact = {
        ...artifact,
        discussion: {
            ...publicDiscussion,
            lines: [...publicDiscussion.lines, { speaker: 'Learner', text: 'Theo, both benefit.' }],
            turn: { start: 5, status: 'streaming' },
        },
    };
    await act(async () => stream.enqueue(wire({ type: 'artifact', artifact })));
    assert.equal(card().querySelectorAll('[data-speaker=learner]').length, 1);
    artifact = {
        ...artifact,
        discussion: {
            ...artifact.discussion,
            lines: [...artifact.discussion.lines, { speaker: 'Theo', text: 'That makes sense.' }],
            turn: { start: 5, status: 'completed' },
        },
    };
    await act(async () => {
        stream.enqueue(wire({ type: 'artifact', artifact }));
        stream.close();
    });
    assert.ok(card().textContent.includes('That makes sense.'));
    assert.equal(container.querySelectorAll('[data-chat-message]').length, 2);
    const mainInput = [...container.querySelectorAll('#focused-chat [role=textbox]')].find(
        (e) => !e.closest('.discussion-card'),
    );
    await act(async () => {
        mainInput.textContent = 'Continue';
        mainInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
        mainInput.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
    );
    assert.ok(card().getAttribute('aria-label').endsWith(', closed'));
    assert.ok(
        !card().querySelector('[role=textbox]'),
        'closed state arrives before the main stream ends',
    );
    await act(async () => {
        mainStream.enqueue(wire({ type: 'done', status: 'completed' }));
        mainStream.close();
    });
});

test('with no saved trees the page shows the first-question composer and its model menu', async (t) => {
    const { container, calls } = await mount(t, []);
    assert.ok(calls.includes('/api/state') && calls.includes('/api/models'));
    assert.ok(container.querySelector('.first-question'));
    assert.ok(button(container, 'Model for next reply'));
    assert.match(container.querySelector('.chat-model').textContent, /Claude · Opus/);
});

test('files sit above the question bubble, and a files-only question draws no bubble', async (t) => {
    const file = (id, name) => ({ id, name, type: 'text/plain', size: 1, delivery: 'text' });
    tree.messages.push(
        {
            id: 'q2',
            role: 'user',
            text: 'And these?',
            status: 'completed',
            attachments: [file('f1', 'a.txt')],
        },
        { id: 'a2', role: 'assistant', text: 'Yes.', status: 'completed' },
        {
            id: 'q3',
            role: 'user',
            text: '',
            status: 'completed',
            attachments: [file('f2', 'b.txt')],
        },
    );
    t.after(() => tree.messages.splice(2));
    const { container } = await mount(t, [summary]);
    const [, withText, filesOnly] = container.querySelectorAll('.chat-question');
    const files = withText.querySelector('.message-files');
    assert.equal(files.nextElementSibling, withText.querySelector('.question-bubble'));
    assert.ok(
        !withText.querySelector('.question-bubble .message-files'),
        'files are outside the bubble',
    );
    assert.match(filesOnly.querySelector('.message-files').textContent, /b\.txt/);
    assert.equal(filesOnly.querySelector('.question-bubble'), null);
});

test('learner messages render markdown with coloured code but no reply-only features', async (t) => {
    const { loadLanguage } = await import('../../src/markdown/codeTokens.ts');
    await loadLanguage('java');
    const text = 'Why does *this* fail?\n\n- one\n- two\n\n```java\nint x = 1;\n```';
    tree.messages.push(
        { id: 'q2', role: 'user', text, status: 'completed' },
        { id: 'a2', role: 'assistant', text: 'Because.', status: 'completed' },
    );
    t.after(() => tree.messages.splice(2));
    const { container } = await mount(t, [summary]);
    const bubble = container
        .querySelectorAll('.chat-question')[1]
        .querySelector('.question-bubble');
    assert.equal(bubble.querySelector('em').textContent, 'this');
    assert.deepEqual(
        [...bubble.querySelectorAll('li')].map((li) => li.textContent),
        ['one', 'two'],
    );
    assert.equal(bubble.querySelector('pre code').textContent.trim(), 'int x = 1;');
    assert.equal(bubble.querySelector('.astryx-token-keyword').textContent, 'int');
    assert.equal(
        bubble.querySelector('.passage, .suggestion, figure'),
        null,
        'no reply-only parts',
    );
    assert.equal(tree.messages[2].text, text, 'stored text is unchanged');
});

test('a saved tree opens its conversation with the thread, title and map', async (t) => {
    const { container, calls } = await mount(t, [summary]);
    assert.ok(calls.includes('/api/trees/t1'));
    assert.equal(container.querySelector('#rename-conversation h2').textContent, 'Fungi');
    const chip = container.querySelector('#rename-conversation .title-chip');
    assert.equal(chip.textContent, '1');
    assert.equal(
        chip.style.getPropertyValue('--ink'),
        'var(--rabbithole-paper)',
        'trunk is porcelain',
    );
    assert.equal(container.querySelector('.question-bubble').textContent, 'What are hyphae?');
    assert.match(container.querySelector('.chat-reply').textContent, /Thin threads\./);
    assert.ok(container.querySelector('#learning-tree-map'));
    assert.ok(button(container, 'Copy tutor reply 1'));
});

test('a child shows its first question once, in the thread, not on the origin line', async (t) => {
    const branch = { parent: 't0', messageId: 'm1', start: 0, end: 5, text: 'Spore' };
    const { container } = await mount(t, [summary], {
        respond: (path) =>
            path === '/api/trees/t1' && {
                ok: true,
                json: async () => ({
                    ...tree,
                    branch: { ...branch, question: 'What are hyphae?' },
                }),
            },
    });
    assert.match(container.querySelector('.origin-line').textContent, /at Spore/);
    assert.equal(container.querySelector('.origin-question'), null);
    assert.equal(container.querySelector('.question-bubble').textContent, 'What are hyphae?');
});

test('map media chips open focused chat, focus and center the chosen artifact', async (t) => {
    const artifacts = [
        {
            id: 'visual:1',
            kind: 'visual',
            title: 'Reach',
            status: 'ready',
            source: '<p>Roots</p>',
            position: 0,
        },
        { id: 'diagram:2', kind: 'mermaid', title: 'Trade loop', status: 'pending' },
        {
            id: 'video:3',
            kind: 'video',
            title: 'Trade narrated',
            status: 'ready',
            available: false,
        },
        {
            id: 'discussion:4',
            kind: 'discussion',
            title: 'Discussion',
            status: 'ready',
            classmates: 3,
            discussion: publicDiscussion,
            position: 7,
        },
        {
            id: 'discussion:5',
            kind: 'discussion',
            title: 'Discussion',
            status: 'failed',
            classmates: 0,
            position: 7,
        },
    ].map((a) => ({ conversation: 't1', message: 'a1', description: a.title, source: null, ...a }));
    const { container, act, settle, scrolls } = await mount(t, [summary], { artifacts });
    for (const artifact of artifacts) {
        await act(async () => button(container.querySelector('nav.sidebar'), 'Map').click());
        const chip = [...container.querySelectorAll('.node-chip')].find(
            (c) => c.dataset.artifact === artifact.id,
        );
        assert.ok(chip, artifact.kind);
        await act(async () => {
            chip.focus();
            chip.click();
        });
        await settle();
        const chat = container.querySelector('#focused-chat');
        const target = [...chat.querySelectorAll('[data-artifact]')].find(
            (a) => a.dataset.artifact === artifact.id,
        );
        assert.equal(chat.style.display, 'flex');
        assert.ok(target, artifact.kind);
        assert.ok(document.activeElement === target, `focus lands on ${artifact.kind}`);
        assert.ok(scrolls.some((s) => s.element === target && s.options.block === 'center'));
        assert.ok(scrolls.at(-1).element === target, 'scroll lands in chat, not the map chip');
        // ChatLayout jumps to the bottom on the frame after mount, so the centering must hold past it.
        const before = scrolls.length;
        await settle();
        assert.ok(
            scrolls.length > before,
            `centering on ${artifact.kind} holds past the first frame`,
        );
        assert.ok(scrolls.at(-1).element === target);
    }
});

test('the sidebar holds Contents on the reading and map views, and a map-view row opens the focused chat', async (t) => {
    // The old Contents preference is ignored: the panel shows even when it was saved collapsed.
    const { container, act } = await mount(t, [{ ...summary, created: '2026-11-15T00:00:00Z' }], {
        contents: 'collapsed',
    });
    const sidebar = () => container.querySelector('nav.sidebar');
    const chat = () => container.querySelector('#focused-chat');
    assert.equal(container.querySelector('.shell-band'), null, 'no desktop top bar');
    assert.ok(sidebar().querySelector('aside[aria-label="Learning tree contents"]'));
    assert.equal(
        container.querySelector('[aria-label="Show contents"], [aria-label="Hide contents"]'),
        null,
    );
    assert.ok(sidebar().querySelector('[aria-current=page]') === button(sidebar(), 'Read'));
    await act(async () => button(sidebar(), 'Map').click());
    assert.equal(chat().style.display, 'none');
    assert.ok(sidebar().querySelector('.contents'), 'contents stay on the map view');
    await act(async () => sidebar().querySelector('.contents-row').click());
    await act(async () => {});
    assert.equal(chat().style.display, 'flex');
    assert.ok(sidebar().querySelector('[aria-current=page]') === button(sidebar(), 'Read'));
    for (const label of ['Knowledge', 'Videos', 'Pieces', 'Library']) {
        await act(async () => button(sidebar(), label).click());
        assert.equal(sidebar().querySelector('.contents'), null, label);
        assert.ok(sidebar().querySelector('.sidebar-top'), label);
        if (label === 'Pieces') {
            const panel = container.querySelector('main[aria-label=Pieces]');
            assert.ok(
                sidebar().querySelector('[aria-current=page]') === button(sidebar(), 'Pieces'),
            );
            assert.ok(panel.querySelector('#return-from-pieces'), 'returns like the other views');
        }
    }
    assert.ok(
        button(container.querySelector('.library-panel'), 'New chat'),
        'Library header keeps New chat',
    );
});

test('Return to learning tree on Videos and Pieces goes back to the open conversation', async (t) => {
    const { container, act, settle } = await mount(t, [summary]);
    const sidebar = () => container.querySelector('nav.sidebar');
    const chat = () => container.querySelector('#focused-chat');
    for (const [label, id] of [
        ['Videos', 'return-from-videos'],
        ['Pieces', 'return-from-pieces'],
    ]) {
        await act(async () => button(sidebar(), label).click());
        const panel = container.querySelector(`main[aria-label=${label}]`);
        assert.ok(!panel.hidden, label);
        assert.ok(
            panel.querySelector(`#${id}`).compareDocumentPosition(panel.querySelector('h1')) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            `${label}: return sits above the page head`,
        );
        await act(async () => panel.querySelector(`#${id}`).click());
        await settle();
        assert.ok(panel.hidden, label);
        assert.equal(chat().style.display, 'flex', label);
        assert.match(chat().textContent, /What are hyphae\?/, `${label}: the same conversation`);
    }
});

test('focus mode toggles from chat, map and non-chat pages without consuming composer or Vim keys', async (t) => {
    const { container, act } = await mount(t, [summary], { vim: true });
    const key = async (target, options = {}) => {
        const event = new KeyboardEvent('keydown', {
            key: 'F',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
            ...options,
        });
        await act(async () => target.dispatchEvent(event));
        return event;
    };
    // Focus mode shrinks the sidebar to the rail; `band()` is the full sidebar.
    const band = () => container.querySelector('.sidebar:not(.sidebar-rail)');
    const rail = () => container.querySelector('.sidebar-rail');
    const hide = button(container, 'Shrink sidebar to rail');
    assert.equal(hide.getAttribute('aria-expanded'), 'true');
    await act(async () => {
        hide.focus();
        hide.click();
    });
    assert.equal(band(), null);
    assert.ok(rail());
    assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'on');
    let restore = button(container, 'Show full sidebar');
    assert.equal(restore.getAttribute('aria-expanded'), 'false');
    assert.equal(restore, hide, 'the focused toggle stays put');
    assert.equal(document.activeElement, restore);
    await act(async () => restore.click());
    assert.ok(band());
    assert.equal(document.activeElement, button(container, 'Shrink sidebar to rail'));
    assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'off');
    for (const target of [
        container.querySelector('[role=textbox]'),
        button(container.querySelector('.astryx-chat-composer'), 'Model for next reply'),
    ]) {
        assert.equal((await key(target)).defaultPrevented, false);
        assert.ok(band());
    }
    assert.equal((await key(container.querySelector('.question-bubble'))).defaultPrevented, true);
    assert.equal(band(), null);
    // Rail views switch pages and keep the rail.
    await act(async () => button(rail(), 'Map').click());
    assert.ok(rail());
    const canvas = container.querySelector('.tree-canvas');
    assert.ok(canvas);
    assert.equal((await key(canvas, { key: 'f', shiftKey: false })).defaultPrevented, false);
    assert.ok(rail());
    assert.equal((await key(canvas)).defaultPrevented, true);
    assert.ok(band());
    assert.equal((await key(canvas)).defaultPrevented, true);
    for (const label of ['Knowledge', 'Videos', 'Pieces', 'Settings']) {
        await act(async () => button(rail(), label).click());
        assert.ok(rail(), label);
        await act(async () => button(container, 'Show full sidebar').click());
        assert.ok(band(), label);
        assert.equal((await key(container)).defaultPrevented, true);
        assert.equal(band(), null, label);
    }
});

test('Search from the narrow drawer returns focus to Contents when the palette closes', async (t) => {
    const { container, act, settle } = await mount(t, [summary], { mobile: true });
    const contents = button(container.querySelector('header.shell-band'), 'Contents');
    await act(async () => {
        contents.focus();
        contents.click();
    });
    const drawer = document.querySelector('dialog[open]');
    // A pointer press or Enter leaves focus on the drawer's Search; the palette takes it as its opener.
    const search = button(drawer, 'Search learning trees');
    await act(async () => {
        search.focus();
        search.click();
    });
    // jsdom has no CSS transitions; finish the drawer exit without waiting for its timer.
    const exit = new Event('transitionend', { bubbles: true });
    Object.defineProperty(exit, 'propertyName', { value: 'transform' });
    await act(async () => drawer.dispatchEvent(exit));
    const input = document.querySelector('dialog[open] input');
    assert.ok(input, 'the palette opens');
    await act(async () =>
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        ),
    );
    await settle();
    assert.equal(document.querySelector('dialog[open]'), null);
    assert.ok(document.activeElement === contents, 'focus returns to Contents');
});

test('narrow screens keep the header and contents drawer, also after saved focus mode', async (t) => {
    const { container, act } = await mount(t, [summary], { mobile: true, focus: 'on' });
    assert.equal(container.querySelector('.shell-band'), null);
    assert.equal(container.querySelector('.sidebar'), null);
    assert.equal(container.querySelector('[aria-label="Show contents"]'), null);
    await act(async () => button(container, 'Show top bar').click());
    const show = button(container.querySelector('header.shell-band'), 'Contents');
    assert.equal(show.getAttribute('aria-expanded'), 'false');
    assert.equal(show.getAttribute('aria-haspopup'), 'dialog');
    await act(async () => {
        show.focus();
        show.click();
    });
    assert.equal(show.getAttribute('aria-expanded'), 'true');
    const drawer = document.querySelector('dialog[open]');
    assert.ok(drawer);
    assert.ok(button(drawer, 'Read'));
    assert.ok(drawer.querySelector('.contents'));
    await act(async () => button(drawer, 'Knowledge').click());
    assert.equal(show.getAttribute('aria-expanded'), 'false');
    // jsdom has no CSS transitions; finish the drawer exit without waiting for its timer.
    const exit = new Event('transitionend', { bubbles: true });
    Object.defineProperty(exit, 'propertyName', { value: 'transform' });
    await act(async () => drawer.dispatchEvent(exit));
    assert.ok(!document.querySelector('dialog[open]'));
});
