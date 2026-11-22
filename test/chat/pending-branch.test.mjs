import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { conversation, json, mountHook, summary } from '../support/chat-hooks-kit.mjs';
import { fakeServer } from '../support/fake-server.mjs';

const { useBranchForm } = await import('../../src/chat/useBranchForm.ts');
const anchor = { messageId: 'reply', start: 0, end: 6, text: 'Mutex', suggestion: true };
const reply = (status) => ({ id: 'reply', role: 'assistant', text: 'Mutex guards', status });

// The open conversation's reply streams; a question sent from one of its suggestions waits for it.
// The branch form mounts alone: the owners it takes are fakes that record what it asks of them.
async function waiting(t, branches = () => json({})) {
    const calls = fakeServer(t, (path, body) => (path.endsWith('/branches') ? branches(body) : {}));
    const fake = { shown: [], sent: [] };
    const page = await mountHook(t, () => {
        const [tree, setTree] = useState({ ...conversation('a'), messages: [reply('streaming')] });
        const [error, setError] = useState('');
        Object.assign(fake, { setTree, error });
        return useBranchForm(
            { setError, overview: false, setOverview() {}, overviewOrigin: { current: undefined } },
            {
                tree,
                setTree,
                state: { trees: [summary('a')] },
                addresses: new Map(),
                refresh: async () => {},
                openConversation: async () => {},
                openId: () => 'a',
                show: (next) => fake.shown.push(next.id),
                targets: { focusNext() {} },
            },
            { savingModel: undefined },
            { send: async (question, next) => fake.sent.push([question, next.id]), setDraft() {} },
        );
    });
    const streaming = (status) =>
        page.act(async () => fake.setTree((tree) => ({ ...tree, messages: [reply(status)] })));
    await page.act(async () => page.current.startBranch('a', anchor, { current: null }));
    await page.act(async () => page.current.setQuestion('Why?'));
    await page.act(async () => page.current.submitBranch({ preventDefault() {} }));
    assert.equal(page.current.branch.pending, true, 'the question waits in the box');
    assert.equal(calls.filter((c) => /\/(branches|prepare)$/.test(c.path)).length, 0);
    return { page, streaming, calls, fake };
}

test('a question sent while the reply streams creates its branch once the reply completes', async (t) => {
    const { page, streaming, calls, fake } = await waiting(t, (body) =>
        json({ ...conversation('child'), branch: { parent: 'a', ...body, snapshot: '' } }),
    );
    await streaming('completed');
    assert.deepEqual(calls.find((c) => c.path.endsWith('/branches')).body, {
        ...anchor,
        question: 'Why?',
    });
    assert.deepEqual(fake.shown, ['child'], 'the child opens');
    assert.deepEqual(fake.sent, [['Why?', 'child']], 'the child asks the question');
    assert.equal(page.current.branch, undefined);
});

test('a waiting question the server refuses once the reply completes stays in the box with the error', async (t) => {
    const { page, streaming, fake } = await waiting(t, () =>
        json({ error: 'Quick thinking is off.' }, false),
    );
    await streaming('completed');
    assert.equal(fake.error, 'Quick thinking is off.');
    assert.equal(page.current.branch.question, 'Why?');
    assert.equal(page.current.branch.pending, false);
});

for (const status of ['interrupted', 'failed'])
    test(`a question sent while the reply streams stays in the box when the reply ends ${status}`, async (t) => {
        const { page, streaming, calls } = await waiting(t);
        await streaming(status);
        assert.equal(calls.filter((c) => c.path.endsWith('/branches')).length, 0);
        assert.equal(page.current.branch.question, 'Why?');
        assert.equal(page.current.branch.pending, false, 'the learner can send it again');
    });
