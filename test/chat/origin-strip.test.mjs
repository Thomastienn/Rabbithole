import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
const { default: OriginStrip } = await import('../../src/chat/OriginStrip.tsx');

const base = { parent: 'p', messageId: 'm1', question: 'Why?', snapshot: '' };
async function strip(t, branch, question = 'Why does it bend so far?') {
    const opened = [];
    const r = await render(
        h(OriginStrip, {
            branch: { ...base, ...branch },
            question,
            parentAddress: '1.2',
            parentTitle: 'Light bending',
            openParent: (s) => opened.push(s),
        }),
    );
    t.after(r.cleanup);
    const section = r.container.querySelector('section.origin-strip');
    const buttons = () => [...section.querySelectorAll('button')];
    return { ...r, section, buttons, opened };
}

test('passage source: accessible origin, chip opens the parent at the passage', async (t) => {
    const { section, buttons, opened, act } = await strip(t, {
        start: 4,
        end: 14,
        text: 'refraction',
    });
    assert.ok(section.getAttribute('aria-label'), 'named for assistive tech');
    assert.equal(section.querySelector('.origin-source').textContent, 'refraction');
    assert.equal(section.querySelector('.origin-question').textContent, 'Why does it bend so far?');
    const [chip] = buttons();
    assert.equal(buttons().length, 1, 'short source has no Show all');
    assert.equal(chip.textContent, '1.2 · Light bending');
    assert.equal(
        section.querySelector('.origin-line').textContent,
        'From 1.2 · Light bending at refraction',
    );
    assert.equal(section.querySelector('.origin-ring').getAttribute('aria-hidden'), 'true');
    assert.equal(chip.getAttribute('aria-label'), 'Open 1.2 Light bending at the source');
    await act(async () => chip.click());
    assert.deepEqual(opened, [{ messageId: 'm1', start: 4, end: 14, text: 'refraction' }]);
});

test('suggested term shows the term with no kind label', async (t) => {
    const { section } = await strip(t, { start: 0, end: 5, text: 'Snell' });
    assert.equal(section.querySelector('.origin-source').textContent, 'Snell');
});

test('visual source shows the visual title and jumps to the visual part', async (t) => {
    const { section, buttons, opened, act } = await strip(t, {
        start: null,
        end: null,
        text: 'Visual: Prism dispersion\nWhite light splits\nPart: Red ray\nBends least',
        artifactId: 'a1',
        label: 'Red ray',
        explanation: 'Bends least',
    });
    assert.equal(section.querySelector('.origin-source').textContent, 'Prism dispersion');
    await act(async () => buttons()[0].click());
    assert.deepEqual(opened, [
        {
            messageId: 'm1',
            text: 'Visual: Prism dispersion\nWhite light splits\nPart: Red ray\nBends least',
            artifactId: 'a1',
            label: 'Red ray',
            explanation: 'Bends least',
        },
    ]);
});

test('the address chip of a picked part returns to its trail and stored step', async (t) => {
    const trail = ['Prism', 'Red ray'],
        text = 'Visual: Prism dispersion\nWhite light splits\nPart: Prism › Red ray';
    const part = { artifactId: 'a1', label: 'Red ray', explanation: 'White light splits' };
    const { buttons, opened, act } = await strip(t, {
        start: null,
        end: null,
        text,
        ...part,
        trail,
        step: 2,
    });
    await act(async () => buttons()[0].click());
    assert.deepEqual(opened, [{ messageId: 'm1', text, ...part, trail, step: 2 }]);
});

test('long source clamps behind a toggle; the question is never clamped', async (t) => {
    const longQuestion = 'And what about '.repeat(30);
    const { section, buttons, act } = await strip(
        t,
        { start: 0, end: 300, text: 'light '.repeat(50) },
        longQuestion,
    );
    const source = section.querySelector('.origin-source');
    const toggle = buttons().find((b) => b.getAttribute('aria-controls') === source.id);
    assert.ok(source.hasAttribute('data-clamped'));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), source.id);
    const question = section.querySelector('.origin-question');
    assert.equal(question.textContent, longQuestion);
    assert.ok(!question.hasAttribute('data-clamped'));
    await act(async () => toggle.click());
    assert.ok(!source.hasAttribute('data-clamped'));
    assert.equal(buttons()[1].getAttribute('aria-expanded'), 'true');
});

test('unavailable passage says so and still shows the question', async (t) => {
    const { section } = await strip(t, { start: null, end: null, text: '  ' });
    const source = section.querySelector('.origin-source').textContent;
    assert.ok(source.trim(), 'says the passage is unavailable');
    assert.equal(section.querySelector('.origin-question').textContent, 'Why does it bend so far?');
});

test('the question shows on the origin line only when the thread has none', async (t) => {
    const { section } = await strip(t, { start: 0, end: 5, text: 'Snell' }, '');
    assert.ok(!section.querySelector('.origin-question'));
});

test('a free branch says it was asked on the side and its chip opens the parent', async (t) => {
    const { section, buttons, opened, act } = await strip(t, { start: null, end: null, text: '' });
    assert.ok(!section.querySelector('.origin-source'), 'no passage');
    assert.match(
        section.querySelector('.origin-line').textContent,
        /^Asked on the side of .*, after its latest reply$/,
    );
    await act(async () => buttons()[0].click());
    assert.deepEqual(opened, [undefined]);
});
