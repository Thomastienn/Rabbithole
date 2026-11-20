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

// Drag from the nth text node whose text is `from` to the nth whose text is `to`, like a mouse over rendered symbols.
function drag(raw, [from, fi = 0], [to, ti = 0]) {
    const doc = new JSDOM(renderToStaticMarkup(renderMarkdown(raw))).window.document;
    const texts = [],
        walker = doc.createTreeWalker(doc.body, 4);
    for (let n; (n = walker.nextNode());) texts.push(n);
    const find = (t, i) => texts.filter((n) => n.textContent.trim() === t)[i];
    const range = doc.createRange();
    range.setStart(find(from, fi), 0);
    range.setEnd(find(to, ti), find(to, ti).length);
    const span = rawOffsets(doc.body, range);
    return span && raw.slice(span.start, span.end);
}

test('a drag inside a formula asks about the LaTeX of just the selected symbols', () => {
    assert.equal(drag('So $E = mc^2$ holds.', ['m'], ['2']), 'mc^2');
    assert.equal(drag('So $E = mc^2$ holds.', ['c'], ['c']), 'c');
    assert.equal(drag('$$x = \\frac{a+b}{c}$$', ['a'], ['b']), 'a+b');
});

test('a selection that cuts through a fraction, root or script widens to the whole term', () => {
    assert.equal(drag('So $E = mc^2$ holds.', ['m'], ['c']), 'mc^2');
    const frac = '$$x = \\frac{a+b}{c} + 1$$';
    assert.equal(drag(frac, ['b'], ['c']), '\\frac{a+b}{c}');
    assert.equal(drag(frac, ['='], ['a']), '= \\frac{a+b}{c}');
    assert.equal(drag('$y = \\sqrt[3]{x+1}$', ['x'], ['3']), '\\sqrt[3]{x+1}');
    assert.equal(drag('$\\sum_{i=1}^n \\alpha_i$', ['∑'], ['∑']), '\\sum');
    assert.equal(drag('$\\sum_{i=1}^n \\alpha_i$', ['∑'], ['i']), '\\sum_{i=1}^n');
    assert.equal(drag("$f'(x) = \\mathbf{p}_1$", ['f'], ['f']), 'f');
    assert.equal(drag("$f'(x) = \\mathbf{p}_1$", ['f'], ['(']), "f'(");
    assert.equal(drag("$f'(x) = \\mathbf{p}_1$", ['p'], ['p']), '\\mathbf{p}');
    assert.equal(drag("$f'(x) = \\mathbf{p}_1$", ['p'], ['1']), '\\mathbf{p}_1');
    assert.equal(drag('$\\left( a + b \\right) c$', ['('], ['a']), '\\left( a + b \\right)');
    assert.equal(drag('$x = 12.5 + y$', ['12.5'], ['+']), '12.5 +');
    assert.equal(drag('$\\sin x + \\text{for } y$', ['sin'], ['sin']), '\\sin');
    assert.equal(drag('$\\sin x + \\text{for } y$', ['for'], ['y']), '\\text{for } y');
});

test('symbols KaTeX builds from macros or primes map to their source, never to a narrower one', () => {
    const list = '$a_1, \\dots, a_n \\in \\R$';
    assert.equal(drag(list, ['…'], ['…']), '\\dots');
    assert.equal(drag(list, ['R'], ['R']), '\\R');
    assert.equal(drag('$x = 2 \\implies y$', ['⟹'], ['⟹']), '\\implies');
    assert.equal(drag("$f'(x)$", ['′'], ['′']), "f'");
    const row = '$$\\begin{aligned} a &\\implies b \\\\ &= c \\end{aligned}$$';
    assert.equal(drag(row, ['⟹'], ['⟹']), '\\implies');
    assert.equal(drag('$a - b \\cdot c$', ['a'], ['b']), 'a - b');
    assert.equal(drag('$\\color{red}{x} + y$', ['x'], ['+']), '{x} +');
    // KaTeX folds the 1 into the 2 of 12^2; that list keeps no symbol offsets, so the formula is asked about whole.
    assert.equal(drag('$12^2 + 3$', ['12'], ['12']), '$12^2 + 3$');
});

test('one row of an aligned derivation can be selected on its own', () => {
    const raw = 'Then\n\n$$\\begin{aligned} a &= b+1 \\\\ &= c \\end{aligned}$$\n\nso.';
    assert.equal(drag(raw, ['=', 1], ['c']), '= c');
    assert.equal(drag(raw, ['a'], ['1']), 'a &= b+1');
    assert.equal(drag(raw, ['a'], ['=']), 'a &= b+1');
    assert.equal(drag(raw, ['b'], ['c']), 'a &= b+1 \\\\ &= c');
});

test('a selection from a sentence into a formula widens only its formula end', () => {
    const raw = 'Then $E = mc^2$ holds.';
    assert.equal(drag(raw, ['Then'], ['m']), 'Then $E = m');
    assert.equal(drag(raw, ['Then'], ['c']), 'Then $E = mc^2$');
    assert.equal(drag(raw, ['c'], ['holds.']), 'c^2$ holds.');
    assert.equal(drag(raw, ['Then'], ['holds.']), raw);
});

test('a branch from part of a formula underlines just that part; one from a whole formula, the formula', () => {
    const raw = 'So $E = mc^2$ holds.',
        part = { start: raw.indexOf('mc^2'), end: raw.indexOf('mc^2') + 4 },
        whole = { start: raw.indexOf('$'), end: raw.lastIndexOf('$') + 1 };
    const underline = (u) =>
        new JSDOM(renderToStaticMarkup(renderMarkdown(raw, undefined, [u]))).window.document;
    let doc = underline({ ...part, child: 'c1', address: '1.2', ink: 2 });
    const pieces = [...doc.querySelectorAll('math .suggestion.explored')];
    assert.deepEqual(
        pieces.map((p) => p.textContent),
        ['m', 'c2'],
    );
    assert.ok(pieces.every((p) => p.getAttribute('style').includes('--ink')));
    assert.deepEqual(
        [...doc.querySelectorAll('[tabindex="0"]')].map((p) => [
            p.textContent,
            p.getAttribute('role'),
            p.getAttribute('aria-label'),
        ]),
        [['m', 'button', 'Explored passage: mc^2. Opens its chat, 1.2']],
    );
    assert.equal(doc.querySelector('math + .passage-address')?.textContent, '1.2');
    doc = underline({ ...whole, child: 'c0', address: '1.1' });
    const formula = doc.querySelector('math');
    assert.equal(formula.getAttribute('class'), 'suggestion explored');
    assert.equal(formula.getAttribute('tabindex'), '0');
    assert.equal(doc.querySelectorAll('math .suggestion').length, 0);
    doc = underline(part);
    assert.equal(doc.querySelectorAll('math .suggestion:not(.explored)').length, 2);
});
