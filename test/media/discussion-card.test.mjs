import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
import { publicDiscussion } from '../fixtures/discussion.mjs';
const { default: DiscussionCard, linePause } = await import('../../src/media/DiscussionCard.tsx');
// Mark the first n lines of a discussion as already seen in this browser.
const seen = (id, n) => (w) => {
    ui(w);
    w.localStorage.setItem(`rabbithole.discussion-seen.${id}`, String(n));
};
const typeInto = (input, text) => {
    input.textContent = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
};
const enter = (input) =>
    input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

test('discussion opening repeats speaker names, reads plain text and never exposes levels', async (t) => {
    const artifact = {
        id: 'discussion',
        kind: 'discussion',
        status: 'ready',
        discussion: {
            ...publicDiscussion,
            lines: [...publicDiscussion.lines, { speaker: 'Jun', text: '<b>**Still plain**</b>' }],
        },
    };
    const { container, cleanup } = await render(
        h(DiscussionCard, { artifact }),
        seen('discussion', 5),
    );
    t.after(cleanup);
    const card = container.querySelector('section');
    assert.equal(card.tabIndex, -1);
    assert.ok(
        !card.querySelector('.discussion-card__busy,.discussion-card__hint'),
        'seen lines show at once',
    );
    assert.equal(card.dataset.artifact, artifact.id);
    assert.equal(card.getAttribute('aria-label'), 'Discussion with Theo, Maya and Jun');
    assert.match(card.querySelector('header').textContent, /Open/);
    assert.ok(card.querySelector('[role=textbox][aria-label="Reply in the discussion"]'));
    const lines = [...card.querySelector('ol[aria-label="Discussion lines"]').children];
    assert.equal(lines.length, artifact.discussion.lines.length);
    for (const [i, line] of lines.entries()) {
        assert.match(line.textContent, new RegExp(artifact.discussion.lines[i].speaker));
        assert.ok(line.textContent.includes(artifact.discussion.lines[i].text));
    }
    assert.doesNotMatch(card.textContent, /below|above|near|level|beginner|advanced/i);
    assert.ok(!card.querySelector('b, strong, [data-o]'));
    card.focus();
    assert.ok(document.activeElement === card, `focus was ${document.activeElement.tagName}`);
});

test('closed cards keep lines readable and have no reply strip or textbox', async (t) => {
    const artifact = {
        id: 'closed',
        status: 'ready',
        discussion: { ...publicDiscussion, closed: true },
    };
    const { container, cleanup } = await render(h(DiscussionCard, { artifact }), ui);
    t.after(cleanup);
    const card = container.querySelector('section');
    assert.equal(card.getAttribute('aria-label'), 'Discussion with Theo, Maya and Jun, closed');
    assert.match(card.querySelector('header').textContent, /Closed/);
    assert.ok(!card.querySelector('[role=textbox],textarea,button,.discussion-card__reply'));
    assert.equal(card.querySelectorAll('ol > li').length, publicDiscussion.lines.length);
    assert.ok(
        card.textContent.includes(
            'Closed when you asked in the conversation. You can still read it and branch from any line.',
        ),
    );
});

test('reply entry sends with Enter, shows optimistic learner/busy and streamed lines, then enables after failure', async (t) => {
    const done = Promise.withResolvers(),
        calls = [];
    const initial = {
        id: 'reply',
        kind: 'discussion',
        status: 'ready',
        error: null,
        discussion: publicDiscussion,
    };
    let publish;
    function Harness() {
        const [artifact, setArtifact] = useState(initial);
        publish = setArtifact;
        return h(DiscussionCard, {
            artifact,
            onReply: async (a, text) => {
                calls.push({ a, text });
                await done.promise;
            },
        });
    }
    t.mock.method(Math, 'random', () => 0.5);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { container, act, cleanup } = await render(h(Harness), seen('reply', 4));
    t.after(cleanup);
    const input = container.querySelector('[role=textbox]');
    const send = container.querySelector('button[aria-label="Send to the discussion"]');
    assert.equal(send.disabled, true);
    await act(async () =>
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(calls.length, 0);
    await act(async () => {
        input.textContent = 'Theo, both benefit.';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(send.disabled, false);
    await act(async () =>
        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            }),
        ),
    );
    assert.equal(calls.length, 0, 'Shift+Enter does not send');
    await act(async () =>
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, 'Theo, both benefit.');
    assert.equal(container.querySelector('section').getAttribute('aria-busy'), 'true');
    assert.equal(input.textContent, '');
    assert.equal(input.getAttribute('contenteditable'), 'false');
    assert.equal(send.disabled, true);
    const learner = container.querySelector('[data-speaker=learner]');
    assert.ok(learner.textContent.includes('Theo, both benefit.'));
    assert.ok(!learner.querySelector('.discussion-card__name,.discussion-card__avatar'));
    assert.equal(container.querySelector('[role=status]').textContent, 'Discussion continuing…');
    const savedLines = [
        ...publicDiscussion.lines,
        { speaker: 'Learner', text: 'Theo, both benefit.' },
        { speaker: 'Theo', text: 'Now I see' },
    ];
    await act(async () =>
        publish({
            ...initial,
            discussion: {
                ...publicDiscussion,
                lines: savedLines,
                turn: { start: 5, status: 'streaming' },
            },
        }),
    );
    assert.equal(
        container.querySelectorAll('[data-speaker=learner]').length,
        1,
        'server checkpoint replaces the optimistic line',
    );
    assert.equal(
        container.querySelector('.discussion-card__busy[role=status]').textContent,
        'Theo is typing…',
        'a line still being written waits in the indicator',
    );
    assert.ok(!container.querySelector('ol').textContent.includes('Now I'));
    await act(async () => {
        publish({
            ...initial,
            error: 'Fixture timed out.',
            discussion: {
                ...publicDiscussion,
                lines: savedLines,
                turn: { start: 5, status: 'failed' },
            },
        });
        done.resolve();
        await done.promise;
    });
    assert.equal(container.querySelector('section').hasAttribute('aria-busy'), false);
    assert.equal(input.getAttribute('contenteditable'), 'true');
    assert.equal(container.querySelector('ol').children.length, savedLines.length - 1);
    await act(async () => t.mock.timers.tick(linePause('Now I see')));
    assert.equal(container.querySelector('ol').children.length, savedLines.length);
    assert.equal(
        container.querySelector('ol > li:last-child .discussion-card__text').textContent,
        'Now I see',
    );
    assert.equal(
        container.querySelector('[role=alert]').textContent,
        'The discussion could not continue: Fixture timed out. Send your reply again to retry.',
    );
});

test('pending and unavailable discussions stay in place without reply or retry controls', async (t) => {
    for (const status of ['pending', 'failed']) {
        const { container, cleanup } = await render(
            h(DiscussionCard, { artifact: { id: status, status } }),
            ui,
        );
        const card = container.querySelector('section');
        assert.equal(card.dataset.artifact, status);
        assert.ok(!card.querySelector('textarea, button, ol'));
        if (status === 'pending') {
            assert.equal(card.querySelector('[role=status]').textContent, 'Starting a discussion…');
            assert.equal(card.querySelectorAll('.astryx-skeleton').length, 3);
        } else {
            assert.match(card.textContent, /Discussion unavailable/);
            assert.ok(
                card.textContent.includes(
                    "The tutor's discussion could not be read. Ask for it again in the conversation.",
                ),
            );
        }
        await cleanup();
    }
});

test('pauses grow with line length, stay about 1 to 4 seconds and vary slightly', () => {
    const short = linePause('Hm?', 0.5),
        long = linePause('a'.repeat(120), 0.5);
    assert.ok(short >= 1000 && short < long && long <= 4000, `${short} ${long}`);
    assert.equal(linePause('a'.repeat(2000), 0.5), 4000);
    assert.ok(linePause('Hm?', 0) < short && short < linePause('Hm?', 1));
    assert.ok(linePause('Hm?', 0) >= 900 && linePause('a'.repeat(2000), 1) <= 4400);
});

test('opening lines arrive whole, one at a time behind a typing indicator, and remounting resumes the pace', async (t) => {
    t.mock.method(Math, 'random', () => 0.5);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const artifact = {
            id: 'paced',
            kind: 'discussion',
            status: 'ready',
            discussion: publicDiscussion,
        },
        calls = [];
    let show;
    function Harness() {
        const [open, setOpen] = useState(true);
        show = setOpen;
        return open
            ? h(DiscussionCard, { artifact, onReply: async (a, text) => calls.push(text) })
            : null;
    }
    const { container, act, cleanup } = await render(h(Harness), ui);
    t.after(cleanup);
    const shown = () =>
        [...container.querySelectorAll('ol > li')].map(
            (li) =>
                li.querySelector('.discussion-card__name').textContent +
                ': ' +
                li.querySelector('.discussion-card__text').textContent,
        );
    const status = () =>
        container.querySelector('.discussion-card__busy[role=status]')?.textContent;
    const hint = () => container.querySelector('.discussion-card__hint')?.textContent;
    const send = () => container.querySelector('button[aria-label="Send to the discussion"]');
    const input = () => container.querySelector('[role=textbox]');
    const [first, second, third, fourth] = publicDiscussion.lines;
    assert.deepEqual(shown(), []);
    assert.equal(status(), 'Theo is typing…');
    assert.equal(hint(), 'You can send once every line has appeared.');
    assert.equal(input().getAttribute('contenteditable'), 'true', 'typing stays available');
    await act(async () => typeInto(input(), 'Maybe both win?'));
    assert.equal(send().disabled, true);
    await act(async () => enter(input()));
    assert.equal(calls.length, 0, 'Enter does not send while lines arrive');
    assert.equal(input().textContent, 'Maybe both win?', 'the draft is kept');
    await act(async () => t.mock.timers.tick(linePause(first.text) - 1));
    assert.deepEqual(shown(), []);
    await act(async () => t.mock.timers.tick(1));
    assert.deepEqual(shown(), ['Theo: ' + first.text], 'the whole line appears at once');
    assert.equal(status(), 'Maya is typing…');
    await act(async () => t.mock.timers.tick(linePause(second.text)));
    assert.equal(shown().length, 2);
    assert.equal(localStorage.getItem('rabbithole.discussion-seen.paced'), '2');
    await act(async () => show(false));
    await act(async () => show(true));
    assert.equal(shown().length, 2, 'seen lines show at once on return');
    assert.equal(status(), 'Jun is typing…');
    await act(async () => t.mock.timers.tick(linePause(third.text) - 1));
    assert.equal(shown().length, 2);
    await act(async () => t.mock.timers.tick(1));
    await act(async () => t.mock.timers.tick(linePause(fourth.text)));
    assert.equal(shown().length, 4);
    assert.ok(!status() && !hint());
    await act(async () => typeInto(input(), 'Maybe both win?'));
    assert.equal(send().disabled, false);
    await act(async () => enter(input()));
    assert.deepEqual(calls, ['Maybe both win?']);
});

test('closing a discussion mid-way shows every remaining line at once', async (t) => {
    t.mock.method(Math, 'random', () => 0.5);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const artifact = {
        id: 'closing',
        kind: 'discussion',
        status: 'ready',
        discussion: publicDiscussion,
    };
    let publish;
    function Harness() {
        const [current, setCurrent] = useState(artifact);
        publish = setCurrent;
        return h(DiscussionCard, { artifact: current });
    }
    const { container, act, cleanup } = await render(h(Harness), ui);
    t.after(cleanup);
    await act(async () => t.mock.timers.tick(linePause(publicDiscussion.lines[0].text)));
    assert.equal(container.querySelectorAll('ol > li').length, 1);
    await act(async () =>
        publish({ ...artifact, discussion: { ...publicDiscussion, closed: true } }),
    );
    assert.equal(container.querySelectorAll('ol > li').length, publicDiscussion.lines.length);
    assert.ok(!container.querySelector('.discussion-card__busy,[role=textbox]'));
});
