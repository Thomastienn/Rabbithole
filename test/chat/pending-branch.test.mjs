import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversation, json, mount, summary } from '../support/chat-hooks-kit.mjs';

const anchor = { messageId: 'reply', start: 0, end: 6, text: 'Mutex', suggestion: true };
const reply = (status) => ({ id: 'reply', role: 'assistant', text: 'Mutex guards', status });

// The open conversation's reply streams; a question sent from one of its suggestions waits for it.
async function waiting(t, intercept) {
    const page = await mount(t, intercept);
    const streaming = (status) =>
        page.act(async () =>
            page.current.c.setTree((tree) => ({ ...tree, messages: [reply(status)] })),
        );
    await streaming('streaming');
    await page.act(async () => page.current.branch.startBranch('a', anchor, { current: null }));
    await page.act(async () => page.current.c.setBranch((b) => ({ ...b, question: 'Why?' })));
    await page.act(async () => page.current.branch.submitBranch({ preventDefault() {} }));
    assert.equal(page.current.c.branch.pending, true, 'the question waits in the box');
    assert.equal(page.calls.filter((c) => /\/(branches|prepare)$/.test(c.path)).length, 0);
    return { page, streaming };
}

test('a question sent while the reply streams creates its branch once the reply completes', async (t) => {
    let controller;
    const { page, streaming } = await waiting(t, ({ path, body }, { data, state }) => {
        if (path === '/api/trees/a/branches') {
            const child = {
                ...conversation('child'),
                branch: { parent: 'a', ...body, snapshot: '' },
            };
            data.set('child', child);
            state.trees.push(summary('child', 'a'));
            return json(child);
        }
        if (path === '/api/trees/child/messages')
            return new Response(
                new ReadableStream({
                    start(value) {
                        controller = value;
                    },
                }),
            );
    });
    await streaming('completed');
    assert.deepEqual(page.calls.find((c) => c.path.endsWith('/branches')).body, {
        ...anchor,
        question: 'Why?',
    });
    assert.equal(page.current.c.tree.id, 'child');
    assert.equal(page.current.c.branch, undefined);
    await page.act(async () => controller.close());
});

test('a waiting question the server refuses once the reply completes stays in the box with the error', async (t) => {
    const { page, streaming } = await waiting(t, ({ path }) => {
        if (path === '/api/trees/a/branches')
            return json({ error: 'Quick thinking is off.' }, false);
    });
    await streaming('completed');
    assert.equal(page.current.c.error, 'Quick thinking is off.');
    assert.equal(page.current.c.branch.question, 'Why?');
    assert.equal(page.current.c.branch.pending, false);
});

for (const status of ['interrupted', 'failed'])
    test(`a question sent while the reply streams stays in the box when the reply ends ${status}`, async (t) => {
        const { page, streaming } = await waiting(t);
        await streaming(status);
        assert.equal(page.calls.filter((c) => c.path.endsWith('/branches')).length, 0);
        assert.equal(page.current.c.branch.question, 'Why?');
        assert.equal(page.current.c.branch.pending, false, 'the learner can send it again');
    });
