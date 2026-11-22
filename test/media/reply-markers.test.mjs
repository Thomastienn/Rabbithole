import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { diagramReply } from '../../server/media/reply-parser.mjs';
import { renderMarkdown } from '../../src/markdown/markdown.ts';

const call = `<tool_call>${JSON.stringify({ name: 'show_visual', arguments: { title: 'T' } })}</tool_call>`;

test('a visual marker leaves the text and records its place in the stripped text', () => {
    const out = diagramReply('Fission splits atoms.\n\n[[visual: fission-chain]]\n\nHeat follows.');
    assert.equal(out.text, 'Fission splits atoms.\n\n\n\nHeat follows.');
    assert.deepEqual(out.markers, [{ kind: 'visual', value: 'fission-chain', position: 23 }]);
    // A plain marker keeps its words without the brackets.
    const term = diagramReply('Splitting [[fission]] frees heat.');
    assert.equal(term.text, 'Splitting fission frees heat.');
    assert.deepEqual(term.markers, [{ kind: null, value: 'fission', position: 10 }]);
});

test('a marker split across stream chunks never shows', () => {
    const raw = 'Atoms split. [[visual: chain]] Then [[heat]] flows.\n[[visual: end]]';
    const done = diagramReply(raw, true);
    assert.equal(done.text, 'Atoms split.  Then heat flows.\n');
    for (let i = 1; i <= raw.length; i++) {
        const partial = diagramReply(raw.slice(0, i)).text;
        assert.ok(done.text.startsWith(partial), JSON.stringify(partial));
        assert.doesNotMatch(partial, /\[|\]|visual/);
    }
});

test('an unclosed marker at the end of its line stays as plain text without its brackets', () => {
    assert.equal(diagramReply('See [[fission\nMore.').text, 'See fission\nMore.');
    assert.deepEqual(diagramReply('See [[fission\nMore.').markers, []);
    // At the end of the reply it waits while streaming and stays as text once the reply ends.
    assert.equal(diagramReply('See [[fission').text, 'See ');
    assert.equal(diagramReply('See [[fission', true).text, 'See fission');
});

test('an unclosed visual marker is removed whole, so none of its check shows', () => {
    const raw =
        'See [[visual: x | shows: S | check: secret [1] answer\nMore. [[Visual: y | check: tail';
    const done = diagramReply(raw, true);
    assert.equal(done.text, 'See \nMore. ');
    assert.deepEqual(done.markers, [
        { kind: 'visual', value: '', closed: false, position: 4 },
        { kind: 'visual', value: '', closed: false, position: 11 },
    ]);
    for (let i = 1; i <= raw.length; i++)
        assert.doesNotMatch(diagramReply(raw.slice(0, i)).text, /secret|answer|tail|\[/);
    // A single bracket inside a closed visual marker stays inside it.
    const closed = diagramReply('A [[visual: x | shows: f [n] | check: no]] B', true);
    assert.equal(closed.text, 'A  B');
    assert.equal(closed.markers[0].value, 'x | shows: f [n] | check: no');
});

test('[[ inside code or math stays as written', () => {
    const raw =
        'Use `a[[0]]` and $[[x]]$ or \\([[y]]\\).\n\n```\nm = [[1, 2]]\n```\n\n$$\n[[z]]\n$$\n\nA [[1, 2], [3, 4]] list.';
    const out = diagramReply(raw, true);
    assert.equal(out.text, raw);
    assert.deepEqual(out.markers, []);
    // A code block still streaming is code too.
    assert.equal(diagramReply('```\nm = [[1').text, '```\nm = [[1');
});

test('positions of markers and tool calls agree with the stripped text', () => {
    const after = diagramReply(`Intro.\n${call}\n[[visual: x]] After.`, true);
    assert.equal(after.text, 'Intro.\n\n After.');
    assert.equal(after.calls[0].position, 7);
    assert.equal(after.markers[0].position, 8);
    const before = diagramReply(`[[visual: x]]Intro.\n${call}\nAfter.`, true);
    assert.equal(before.text, 'Intro.\n\nAfter.');
    assert.deepEqual([before.markers[0].position, before.calls[0].position], [0, 7]);
});

test('a visual marker inside :::wide shows the visual at full width, inside :::figure beside its text', () => {
    const shown = (raw) => {
        const out = diagramReply(raw, true),
            slots = out.markers.map((m) => ({
                at: m.position,
                kind: 'visual',
                node: h('figure', { key: m.value, id: m.value }),
            }));
        const markup = renderToStaticMarkup(
            h('div', null, renderMarkdown(out.text, undefined, [], slots)),
        );
        return new JSDOM(markup).window.document;
    };
    assert.ok(
        shown('Intro.\n\n:::wide\n[[visual: loop]]\n:::').querySelector('.layout-wide #loop'),
    );
    const figure = shown(':::figure{side=right}\n[[visual: loop]]\nThe loop runs twice.\n:::');
    assert.ok(figure.querySelector('.layout-figure .layout-media #loop'));
    assert.equal(
        figure.querySelector('.layout-figure .layout-text').textContent,
        'The loop runs twice.',
    );
});
