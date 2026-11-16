import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { visualMarkup, renderVisual, stockPiece } from '../../src/media/visualMarkup.ts';

test('partial sanitizer keeps incomplete HTML/SVG but strips scripts, handlers and unsafe resources', () => {
  const document = JSDOM.fragment('').ownerDocument;
  for (const source of [
    '<div onclick="run()"><svg onload="run()"><text>Building',
    '<p>Building</p><script>window.ran = true',
    '<p>Building</p><script src="/app.js"></script><iframe srcdoc="<script>run()</script>"></iframe>',
    '<p style="background:url(/api/state)">Building</p><style>@import "/app.css";</style>',
    '<svg><use href="/api/state"/><rect fill="url(https://example.test)"/><text>Building</text></svg>',
    '<template><script>run()</script><img src="/api/state"></template><p>Building',
    '<div ONMOUSEOVER="run()"><a href="javascript:run()">Bad</a>Building</div>',
  ]) {
    const sanitized = visualMarkup(source, document);
    assert.match(sanitized, /Building/);
    assert.doesNotMatch(
      sanitized,
      /script|iframe|template|\bon\w+=|\bsrc\w*=|\bhref=|url\(|@import/i,
    );
    assert.equal(visualMarkup(sanitized, document), sanitized, 'reparsing stays safe');
  }
  const local =
    '<svg><defs><filter id="ink"></filter></defs><rect filter="url(#ink)"></rect></svg>';
  assert.equal(visualMarkup(local, document), local);
  const source = '<p onclick="run()">Ready</p><script>run()</script><img src="/api/state">';
  assert.equal(
    visualMarkup(source, document, true),
    '<p onclick="run()">Ready</p><script>run()</script>',
    'final markup uses the same resource filter, with scripts and handlers enabled',
  );
});

test('partial DOM writes are inert; final replacement executes complete scripts in order', () => {
  const dom = new JSDOM('<div id="visual"></div>', { runScripts: 'dangerously' });
  try {
    const root = dom.window.document.getElementById('visual');
    renderVisual(root, '<p>Partial</p><script>window.runs = 99</script>', false);
    assert.equal(root.textContent, 'Partial');
    assert.equal(dom.window.runs, undefined);
    renderVisual(root, '<svg onload="window.runs = 99"><text>Growing', false);
    assert.equal(root.textContent, 'Growing');
    assert.equal(root.querySelector('[onload]'), null);
    renderVisual(
      root,
      '<button onclick="window.runs++">Final</button>' +
        '<script>window.runs = 1</script><script>window.runs++</script>',
      true,
    );
    assert.equal(root.querySelector('p, svg'), null, 'final replaces all partial nodes');
    assert.equal(dom.window.runs, 2);
    root.querySelector('button').click();
    assert.equal(dom.window.runs, 3);
  } finally {
    dom.window.close();
  }
});

test('stockPiece returns a fresh SVG element from delivered data and names a missing ID in words', () => {
  const { window } = new JSDOM('<div id="visual"></div>');
  const document = window.document,
    pieces = {
      'fluent-emoji:horse':
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32z"/></svg>',
    };
  const horse = stockPiece(document, pieces, 'fluent-emoji:horse');
  assert.equal(horse.localName, 'svg');
  assert.equal(horse.ownerDocument, document);
  assert.ok(horse instanceof window.SVGSVGElement);
  assert.equal(horse.querySelector('path').getAttribute('d'), 'M0 0h32v32z');
  assert.notEqual(
    stockPiece(document, pieces, 'fluent-emoji:horse'),
    horse,
    'each call is a new element',
  );
  for (const id of ['fluent-emoji:unicorn', 'toString'])
    assert.equal(stockPiece(document, pieces, id).textContent, `Stock piece ${id} is missing`);
  assert.equal(
    stockPiece(document, { bad: '<svg><g></svg>' }, 'bad').textContent,
    'Stock piece bad is missing',
  );
});
