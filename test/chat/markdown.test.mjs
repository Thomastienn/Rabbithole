import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { renderMarkdown, rawOffsets, rawRange, plainText } from '../../src/markdown/markdown.ts';
import { parse } from '../../src/markdown/markdownText.ts';

const raw = [
    '## Plan **bold** heading',
    '',
    'Say *same* and *same* again 😀 then `x = 1` ok.',
    '',
    '- first item',
    '- second **item**',
    '',
    '| a | b |',
    '|---|---|',
    '| cell 😀 | `c` |',
    '',
    'Inline $x^2$ math and <b>raw</b> html \\* escaped.',
    '',
    'Bracket \\(a+b\\) inline and \\[c^2\\] shown.',
    '',
    '$$',
    'y = mx',
    '$$',
    '',
    '```js',
    'const a = 1;',
    'let b = 2;',
    '```',
    '',
    '[site](https://example.com) and [bad](javascript:alert(1))',
].join('\n');

const dom = (markup) => new JSDOM(`<section id="r">${markup}</section>`).window.document;
const textNodes = (doc) => {
    const w = doc.createTreeWalker(doc.getElementById('r'), 4),
        out = [];
    let n;
    while ((n = w.nextNode())) out.push(n);
    return out;
};
// Select from the nth occurrence of `from` (char offset a) to the nth occurrence of `to` (char offset b).
function select(doc, [from, fi, a], [to, ti, b]) {
    const nodes = textNodes(doc),
        find = (t, i) => nodes.filter((n) => n.textContent.includes(t))[i];
    const r = doc.createRange(),
        x = find(from, fi),
        y = find(to, ti);
    r.setStart(x, x.textContent.indexOf(from) + a);
    r.setEnd(y, y.textContent.indexOf(to) + b);
    return rawOffsets(doc.getElementById('r'), r);
}

test('rendered Markdown selections map to exact raw slices the branches endpoint accepts', async () => {
    const doc = dom(renderToStaticMarkup(h('div', null, renderMarkdown(raw))));
    const body = doc.getElementById('r');
    assert.ok(
        textNodes(doc).every((n) => n.parentElement.closest('[data-o]')),
        'every rendered text node resolves to source markers',
    );
    assert.equal(body.querySelector('h4')?.textContent, 'Plan bold heading');
    assert.ok(
        body.querySelector('table th') &&
            body.querySelector('ul li strong') &&
            body.querySelector('math') &&
            body.querySelector('pre'),
    );
    assert.match(body.textContent, /<b>raw<\/b>/, 'raw HTML shows as text');
    assert.equal(body.querySelector('b'), null);
    const links = [...body.querySelectorAll('a')];
    assert.deepEqual(
        links.map((a) => [a.getAttribute('href'), a.target, a.rel]),
        [['https://example.com', '_blank', 'noopener noreferrer']],
    );
    assert.match(body.textContent, /bad/);

    const slice = (s) => raw.slice(s.start, s.end);
    const cases = [
        [
            select(doc, ['same', 1, 0], ['same', 1, 4]),
            'same',
            raw.indexOf('same', raw.indexOf('same') + 1),
        ], // repeated phrase inside emphasis
        [select(doc, ['Say ', 0, 4], ['again', 0, 5]), 'same* and *same* again'], // crosses hidden emphasis syntax
        [select(doc, ['again 😀', 0, 6], ['again 😀', 0, 8]), '😀'],
        [select(doc, ['x = 1', 0, 0], ['x = 1', 0, 5]), 'x = 1'],
        [select(doc, ['first', 0, 0], ['item', 1, 4]), 'first item\n- second **item'], // across list items
        [select(doc, ['cell', 0, 0], ['cell 😀', 0, 7]), 'cell 😀'],
        [select(doc, ['Inline', 0, 7], ['math', 0, 4]), '$x^2$ math'], // starts inside atomic math
        [select(doc, ['Bracket', 0, 3], ['inline', 0, 6]), 'cket \\(a+b\\) inline'], // across bracket inline math
        [select(doc, ['inline and', 0, 7], ['shown', 0, 2]), 'and \\[c^2\\] sh'], // across bracket display math
        [select(doc, ['*', 0, 0], ['escaped', 0, 7]), '\\* escaped'], // decoded escape covers its source token
        [select(doc, ['const', 0, 2], ['let', 0, 3]), 'nst a = 1;\nlet'], // across highlighted code lines
    ];
    for (const [span, text, start] of cases) {
        assert.ok(span, text);
        assert.equal(slice(span), text);
        if (start !== undefined) assert.equal(span.start, start);
    }

    const path = join(mkdtempSync(join(tmpdir(), 'tt-md-')), 'trees.sqlite');
    const store = new Store(path);
    const app = createApp({
        store,
        auth: { status: () => ({ connected: true }) },
        provider: {
            generate: async (_t, _p, emit) => {
                emit({ type: 'item', item: 'a', text: 'Context summary.' });
                emit({ type: 'status', status: 'completed' });
            },
        },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    try {
        const origin = `http://127.0.0.1:${app.server.address().port}`;
        const state = await fetch(`${origin}/api/state`);
        assert.match(state.headers.get('Content-Security-Policy'), /script-src 'self';/);
        assert.doesNotMatch(
            state.headers.get('Content-Security-Policy').match(/script-src[^;]*/)[0],
            /unsafe-/,
        );
        const { csrf } = await state.json();
        const parent = store.create('Markdown', 'codex');
        const messageId = store.message(parent.id, 'assistant', raw, 'completed');
        for (const [span] of cases) {
            const res = await fetch(`${origin}/api/trees/${parent.id}/branches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
                body: JSON.stringify({ messageId, ...span, text: slice(span), question: 'Why?' }),
            });
            assert.equal(res.status, 201, slice(span));
            const child = await res.json();
            const restored = await (await fetch(`${origin}/api/trees/${child.id}`)).json();
            assert.deepEqual(
                [
                    restored.branch.messageId,
                    restored.branch.start,
                    restored.branch.end,
                    restored.branch.text,
                ],
                [messageId, span.start, span.end, slice(span)],
            );
        }
    } finally {
        app.stop();
        store.close();
    }
});

test('saved anchors, old and new, reveal at their raw offsets inside formatting and code', () => {
    for (const [text, start, end] of [
        ['repeat 😀 repeat 😀 end', 10, 19],
        [raw, raw.indexOf('same* again'), raw.indexOf('1;\nlet') + 2],
        [raw, raw.indexOf('b = 2'), raw.indexOf('b = 2') + 5],
    ]) {
        const body = dom(
            renderToStaticMarkup(h('div', null, renderMarkdown(text, { start, end }))),
        ).getElementById('r');
        const marks = [...body.querySelectorAll('mark')];
        const covered = [...body.querySelectorAll('mark, [data-reveal]')].map((m) => [
            +m.getAttribute('data-o'),
            +m.getAttribute('data-e'),
        ]);
        assert.ok(covered.length);
        assert.ok(
            Math.min(...covered.map((c) => c[0])) <= start &&
                Math.max(...covered.map((c) => c[1])) >= end,
        );
        for (const m of marks)
            if (m.dataset.x === undefined)
                assert.equal(m.textContent, text.slice(+m.dataset.o, +m.dataset.e));
        if (text === raw && start === raw.indexOf('same* again'))
            assert.equal(marks[0].textContent, 'same');
    }
    // The first plain reply renders as the same single text, so pre-change anchors still slice exactly.
    const body = dom(
        renderToStaticMarkup(
            h('div', null, renderMarkdown('repeat 😀 repeat 😀 end', { start: 10, end: 19 })),
        ),
    ).getElementById('r');
    assert.equal(body.querySelector('mark').textContent, 'repeat 😀');
});

test('streaming partial Markdown keeps an unfinished fence as code; previews strip syntax', () => {
    const body = dom(
        renderToStaticMarkup(h('div', null, renderMarkdown('Intro\n\n```py\nprint(1)\n'))),
    ).getElementById('r');
    assert.match(body.querySelector('pre')?.textContent ?? '', /print\(1\)/);
    assert.equal(plainText('## Title\n\n- **bold** item\n- `code`'), 'Title bold item code');
});

test('code offsets cannot match the fence label and reveal only the saved characters', () => {
    const raw = '```js\njs\nconst js = 1;\n```';
    const doc = dom(renderToStaticMarkup(renderMarkdown(raw)));
    assert.deepEqual(select(doc, ['js', 0, 0], ['js', 0, 2]), { start: 6, end: 8 });
    const revealed = dom(renderToStaticMarkup(renderMarkdown(raw, { start: 11, end: 14 })));
    assert.equal([...revealed.querySelectorAll('mark')].map((m) => m.textContent).join(''), 'nst');
});

test('entities, escaped delimiters and nested continuation lines keep local offsets', () => {
    const raw = '> a &amp; amp\n> a &copy; copy and \\*same\\*';
    const doc = dom(renderToStaticMarkup(renderMarkdown(raw)));
    const span = select(doc, ['copy and', 0, 0], ['copy and', 0, 4]);
    assert.equal(span.start, raw.indexOf('copy and'));
    assert.equal(raw.slice(span.start, span.end), 'copy');
});

test('element boundaries, normalised newlines, escaped table code and old syntax-only anchors', () => {
    for (const [raw, rendered, expected] of [
        ['> echo\n> echo 😀', 'echo 😀', 'echo 😀'],
        ['Line\r\nNext 😀', 'Next 😀', 'Next 😀'],
        ['```js\r\n\r\njs\r\n```', 'js', 'js'],
        ['    code\n    code 😀', 'code 😀', 'code 😀'],
        ['    ```js\n    code\n    ```', 'code', 'code'],
        ['| a |\n|---|\n| `a\\|b` |', 'b', 'b'],
        ['`a\nb`', 'b', 'b'],
        ['x &copy; copy', 'copy', 'copy'],
    ]) {
        const doc = dom(renderToStaticMarkup(renderMarkdown(raw))),
            root = doc.getElementById('r');
        const matches = textNodes(doc).filter((n) => n.textContent.includes(rendered));
        const text = matches.at(-1),
            range = doc.createRange();
        range.setStart(text, text.textContent.indexOf(rendered));
        range.setEnd(text, text.textContent.indexOf(rendered) + rendered.length);
        const span = rawOffsets(root, range);
        assert.equal(raw.slice(span.start, span.end), expected, raw);
        assert.equal(span.start, raw.lastIndexOf(expected), raw);
    }
    const raw = 'one **two** three',
        doc = dom(renderToStaticMarkup(renderMarkdown(raw))),
        root = doc.getElementById('r');
    const range = doc.createRange(),
        strong = doc.querySelector('strong');
    range.selectNodeContents(strong);
    assert.deepEqual(rawOffsets(root, range), { start: 6, end: 9 });
    range.selectNode(strong);
    assert.deepEqual(rawOffsets(root, range), { start: 6, end: 9 });
    range.collapse();
    assert.equal(rawOffsets(root, range), undefined);
    for (const [raw, start, end] of [
        ['**bold**', 0, 2],
        ['```js\nx\n```', 0, 5],
        ['[site](https://example.com)', 7, 14],
    ]) {
        const doc = dom(renderToStaticMarkup(renderMarkdown(raw, { start, end })));
        assert.equal(
            [...doc.querySelectorAll('mark')].map((m) => m.textContent).join(''),
            raw.slice(start, end),
        );
    }
});

test('untrusted HTML, link and math input stays inert and readable', () => {
    const raw =
        '<img src=x onerror=alert(1)>\n\n[run](javascript:alert(1)) [data](data:text/html,hi) [ref][x]\n\n[x]: https://example.com\n\n$\\href{javascript:alert(1)}{bad}$ and $\\bad{$';
    const doc = dom(renderToStaticMarkup(renderMarkdown(raw)));
    assert.equal(doc.querySelectorAll('script, img, iframe, [onerror]').length, 0);
    assert.match(doc.body.textContent, /<img src=x onerror=alert\(1\)>/);
    assert.deepEqual(
        [...doc.querySelectorAll('a')].map((a) => [a.href, a.target, a.rel]),
        [['https://example.com/', '_blank', 'noopener noreferrer']],
    );
});

test('suggestion underlines cover exactly their raw passages, one Tab stop each, and keep selection offsets', () => {
    const passages = ['😀', 'x = 1', 'first item\n- second **item', 'nst a = 1;\nlet'];
    const first = raw.indexOf('same'),
        second = raw.indexOf('same', first + 1);
    const spans = [
        { start: second, end: second + 4 },
        ...passages.map((p) => ({ start: raw.indexOf(p), end: raw.indexOf(p) + p.length })),
    ];
    const body = dom(
        renderToStaticMarkup(h('div', null, renderMarkdown(raw, undefined, spans))),
    ).getElementById('r');
    const pieces = [...body.querySelectorAll('u.suggestion')];
    for (const span of spans) {
        const inside = pieces.filter((u) => +u.dataset.o >= span.start && +u.dataset.e <= span.end);
        // Pieces join back to the passage, minus only hidden syntax such as list markers and delimiters.
        assert.equal(Math.min(...inside.map((u) => +u.dataset.o)), span.start);
        assert.equal(Math.max(...inside.map((u) => +u.dataset.e)), span.end);
        for (const u of inside) assert.equal(u.textContent, raw.slice(+u.dataset.o, +u.dataset.e));
        assert.equal(
            inside.filter((u) => u.tabIndex === 0).length,
            1,
            'one Tab stop per underline',
        );
        assert.match(
            inside.find((u) => u.tabIndex === 0).getAttribute('aria-label'),
            /^Suggested passage: /,
        );
    }
    assert.equal(pieces.filter((u) => u.tabIndex === 0).length, spans.length);
    // The repeated phrase underlines its second occurrence only.
    assert.deepEqual(
        pieces.filter((u) => u.textContent === 'same').map((u) => +u.dataset.o),
        [second],
    );
    assert.equal(
        body.querySelector('[aria-label="Suggested passage: first item second **item"]')
            ?.textContent,
        'first item',
    );
    // Manual selection over underlined text still maps to the same raw slice.
    assert.equal(
        raw.slice(...Object.values(select(body.ownerDocument, ['x = 1', 0, 0], ['x = 1', 0, 5]))),
        'x = 1',
    );
    assert.equal(
        raw.slice(...Object.values(select(body.ownerDocument, ['😀', 0, 0], ['😀', 0, 2]))),
        '😀',
    );
});

test('an explored suggestion draws solid and names its existing chat', () => {
    const start = raw.indexOf('x = 1');
    const body = dom(
        renderToStaticMarkup(
            h(
                'div',
                null,
                renderMarkdown(raw, undefined, [{ start, end: start + 5, child: 'c1' }]),
            ),
        ),
    ).getElementById('r');
    const u = body.querySelector('u.suggestion');
    assert.ok(u.classList.contains('explored'));
    assert.equal(u.getAttribute('aria-label'), 'Explored passage: x = 1. Opens its chat');
});

test('an explored passage wears its family ink and ends in an address chip outside selection offsets', () => {
    const start = raw.indexOf('x = 1');
    const body = dom(
        renderToStaticMarkup(
            h(
                'div',
                null,
                renderMarkdown(raw, undefined, [
                    { start, end: start + 5, child: 'c1', address: '1.2', ink: 2 },
                ]),
            ),
        ),
    ).getElementById('r');
    const u = body.querySelector('u.suggestion');
    assert.match(u.getAttribute('style'), /--ink:var\(--rabbithole-ink-2\)/);
    assert.equal(u.getAttribute('aria-label'), 'Explored passage: x = 1. Opens its chat, 1.2');
    const chip = body.querySelectorAll('sup.passage-address');
    assert.equal(chip.length, 1);
    assert.equal(chip[0].textContent, '1.2');
    assert.equal(chip[0].getAttribute('aria-hidden'), 'true');
    const whole = (root) => {
        const r = root.ownerDocument.createRange();
        r.selectNodeContents(root);
        return rawOffsets(root, r);
    };
    assert.deepEqual(
        whole(body),
        whole(dom(renderToStaticMarkup(h('div', null, renderMarkdown(raw)))).getElementById('r')),
    );
    const chipOnly = body.ownerDocument.createRange();
    chipOnly.selectNodeContents(chip[0]);
    assert.equal(rawOffsets(body, chipOnly), undefined);
});

test('each code block carries a labelled copy button outside the raw-offset text', () => {
    const body = dom(
        renderToStaticMarkup(
            h('div', null, renderMarkdown('Run:\n\n```js\nconst a = 1;\n```\n\n```\nb\n```')),
        ),
    ).getElementById('r');
    const buttons = [...body.querySelectorAll('pre > button.code-copy, pre button.code-copy')];
    assert.equal(buttons.length, 2);
    assert.ok(
        buttons.every(
            (b) =>
                b.getAttribute('aria-label') === 'Copy code' &&
                !b.closest('[data-o]') &&
                !b.querySelector('[data-o]'),
        ),
    );
});

test('rawRange paints exactly the raw passage rawOffsets would capture', () => {
    const raw = 'Say *same* and **two words** then $x^2$ end.',
        doc = dom(renderToStaticMarkup(renderMarkdown(raw))),
        root = doc.getElementById('r');
    for (const text of ['same', 'and **two', 'words** then', 'two words']) {
        const start = raw.indexOf(text),
            range = rawRange(root, start, start + text.length);
        assert.deepEqual(rawOffsets(root, range), { start, end: start + text.length }, text);
    }
    const math = raw.indexOf('x^2');
    assert.deepEqual(
        rawOffsets(root, rawRange(root, math, math + 1)),
        { start: math, end: math + 1 },
        'a formula symbol is its own LaTeX',
    );
    assert.deepEqual(
        rawOffsets(root, rawRange(root, math, math + 3)),
        { start: math - 1, end: math + 4 },
        'every symbol of a formula is the whole formula',
    );
    assert.equal(rawRange(root, raw.length, raw.length + 3), undefined);
});

test('inline media slots sit between blocks at their recorded raw offsets, unplaced ones last', () => {
    const text = 'Intro paragraph.\n\nMiddle paragraph.\n\nClosing paragraph.';
    const slot = (at, id) => ({ at, node: h('figure', { key: id, id }) });
    const doc = dom(
        renderToStaticMarkup(
            renderMarkdown(
                text,
                undefined,
                [],
                [
                    slot(text.length + 10, 'late'),
                    slot(text.indexOf('Middle'), 'chart'),
                    slot(text.indexOf('Closing'), 'pending'),
                ],
            ),
        ),
    );
    assert.deepEqual(
        [...doc.getElementById('r').children].map((e) => e.id || e.textContent),
        ['Intro paragraph.', 'chart', 'Middle paragraph.', 'pending', 'Closing paragraph.', 'late'],
    );
});

test('LaTeX bracket delimiters parse as math with exact offsets; escaped and unclosed ones stay text', () => {
    const nodes = (text) => {
        const out = [];
        const walk = (n) => (
            n.type.toLowerCase().includes('math') && out.push(n),
            n.children?.forEach(walk)
        );
        walk(parse(text));
        return out.map((n) => [
            n.type,
            n.value,
            text.slice(n.position.start.offset, n.position.end.offset),
        ]);
    };
    assert.deepEqual(nodes('A \\(x^2\\) b'), [['inlineMath', 'x^2', '\\(x^2\\)']]);
    assert.deepEqual(nodes('> see \\[\n> y = mx\n> \\] ok'), [
        ['math', '\ny = mx\n', '\\[\n> y = mx\n> \\]'],
    ]);
    assert.deepEqual(nodes('- a \\(\\frac{1}{2} \\\\ c\\) d'), [
        ['inlineMath', '\\frac{1}{2} \\\\ c', '\\(\\frac{1}{2} \\\\ c\\)'],
    ]);
    assert.deepEqual(nodes('literal \\\\(no\\) and \\(open'), []);
    assert.equal(plainText('literal \\\\(no\\) and \\(open'), 'literal \\(no) and (open');
    assert.equal(plainText('`\\(code\\)`'), '\\(code\\)');

    const raw = 'Then \\[E = mc^2\\] and \\(p\\).';
    const body = dom(renderToStaticMarkup(h('div', null, renderMarkdown(raw)))).getElementById('r');
    const maths = [...body.querySelectorAll('math')];
    assert.deepEqual(
        maths.map((m) => [
            m.getAttribute('display'),
            raw.slice(+m.getAttribute('data-o'), +m.getAttribute('data-e')),
        ]),
        [
            ['block', '\\[E = mc^2\\]'],
            ['inline', '\\(p\\)'],
        ],
    );
});

test('resource links render as citation chips that keep raw offsets; bracketed prose stays text', () => {
    const raw = 'Heaps [3](resource:3), [5](resource:5), a[3], [x](resource:abc) and [4] here.';
    const links = { 3: 'https://example.com/3', 5: 'javascript:alert(1)' };
    const doc = new JSDOM(
        renderToStaticMarkup(
            h('div', null, renderMarkdown(raw, undefined, [], [], {}, false, links)),
        ),
    ).window.document;
    const chips = [...doc.querySelectorAll('.citation-chip')];
    assert.deepEqual(
        chips.map((a) => [
            a.getAttribute('href'),
            a.getAttribute('target'),
            a.getAttribute('rel'),
            a.getAttribute('aria-label'),
            a.textContent,
        ]),
        [
            ['https://example.com/3', '_blank', 'noopener noreferrer', 'Resource 3', '3'],
            [null, null, null, 'Resource 5', '5'],
        ],
    );
    const leaf = chips[0].querySelector('[data-o]');
    assert.equal(raw.slice(+leaf.dataset.o, +leaf.dataset.e), '3');
    assert.match(doc.body.textContent, /a\[3\], x and \[4\] here/);
});
