import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { parse } from '../../src/markdown/markdownText.ts';
import { renderMarkdown, rawOffsets } from '../../src/markdown/markdown.ts';

test('multiline dollar math closes before following prose and preserves source offsets', () => {
  const raw = String.raw`$$P=\begin{bmatrix}\mathbf p_1&\cdots&\mathbf p_n\end{bmatrix},
\qquad
D=\operatorname{diag}(\lambda_1,\ldots,\lambda_n),$$

then $AP=PD$ says

$$A\mathbf p_i=\lambda_i\mathbf p_i\quad\text{for each }i.$$

## The spectral theorem

For a **real** matrix $A$,

$$\boxed{A^T=A\quad\Longleftrightarrow\quad
A\text{ is orthogonally diagonalizable}.}$$

The proof follows.`;
  assert.ok(parse(raw).children.some((n) => n.type === 'heading'));
  const doc = new JSDOM(renderToStaticMarkup(renderMarkdown(raw))).window.document;
  assert.equal(doc.querySelector('h4')?.textContent, 'The spectral theorem');
  assert.equal(doc.querySelectorAll('math[display="block"]').length, 3);
  assert.equal(doc.querySelectorAll('math[display="inline"]').length, 2);
  for (const math of doc.querySelectorAll('math')) {
    const source = raw.slice(+math.getAttribute('data-o'), +math.getAttribute('data-e'));
    assert.match(source, /^\$/);
    assert.ok(!math.textContent.includes('The proof follows'));
    const range = doc.createRange();
    range.selectNodeContents(math);
    assert.deepEqual(rawOffsets(doc.body, range), {
      start: +math.getAttribute('data-o'),
      end: +math.getAttribute('data-e'),
    });
  }
  assert.equal(doc.querySelector('strong')?.textContent, 'real');
  assert.ok(doc.body.textContent.endsWith('The proof follows.'));
});

test('display dollars handle blank lines and containers without changing code or escaped dollars', () => {
  for (const raw of [
    '$$A=B\n\n+C$$\n\n## After',
    '$$\nA=B\n\n+C\n$$\n\n## After',
    '> $$A=B\n> +C$$\n\n## After',
    '- $$A=B\n  +C$$\n\n## After',
    'Before $$A=B\n+C$$ after.\n\n## After',
  ]) {
    const doc = new JSDOM(renderToStaticMarkup(renderMarkdown(raw))).window.document;
    assert.equal(doc.querySelectorAll('math[display="block"]').length, 1, raw);
    assert.equal(doc.querySelector('h4')?.textContent, 'After', raw);
    assert.ok(!doc.querySelector('math').textContent.includes('After'), raw);
  }
  const raw = '`$$x$$`\n\n```tex\n$$y$$\n```\n\n\\$\\$z\\$\\$ and $x$';
  const doc = new JSDOM(renderToStaticMarkup(renderMarkdown(raw))).window.document;
  assert.equal(doc.querySelectorAll('math').length, 1);
  assert.match(doc.body.textContent, /\$\$z\$\$/);
});
