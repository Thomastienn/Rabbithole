import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('wide shows exactly one linked or reference image at full reply width with its source', () => {
  for (const image of [
    `![A cat](${cat})`,
    `[![A cat](${cat})](https://cats.example/page)`,
    `![A cat][cat]\n\n[cat]: ${cat}`,
  ]) {
    const source = `:::wide\n${image}\n:::`,
      d = shown(source, undefined, [], [], sources),
      wide = d.querySelector('.layout-wide');
    assert.ok(wide, image);
    assert.equal(wide.querySelectorAll('img').length, 1);
    assert.equal(wide.querySelector('img').getAttribute('src'), cat);
    assert.equal(wide.querySelector('a').getAttribute('href'), 'https://cats.example/page');
    const style = d.createElement('style');
    style.textContent = readFileSync(
      new URL('../../src/markdown/layouts.css', import.meta.url),
      'utf8',
    );
    d.head.append(style);
    assert.equal(d.defaultView.getComputedStyle(wide.querySelector('.layout-media')).width, '100%');
    assert.equal(d.defaultView.getComputedStyle(wide.querySelector('img')).width, '100%');
    assert.equal(d.defaultView.getComputedStyle(wide.querySelector('img')).maxHeight, 'none');
    d.defaultView.close();
  }
});

test('wide claims one visual once and leaves outside media in plain flow', () => {
  const source = 'Before.\n\n:::wide\n\n:::\n\nAfter.',
    at = source.lastIndexOf('\n:::') + 1,
    visual = h(
      'figure',
      { key: 'inside', className: 'visual', id: 'inside' },
      'Visual description',
    );
  for (const flow of [false, true]) {
    const d = shown(
      source,
      undefined,
      [],
      [
        {
          at: source.indexOf('Before.'),
          kind: 'visual',
          node: h('figure', { key: 'before', id: 'before' }),
        },
        { at, kind: 'visual', node: visual },
        {
          at: source.indexOf('After.'),
          kind: 'visual',
          node: h('figure', { key: 'after', id: 'after' }),
        },
      ],
      {},
      flow,
    );
    assert.equal(d.querySelectorAll('#inside').length, 1);
    assert.equal(d.querySelectorAll('.layout-wide #inside').length, flow ? 0 : 1);
    assert.equal(d.querySelector('#before').closest('.reply-layout'), null);
    assert.equal(d.querySelector('#after').closest('.reply-layout'), null);
  }
});

test('bad wide shapes preserve all text, images and unclaimed media in plain flow', () => {
  const empty = ':::wide\n\n:::';
  const image = `![A cat](${cat})`;
  for (const [source, kinds] of [
    [empty, []],
    [':::wide\nProse.\n:::', []],
    [`:::wide\n${image}\n\nExplanation.\n:::`, []],
    [`:::wide\n${image}\n${image}\n:::`, []],
    [empty, ['visual', 'visual']],
    [`:::wide\n${image}\n\n:::`, ['visual']],
    [empty, ['video']],
    [empty, ['discussion']],
  ]) {
    const slots = kinds.map((kind, i) => ({
        at: source.lastIndexOf('\n:::') + 1,
        kind,
        node: h('figure', { key: `m${i}`, id: `m${i}` }, kind),
      })),
      d = shown(source, undefined, [], slots),
      flow = shown(source, undefined, [], slots, {}, true);
    assert.equal(d.querySelector('.reply-layout'), null, source);
    assert.equal(d.getElementById('r').textContent, flow.getElementById('r').textContent);
    assert.equal(d.querySelectorAll('img').length, flow.querySelectorAll('img').length);
    assert.equal(d.querySelectorAll('figure').length, kinds.length);
  }
});

test('Reply places its visual in wide and restores it across the narrow fallback', async (t) => {
  const source = ':::wide\n\n:::',
    artifact = {
      id: 'v1',
      kind: 'visual',
      title: 'A loop',
      description: 'A loop runs twice.',
      status: 'ready',
      position: source.lastIndexOf('\n:::') + 1,
    };
  let width = 700,
    resize;
  const { container, act, cleanup } = await render(
    h(Reply, { text: source, underlines: [], inlineArtifacts: [artifact] }),
    (w) => {
      ui(w);
      w.ResizeObserver = class {
        constructor(fn) {
          resize = fn;
        }
        observe() {}
        disconnect() {}
      };
      Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => width });
    },
  );
  t.after(cleanup);
  assert.equal(container.querySelectorAll('.layout-wide .visual').length, 1);
  width = 479;
  await act(async () => resize());
  assert.equal(container.querySelector('.reply-layout'), null);
  assert.equal(container.querySelectorAll('.visual').length, 1);
  width = 480;
  await act(async () => resize());
  assert.equal(container.querySelectorAll('.layout-wide .visual').length, 1);
});

test('figure puts its image beside the text and gallery grids images with their source links', () => {
  const d = shown(raw, undefined, [], [], sources);
  const figure = d.querySelector('.layout-figure');
  assert.deepEqual(
    [...figure.children].map((el) => el.className),
    ['layout-media', 'layout-text'],
  );
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

test('a right-side figure puts its explanation before its media and preserves raw passages', () => {
  const source = raw.replace(':::figure', ':::figure{side=right}');
  const d = shown(source, undefined, [], [], sources);
  const figure = d.querySelector('.layout-figure');
  assert.deepEqual(
    [...figure.children].map((el) => el.className),
    ['layout-text', 'layout-media'],
  );
  assert.equal(figure.querySelector('.layout-media img').getAttribute('src'), cat);
  assert.equal(figure.querySelector('.image-source').textContent, 'Source 2');
  const text = [...figure.querySelectorAll('[data-o]')].find(
    (el) => el.textContent === 'retractable',
  ).firstChild;
  const range = d.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 7);
  const span = rawOffsets(d.getElementById('r'), range);
  assert.equal(source.slice(span.start, span.end), 'retract');
});

test('wide figures give media twice the text width on either side; other ratios stay equal', () => {
  const css = readFileSync(new URL('../../src/markdown/layouts.css', import.meta.url), 'utf8');
  for (const [options, columns, order] of [
    ['', 'minmax(0, 1fr) minmax(0, 1fr)', ['layout-media', 'layout-text']],
    ['{side=left}', 'minmax(0, 1fr) minmax(0, 1fr)', ['layout-media', 'layout-text']],
    ['{side=right}', 'minmax(0, 1fr) minmax(0, 1fr)', ['layout-text', 'layout-media']],
    ['{ratio=wide}', 'minmax(0, 2fr) minmax(0, 1fr)', ['layout-media', 'layout-text']],
    ['{side=left ratio=wide}', 'minmax(0, 2fr) minmax(0, 1fr)', ['layout-media', 'layout-text']],
    ['{side=right ratio=wide}', 'minmax(0, 1fr) minmax(0, 2fr)', ['layout-text', 'layout-media']],
    ['{side=above ratio=huge}', 'minmax(0, 1fr) minmax(0, 1fr)', ['layout-media', 'layout-text']],
  ]) {
    const d = shown(raw.replace(':::figure', `:::figure${options}`));
    const style = d.createElement('style');
    style.textContent = css;
    d.head.append(style);
    const figure = d.querySelector('.layout-figure');
    assert.equal(d.defaultView.getComputedStyle(figure).gridTemplateColumns, columns, options);
    assert.deepEqual(
      [...figure.children].map((el) => el.className),
      order,
      options,
    );
    d.defaultView.close();
  }
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

test('visuals placed inside a right-side wide figure or gallery join its media; others stay in the flow', () => {
  const source =
    ':::figure{side=right ratio=wide}\nThe loop runs twice.\n\n:::\n\nAfter.\n\n:::gallery\n\n:::';
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
  assert.equal(d.querySelector('.layout-figure').firstElementChild.className, 'layout-text');
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

for (const options of ['', '{side=right}', '{ratio=wide}', '{side=right ratio=wide}'])
  test(`Reply keeps images and narrow plain flow for figure${options}`, async (t) => {
    const source = raw.replace(':::figure', `:::figure${options}`);
    let width = 700,
      resize;
    const { container, act, cleanup } = await render(
      h(Reply, { text: source, underlines: [] }),
      (w) => {
        ui(w);
        w.ResizeObserver = class {
          constructor(fn) {
            resize = fn;
          }
          observe() {}
          disconnect() {}
        };
        Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get: () => width });
      },
    );
    t.after(cleanup);
    assert.equal(container.querySelectorAll('.reply-layout').length, 2);
    const img = container.querySelector('.layout-gallery img');
    await act(async () => img.dispatchEvent(new img.ownerDocument.defaultView.Event('error')));
    assert.equal(
      container.querySelector('.layout-gallery .image-unavailable').textContent,
      'Image is no longer available. A cat',
    );
    width = 479;
    await act(async () => resize());
    assert.equal(container.querySelector('.reply-layout'), null);
    assert.equal(container.querySelectorAll('img').length, 3);
    assert.match(container.textContent, /Cats have retractable claws\./);
    assert.equal(container.querySelector('[data-side], [data-ratio]'), null);
    assert.equal(previewText(source, 'assistant'), previewText(raw, 'assistant'));
    width = 480;
    await act(async () => resize());
    assert.equal(container.querySelectorAll('.reply-layout').length, 2);
    assert.equal(
      container.querySelector('.layout-figure').firstElementChild.className,
      options.includes('side=right') ? 'layout-text' : 'layout-media',
    );
  });
