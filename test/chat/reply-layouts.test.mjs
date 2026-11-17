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

const raw = [
  'Intro line.',
  '',
  ':::comparison',
  'Both move *packets* 😀.',
  '',
  '### TCP',
  'Reliable and ordered.',
  '',
  '### UDP',
  'Fast, no **retries**.',
  ':::',
  '',
  ':::steps',
  '## Boil water',
  'Heat to 100 \\* C.',
  '',
  '## Steep',
  'Wait `3` minutes.',
  ':::',
].join('\n');

const doc = (markup) => new JSDOM(`<section id="r">${markup}</section>`).window.document;
const shown = (...args) => doc(renderToStaticMarkup(h('div', null, renderMarkdown(...args))));
const additions = [
  ':::callout',
  '### Key idea',
  'Keep the *same* elements 😀.',
  ':::',
  '',
  ':::timeline',
  'In order.',
  '',
  '### 1843',
  'First **notes**.',
  '',
  '### 1936',
  'A formal model.',
  ':::',
  '',
  ':::wide',
  '![A diagram](https://img.example/diagram.png)',
  ':::',
].join('\n');

test('callout is a labelled region and timeline is an ordered list with one heading per entry', () => {
  const d = shown(additions);
  const callout = d.querySelector('.layout-callout');
  assert.equal(callout.getAttribute('role'), 'region');
  assert.ok(callout.getAttribute('aria-label'), 'named for assistive tech');
  assert.equal(callout.textContent, 'Key ideaKeep the same elements 😀.');
  assert.equal(
    shown(':::callout\nA takeaway.\n:::').querySelector('[role="region"]').textContent,
    'A takeaway.',
  );
  const entries = [...d.querySelectorAll('.layout-timeline ol > li')];
  assert.deepEqual(
    entries.map((el) => el.firstElementChild.textContent),
    ['1843', '1936'],
  );
  assert.deepEqual(
    entries.map((el) => el.querySelectorAll('h3,h4,h5,h6').length),
    [1, 1],
  );
  assert.equal(d.querySelector('.layout-timeline > p').textContent, 'In order.');
  for (const el of d.querySelectorAll('.reply-layout [data-o]:not([data-x])'))
    assert.equal(additions.slice(+el.dataset.o, +el.dataset.e), el.textContent);
  for (const word of ['same', 'notes']) {
    const at = additions.indexOf(word),
      marked = shown(additions, { start: at, end: at + word.length });
    assert.equal(marked.querySelector('mark').textContent, word);
    const text = [...d.querySelectorAll('[data-o]')].find(
      (el) => el.textContent === word,
    ).firstChild;
    const range = d.createRange();
    range.selectNodeContents(text);
    const span = rawOffsets(d.getElementById('r'), range);
    assert.equal(additions.slice(span.start, span.end), word);
  }
  assert.equal(
    previewText(additions, 'assistant'),
    previewText(additions.replace(/^:::.*$/gm, ''), 'assistant'),
  );
});

test('empty callouts and malformed timelines stay plain flow', () => {
  for (const source of [
    ':::callout\n:::',
    ':::callout\n[hidden]: https://example.org\n:::',
    ':::timeline\nOnly prose.\n:::',
    ':::timeline\n### Only\nOne entry.\n:::',
    ':::timeline\n### First\nOne.\n#### Second\nTwo.\n### Third\nThree.\n:::',
  ]) {
    const d = shown(source);
    assert.equal(d.querySelector('.reply-layout'), null, source);
    assert.equal(
      d.getElementById('r').textContent,
      shown(source.replace(/^:::.*$/gm, '')).getElementById('r').textContent,
    );
  }
});

test('nested directives fall back to plain flow, including directives inside blockquotes', () => {
  for (const source of [
    '::::callout\n### Key\n:::timeline\n### First\nOne.\n### Next\nTwo.\n:::\n::::',
    '::::timeline\n### First\n:::callout\nKey idea.\n:::\n### Next\nTwo.\n::::',
    '::::comparison\n### First\n> :::callout\n> Key idea.\n> :::\n### Next\nTwo.\n::::',
    '::::wide\n:::wide\n![A diagram](https://img.example/diagram.png)\n:::\n::::',
  ]) {
    const d = shown(source);
    assert.equal(d.querySelector('.reply-layout'), null, source);
    assert.equal(
      d.getElementById('r').textContent,
      shown(source, undefined, [], [], {}, true).getElementById('r').textContent,
    );
  }
});

test('comparison and steps render titled cards and every text leaf keeps its raw offsets', () => {
  const d = shown(raw);
  const columns = [...d.querySelectorAll('.layout-comparison .layout-card')];
  assert.deepEqual(
    columns.map((c) => c.querySelector('h3,h4,h5,h6').textContent),
    ['TCP', 'UDP'],
  );
  assert.match(d.querySelector('.layout-comparison').textContent, /^Both move packets/);
  const steps = [...d.querySelectorAll('.layout-steps ol.layout-cards > li.layout-card')];
  assert.deepEqual(
    steps.map((s) => s.firstElementChild.textContent),
    ['Boil water', 'Steep'],
  );
  for (const el of d.querySelectorAll('.reply-layout [data-o]:not([data-x])'))
    assert.equal(raw.slice(+el.dataset.o, +el.dataset.e), el.textContent);
  assert.equal(d.querySelector('.layout-steps [data-x]').textContent, '*');
});

test('a selection inside a layout card maps to the exact raw passage, and suggestions underline it', () => {
  const d = shown(raw);
  const text = [...d.querySelectorAll('.layout-card [data-o]')].find(
    (el) => el.textContent === 'Reliable and ordered.',
  ).firstChild;
  const range = d.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 8);
  const span = rawOffsets(d.getElementById('r'), range);
  assert.equal(raw.slice(span.start, span.end), 'Reliable');

  const start = raw.indexOf('no **retries**');
  const under = shown(raw, undefined, [{ start, end: start + 14 }]);
  assert.equal(
    under.querySelector('.layout-comparison u.suggestion[tabindex="0"]').getAttribute('aria-label'),
    'Suggested passage: no retries',
  );
  const reveal = raw.indexOf('Steep');
  assert.equal(
    shown(raw, { start: reveal, end: reveal + 5 }).querySelector('.layout-steps mark').textContent,
    'Steep',
  );
});

test('unknown directives, wrong shapes and flow mode render plain flow without losing text', () => {
  const unknown = ':::note\n### Title\nBody\n\n### More\nText\n:::';
  const four = ':::comparison\n### A\na\n### B\nb\n### C\nc\n### D\nd\n:::';
  const single = ':::steps\n### Only\nstep\n:::';
  for (const source of [unknown, four, single]) {
    const d = shown(source);
    assert.equal(d.querySelector('.reply-layout'), null, source);
    assert.ok(d.querySelector('h5'), source);
  }
  const flow = shown(raw, undefined, [], [], {}, true);
  assert.equal(flow.querySelector('.reply-layout'), null);
  assert.match(flow.getElementById('r').textContent, /TCPReliable and ordered\.UDP/);
  // Text and leaf directive forms stay prose.
  assert.equal(
    shown('Use a:b and\n::before here.').getElementById('r').textContent,
    'Use a:b and\n::before here.',
  );
});

test('conversation node previews strip layouts to plain text', () => {
  assert.equal(
    previewText(raw, 'assistant'),
    'Intro line. Both move packets 😀. TCP Reliable and ordered. UDP Fast, no retries. Boil water Heat to 100 * C. Steep Wait 3 minutes.',
  );
});

test('Reply falls back to plain flow under the width threshold and restores the layout when wide', async (t) => {
  const source = raw + '\n\n' + additions;
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
  assert.equal(container.querySelectorAll('.reply-layout').length, 5);
  width = 479;
  await act(async () => resize());
  assert.equal(container.querySelector('.reply-layout'), null);
  assert.match(container.textContent, /Reliable and ordered\./);
  assert.match(container.textContent, /Key ideaKeep the same elements 😀\./);
  assert.equal(container.querySelectorAll('img').length, 1);
  assert.equal(container.querySelector('[role="region"]'), null);
  width = 480;
  await act(async () => resize());
  assert.equal(container.querySelectorAll('.reply-layout').length, 5);
});
