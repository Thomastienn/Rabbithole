import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { renderMarkdown, rawOffsets } from '../../src/markdown/markdown.ts';
import { loadLanguage } from '../../src/markdown/codeTokens.ts';

const dom = (markup) => new JSDOM(`<section id="r">${markup}</section>`).window.document;
const select = (doc, from, to) => {
  const code = doc.querySelector('pre code'),
    w = doc.createTreeWalker(code, 4),
    nodes = [];
  for (let n; (n = w.nextNode());) nodes.push(n);
  const at = (t) => nodes.find((n) => n.textContent.includes(t)),
    r = doc.createRange();
  r.setStart(at(from), at(from).textContent.indexOf(from));
  r.setEnd(at(to), at(to).textContent.indexOf(to) + to.length);
  return rawOffsets(doc.getElementById('r'), r);
};

test('fences colour with theme token classes once their grammar loads; plain labels stay plain', async () => {
  const fences = {
    java: 'public class A {\n  String s = "x"; // note\n}',
    csharp: 'var n = 42; // c#',
    python: 'def f(x):\n    return "a"  # c',
  };
  const md = (lang, code) => `Code:\n\n\`\`\`${lang}\n${code}\n\`\`\``;
  const tokens = (markup) =>
    [...dom(markup).querySelectorAll('pre [class*="astryx-token-"]')].map((e) => [
      e.textContent,
      e.className.match(/astryx-token-(\w+)/)[1],
    ]);
  // Before the grammar loads the fence renders plain; the load completes for the next render.
  assert.deepEqual(tokens(renderToStaticMarkup(renderMarkdown(md('java', fences.java)))), []);
  await Promise.all(Object.keys(fences).map(loadLanguage));
  const coloured = Object.fromEntries(
    Object.entries(fences).map(([lang, code]) => [
      lang,
      Object.fromEntries(tokens(renderToStaticMarkup(renderMarkdown(md(lang, code))))),
    ]),
  );
  assert.deepEqual(
    [coloured.java.public, coloured.java.String, coloured.java['"x"'], coloured.java['// note']],
    ['keyword', 'type', 'string', 'comment'],
  );
  assert.deepEqual(
    [coloured.csharp.var, coloured.csharp['42'], coloured.csharp['// c#']],
    ['keyword', 'number', 'comment'],
  );
  assert.deepEqual(
    [coloured.python.def, coloured.python.f, coloured.python['# c']],
    ['keyword', 'function', 'comment'],
  );
  for (const lang of ['', 'text', 'plaintext']) {
    await loadLanguage(lang);
    assert.deepEqual(tokens(renderToStaticMarkup(renderMarkdown(md(lang, fences.java)))), [], lang);
  }

  // Coloured spans keep raw offsets, so the code text is exact and passages inside it still branch.
  const raw = md('java', fences.java),
    doc = dom(renderToStaticMarkup(h('div', null, renderMarkdown(raw))));
  assert.equal(doc.querySelector('pre code').textContent, fences.java);
  assert.equal(
    raw.slice(...Object.values(select(doc, 'class', '"x'))),
    'class A {\n  String s = "x',
  );
});
