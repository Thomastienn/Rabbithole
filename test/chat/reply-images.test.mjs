import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
import { renderMarkdown, rawOffsets, rawRange } from '../../src/markdown/markdown.ts';
import { imageSources } from '../../src/markdown/ReplyImage.tsx';
const { default: Reply } = await import('../../src/chat/Reply.tsx');

const tool = (output) => ({
    id: 't',
    name: 'find_images',
    input: { query: 'heap' },
    status: 'done',
    elapsed: 1,
    output: JSON.stringify(output),
});
const result = {
    imageUrl: 'https://images.example.org/heap.png',
    sourceUrl: 'https://example.org/heap',
};

test('Markdown images and references render safely with links and preserve raw passage offsets', () => {
    const raw =
        'Before 😀 ![Heap](https://images.example.org/heap.png) after.\n\n[![Linked](https://example.org/x.png)](https://example.org/source)\n\n![Reference][pic]\n\n[pic]: https://example.org/ref.png\n\n![Unsafe](javascript:alert(1))';
    const doc = new JSDOM(
        renderToStaticMarkup(
            h(
                'div',
                { id: 'reply' },
                renderMarkdown(raw, undefined, [], [], imageSources([tool({ results: [result] })])),
            ),
        ),
    ).window.document;
    const root = doc.getElementById('reply'),
        images = [...root.querySelectorAll('img')];
    assert.equal(images.length, 3);
    assert.equal(images[0].alt, 'Heap');
    assert.equal(images[0].getAttribute('loading'), 'lazy');
    assert.equal(images[0].getAttribute('referrerPolicy'), 'no-referrer');
    assert.equal(images[0].closest('a').href, result.sourceUrl);
    assert.equal(root.querySelector('.image-source').href, result.sourceUrl);
    assert.equal(images[1].closest('a').href, 'https://example.org/source');
    assert.equal(root.querySelector('a a'), null, 'linked images never nest anchors');
    assert.match(root.textContent, /Unsafe/);
    assert.equal(root.querySelector('[src^="javascript:"]'), null);
    const start = raw.indexOf('after.'),
        end = start + 6;
    assert.deepEqual(rawOffsets(root, rawRange(root, start, end)), { start, end });
    const reveal = new JSDOM(
        renderToStaticMarkup(
            renderMarkdown(raw, { start: raw.indexOf('!['), end: raw.indexOf(')') + 1 }),
        ),
    ).window.document;
    assert.ok(reveal.querySelector('mark'), 'saved image-syntax anchors remain revealable');
});

test('source extraction ignores failed/malformed outputs and unsafe image or source URLs', () => {
    const sources = imageSources([
        tool({
            results: [
                result,
                null,
                { imageUrl: 'data:x', sourceUrl: 'https://ok.test' },
                { imageUrl: 'https://ok.test/x', sourceUrl: 'javascript:x' },
            ],
        }),
        { ...tool({ results: [result] }), status: 'failed' },
        { ...tool({}), output: 'not JSON' },
        tool({ results: {} }),
    ]);
    assert.deepEqual(sources, { [result.imageUrl]: { source: result.sourceUrl } });
});

test('Reply credits a saved find_images result and replaces a dead image without losing its source', async (t) => {
    const { container, act, cleanup } = await render(
        h(Reply, {
            text: '![Binary heap](https://images.example.org/heap.png)',
            underlines: [],
            tools: [tool({ results: [result] })],
        }),
        ui,
    );
    t.after(cleanup);
    assert.equal(container.querySelector('img').closest('a').href, result.sourceUrl);
    await act(async () => container.querySelector('img').dispatchEvent(new Event('error')));
    assert.equal(container.querySelector('img'), null);
    assert.match(
        container.querySelector('[role=status]').textContent,
        /Image is no longer available\. Binary heap/,
    );
    assert.equal(container.querySelector('.image-source').href, result.sourceUrl);
});

test('an empty-alt Markdown image still gives its image link an accessible name', async (t) => {
    const { container, cleanup } = await render(
        h('div', null, renderMarkdown('![](https://example.org/picture.png)')),
        ui,
    );
    t.after(cleanup);
    assert.equal(
        container.querySelector('img').closest('a').getAttribute('aria-label'),
        'Open image source',
    );
});

test('an image found with find_images credits its resource and the credit jumps to the Resources entry', async (t) => {
    const { container, act, cleanup } = await render(
        h(
            'div',
            null,
            h(
                'ol',
                null,
                h('li', { id: 'resource-4' }, h('a', { href: result.sourceUrl }, 'Heap')),
            ),
            h(Reply, {
                text: '![Binary heap](https://images.example.org/heap.png)',
                underlines: [],
                tools: [tool({ results: [{ resource: 4, ...result }] })],
            }),
        ),
        ui,
    );
    t.after(cleanup);
    const credit = container.querySelector('.image-source');
    assert.equal(credit.getAttribute('href'), '#resource-4');
    assert.equal(credit.textContent, 'Source 4');
    assert.equal(container.querySelector('img').closest('a').href, result.sourceUrl);
    const entry = container.querySelector('#resource-4');
    entry.scrollIntoView = () => {};
    await act(async () => credit.click());
    assert.equal(container.ownerDocument.activeElement, entry.querySelector('a'));
});
