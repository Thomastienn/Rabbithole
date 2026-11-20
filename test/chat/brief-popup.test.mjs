import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { passage } = await import('../support/passage.mjs');
const key = (node, key) =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const point = (node) => node.dispatchEvent(new window.Event('pointerover', { bubbles: true }));

test('pointing at or focusing a suggestion shows its saved brief explanation, else its child reply start, else nothing', async (t) => {
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
    assert.equal(underline().getAttribute('aria-describedby'), null, 'pointer leaves focus alone');
    await act(async () => underline().focus());
    assert.equal(underline().getAttribute('aria-describedby'), tip().id);
    await act(async () => key(underline(), 'Escape'));
    assert.equal(tip(), null, 'Escape dismisses the popup');
    // Clicking still opens the textbox for an unexplored suggestion.
    await act(async () => underline().click());
    assert.equal(branched.at(-1)[0].suggestion, true);

    // Branched: the saved explanation stays; without one, the child's first reply start shows.
    await act(async () =>
        update((v) => ({
            ...v,
            suggestions: ready({ child: 'child', preview: 'Repeating means…' }),
        })),
    );
    await act(async () => point(underline()));
    assert.equal(tip().textContent, 'Do it again.');
    await act(async () => update((v) => ({ ...v, briefs: [] })));
    await act(async () => point(underline().parentElement));
    await act(async () => point(underline()));
    assert.equal(tip().textContent, 'Repeating means…');
    await act(async () => underline().click());
    assert.deepEqual(opened, ['child'], 'clicking an explored one still opens its child');
});
