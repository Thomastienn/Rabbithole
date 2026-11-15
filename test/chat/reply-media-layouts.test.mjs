import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
import { renderMarkdown, rawOffsets } from '../../src/markdown/markdown.ts';
import { previewText } from '../../src/markdown/markdownText.ts';
const { default: Reply } = await import('../../src/chat/Reply.tsx');

const cat = 'https://img.example/cat.png',
  dog = 'https://img.example/dog.png';
const raw = [
  ':::figure',
  `![A cat](${cat})`,
  '',
  'Cats have *retractable* claws.',
  ':::',
  '',
  ':::gallery',
  'Two pets side by side.',
  '',
  `![A cat](${cat})`,
  `[![A dog](${dog})](https://dogs.example/page)`,
  ':::',
].join('\n');
const sources = { [cat]: { source: 'https://cats.example/page', resource: 2 } };
const doc = (markup) => new JSDOM(`<section id="r">${markup}</section>`).window.document;
const shown = (...args) => doc(renderToStaticMarkup(h('div', null, renderMarkdown(...args))));

test('figure puts its image beside the text and gallery grids images with their source links', () => {
  const d = shown(raw, undefined, [], [], sources);
  const figure = d.querySelector('.layout-figure');
  assert.equal(figure.querySelector('.layout-media img').getAttribute('src'), cat);
  assert.equal(figure.querySelector('.layout-media .image-source').textContent, 'Source 2');
  assert.equal(figure.querySelector('.layout-text').textContent, 'Cats have retractable claws.');
  const gallery = d.querySelector('.layout-gallery');
  assert.match(gallery.firstElementChild.textContent, /^Two pets side by side\.$/);
  const items = [...gallery.querySelectorAll('.layout-media > .layout-item')];
  assert.deepEqual(
    items.map((i) => i.querySelector('img').getAttribute('alt')),
    ['A cat', 'A dog'],
  );
  assert.equal(items[1].querySelector('a').getAttribute('href'), 'https://dogs.example/page');
  for (const el of d.querySelectorAll('.reply-layout [data-o]:not([data-x])'))
    assert.equal(raw.slice(+el.dataset.o, +el.dataset.e), el.textContent);
  for (const el of d.querySelectorAll('.layout-item > [data-x]'))
    assert.match(raw.slice(+el.dataset.o, +el.dataset.e), /^!\[A (cat|dog)\]/);
});

test('a selection in figure text maps to the exact raw passage and reveals mark it', () => {
  const d = shown(raw);
  const text = [...d.querySelectorAll('.layout-text [data-o]')].find(
    (el) => el.textContent === 'retractable',
  ).firstChild;
  const range = d.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 7);
  const span = rawOffsets(d.getElementById('r'), range);
  assert.equal(raw.slice(span.start, span.end), 'retract');
  const at = raw.indexOf('Two pets');
  assert.equal(
    shown(raw, { start: at, end: at + 8 }).querySelector('.layout-gallery mark').textContent,
    'Two pets',
  );
});

test('visuals placed inside a figure or gallery join its media; others stay in the flow', () => {
  const source = ':::figure\nThe loop runs twice.\n\n:::\n\nAfter.\n\n:::gallery\n\n:::';
  const inFigure = source.indexOf('\n\n:::') + 1,
    inGallery = source.lastIndexOf('\n:::'),
    after = source.indexOf('After.');
  const slot = (id) => h('figure', { className: 'visual', id });
  const d = shown(
    source,
    undefined,
    [],
    [
      { at: inFigure, node: slot('v1') },
      { at: after, node: slot('v2') },
      { at: inGallery, node: slot('v3') },
      { at: inGallery, node: slot('v4') },
    ],
  );
  assert.ok(d.querySelector('.layout-figure .layout-media #v1'));
  assert.equal(d.querySelector('.layout-figure .layout-text').textContent, 'The loop runs twice.');
  assert.equal(d.querySelector('#v2').closest('.reply-layout'), null);
  assert.equal(d.querySelectorAll('.layout-gallery .layout-item .visual').length, 2);
});

test('wrong shapes and flow mode render plain flow; previews show plain text', () => {
  for (const source of [
    ':::figure\nOnly text.\n:::',
    `:::figure\n![A cat](${cat})\n:::`,
    `:::gallery\n![A cat](${cat})\n\nOne image.\n:::`,
  ]) {
    const d = shown(source);
    assert.equal(d.querySelector('.reply-layout'), null, source);
  }
  const flow = shown(raw, undefined, [], [], {}, true);
  assert.equal(flow.querySelector('.reply-layout'), null);
  assert.equal(flow.querySelectorAll('img').length, 3);
  assert.equal(
    previewText(raw, 'assistant'),
    previewText(raw.replace(/^:::.*$/gm, ''), 'assistant'),
  );
});

test('Reply shows the dead-image placeholder inside a gallery and falls back to plain flow when narrow', async (t) => {
  let width = 700,
    resize;
  const { container, act, cleanup } = await render(h(Reply, { text: raw, underlines: [] }), (w) => {
    ui(w);
    w.ResizeObserver = class {
      constructor(fn) {
        resize = fn;
      }
      observe() {}
      disconnect() {}
    };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => width });
  });
  t.after(cleanup);
  assert.equal(container.querySelectorAll('.reply-layout').length, 2);
  const img = container.querySelector('.layout-gallery img');
  await act(async () => img.dispatchEvent(new img.ownerDocument.defaultView.Event('error')));
  assert.equal(
    container.querySelector('.layout-gallery .image-unavailable').textContent,
    'Image is no longer available. A cat',
  );
  width = 320;
  await act(async () => resize());
  assert.equal(container.querySelector('.reply-layout'), null);
  assert.equal(container.querySelectorAll('img').length, 3);
  assert.match(container.textContent, /Cats have retractable claws\./);
});
