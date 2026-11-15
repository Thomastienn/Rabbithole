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
  width = 320;
  await act(async () => resize());
  assert.equal(container.querySelector('.reply-layout'), null);
  assert.match(container.textContent, /Reliable and ordered\./);
  width = 600;
  await act(async () => resize());
  assert.equal(container.querySelectorAll('.reply-layout').length, 2);
});
