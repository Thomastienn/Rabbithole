import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { passage } = await import('../support/passage.mjs');
const key = (node, key) =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const point = (node) => node.dispatchEvent(new window.Event('pointerover', { bubbles: true }));

test('pointing at or focusing a suggestion shows its saved brief explanation, a branched one its question and child reply start', async (t) => {
    const { container, act, update, branched, opened, underline } = await passage(t);
    const tip = () => container.querySelector('[role="tooltip"]');
    const term = { start: 10, end: 19, text: 'repeat 😀', concept: 'Repeat' };
    const ready = (p) => ({ message: 'reply', status: 'ready', passages: [{ ...term, ...p }] });
    await act(async () => update((v) => ({ ...v, suggestions: ready() })));
    // Unexplored without a saved one: nothing shows; the fixture has no explain call to make.
    await act(async () => point(underline()));
    await act(async () => underline().focus());
    assert.equal(tip(), null);
    await act(async () => underline().blur());

    const briefs = [{ message: 'reply', start: 10, end: 19, explanation: 'Do it again.' }];
    await act(async () => update((v) => ({ ...v, briefs })));
    await act(async () => point(underline()));
    assert.equal(tip().textContent, 'Do it again.');
    assert.equal(tip().children.length, 0, 'a saved plain one stays plain text');
    assert.equal(underline().getAttribute('aria-describedby'), null, 'pointer leaves focus alone');
    await act(async () => underline().focus());
    assert.equal(underline().getAttribute('aria-describedby'), tip().id);
    await act(async () => key(underline(), 'Escape'));
    assert.equal(tip(), null, 'Escape dismisses the popup');
    // Clicking still opens the textbox for an unexplored suggestion.
    await act(async () => underline().click());
    assert.equal(branched.at(-1)[0].suggestion, true);

    // Branched: the question over the child's first reply start; while the child has none, the brief, else only the question.
    const question = () => tip().querySelector('.tip-question').textContent;
    const child = { start: 10, end: 19, text: 'repeat 😀', child: 'child', question: 'Why?' };
    const repoint = async () => {
        await act(async () => point(underline().parentElement));
        await act(async () => point(underline()));
    };
    await act(async () =>
        update((v) => ({ ...v, suggestions: ready({ child: 'child' }), branched: [child] })),
    );
    await repoint();
    assert.equal(question(), 'Why?');
    assert.equal(tip().textContent, 'Why?Do it again.');
    await act(async () =>
        update((v) => ({ ...v, branched: [{ ...child, preview: 'Repeating means…' }] })),
    );
    await repoint();
    assert.equal(tip().textContent, 'Why?Repeating means…');
    await act(async () => update((v) => ({ ...v, briefs: [], branched: [child] })));
    await repoint();
    assert.equal(tip().textContent, 'Why?');
    await act(async () => underline().click());
    assert.deepEqual(opened, ['child'], 'clicking an explored one still opens its child');
});

test("pointing at a passage branched from a selection shows its question and the child's reply start", async (t) => {
    const { container, act, update, opened, underline } = await passage(t);
    await act(async () =>
        update((v) => ({
            ...v,
            branched: [
                {
                    start: 0,
                    end: 9,
                    text: 'repeat 😀',
                    child: 'mine',
                    question: 'What does repeat mean here?',
                    preview: 'It means running the same step again…',
                },
            ],
        })),
    );
    await act(async () => point(underline()));
    const tip = container.querySelector('[role="tooltip"]');
    assert.equal(tip.querySelector('.tip-question').textContent, 'What does repeat mean here?');
    assert.equal(
        tip.textContent,
        'What does repeat mean here?It means running the same step again…',
    );
    await act(async () => underline().click());
    assert.deepEqual(opened, ['mine']);
});

test('a brief explanation shows bold, italics, code and math inline, never headings, lists or links', async (t) => {
    const { container, act, update, underline } = await passage(t);
    const explanation =
        '# Loops\n\nTo **repeat** is to run *again*: `for` runs $n$ times.\n\n- once more\n\n[More](https://example.com)';
    await act(async () =>
        update((v) => ({
            ...v,
            suggestions: {
                message: 'reply',
                status: 'ready',
                passages: [{ start: 10, end: 19, text: 'repeat 😀', concept: 'Repeat' }],
            },
            briefs: [{ message: 'reply', start: 10, end: 19, explanation }],
        })),
    );
    await act(async () => point(underline()));
    const tip = container.querySelector('[role="tooltip"]');
    assert.equal(tip.querySelector('strong').textContent, 'repeat');
    assert.equal(tip.querySelector('em').textContent, 'again');
    assert.equal(tip.querySelector('code').textContent, 'for');
    assert.ok(tip.querySelector('math'), 'inline math renders as a formula');
    assert.equal(tip.querySelector('h1, h2, h3, h4, h5, h6, p, ul, ol, li, a'), null);
    assert.match(
        tip.textContent,
        /^Loops To repeat is to run again: for runs .+ times\. once more More$/,
    );
});
