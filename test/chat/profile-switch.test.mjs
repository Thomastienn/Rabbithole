import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversation, json, mount } from '../support/chat-hooks-kit.mjs';

// Model profile switch: the open conversation follows the profile's chat default from its next message.
const saveModel = ({ path, body }, { data }) => {
    const [, id] = path.match(/^\/api\/trees\/(\w+)\/model$/) ?? [];
    if (!id) return;
    Object.assign(data.get(id), body);
    return json(body);
};
const modelSaves = (page) => page.calls.filter((c) => c.path.endsWith('/model'));
const deep = { provider: 'codex', model: 'gpt', effort: null };

test('activating a profile sets the open conversation to its chat model, even a hand-picked one', async (t) => {
    const page = await mount(t, saveModel);
    await page.act(async () => page.current.model.chooseModel('claude', 'opus', 'high'));
    await page.act(async () => page.current.model.profileActivated(deep));
    assert.deepEqual(modelSaves(page).at(-1).body, deep);
    assert.equal(modelSaves(page).at(-1).path, '/api/trees/a/model');
    const { provider, model, effort } = page.current.trees.tree;
    assert.deepEqual({ provider, model, effort }, deep);
    assert.equal(
        page.current.model.currentModel.model,
        'gpt',
        'the model menu shows the new model',
    );
    assert.equal(page.data.get('b').provider, 'claude', 'other conversations keep their model');
});

test('with no conversation open, activating a profile changes no conversation', async (t) => {
    const page = await mount(t, saveModel);
    await page.act(async () => page.current.trees.setTree(undefined));
    await page.act(async () => page.current.model.profileActivated(deep));
    assert.equal(modelSaves(page).length, 0);
});

test('a reply streaming during a profile switch finishes on its old model; the switch follows', async (t) => {
    const page = await mount(t, (call, ctx) => {
        if (call.path === '/api/state' && !ctx.data.get('a').messages.length)
            ctx.state.active = ['a'];
        return saveModel(call, ctx);
    });
    assert.deepEqual(page.current.trees.state.active, ['a']);
    await page.act(async () => page.current.model.profileActivated(deep));
    assert.equal(modelSaves(page).length, 0, 'no model change while the reply streams');
    page.data.set('a', {
        ...conversation('a'),
        messages: [
            { id: 'answer', role: 'assistant', text: 'Old model reply', status: 'completed' },
        ],
    });
    page.state.active = [];
    await page.act(async () => t.mock.timers.tick(1500));
    await page.act(async () => {});
    assert.equal(page.current.trees.tree.messages[0].text, 'Old model reply');
    assert.deepEqual(
        modelSaves(page).map((c) => c.body),
        [deep],
    );
    assert.equal(page.current.trees.tree.provider, 'codex');
});
