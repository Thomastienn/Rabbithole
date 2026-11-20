import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeOpenAI } from '../support/fake-openai.mjs';
import { open } from '../support/openai-kit.mjs';

const json = (res, status, body) =>
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
const valid = (req, res) =>
    json(res, 200, {
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                        {
                            id: 'c',
                            type: 'function',
                            function: { name: 'ping', arguments: '{"word":"ok"}' },
                        },
                    ],
                },
            },
        ],
    });

async function launch(t, models) {
    const fake = await fakeOpenAI(t);
    fake.models = models.map((id) => ({ id }));
    const env = await open(t, {}, { log: () => {} });
    const id = (
        await (
            await env.post('/api/settings/endpoints', {
                name: 'Local',
                baseUrl: fake.baseUrl,
                apiKey: 'sk-test',
            })
        ).json()
    ).at(-1).id;
    // One chat turn; returns the turn's chat request body.
    const ask = async (model) => {
        const tree = env.store.create('Probe', id, model).id;
        await (await env.post(`/api/trees/${tree}/messages`, { text: 'Hi' })).text();
        return fake.calls.filter((c) => c.path === '/v1/chat/completions').at(-1).body;
    };
    return { fake, env, id, ask };
}
const native = (body) => !!body.tools?.some((x) => x.function.name === 'record_turn');
const textFallback = (body) => !body.tools && /<tool_call>/.test(body.messages[0].content);

test('the probe runs once per used model, picks native or text, and Retest drives the next turn', async (t) => {
    const { fake, env, id, ask } = await launch(t, ['calls', 'silent', 'unused']);
    const silent = fake.probe;
    fake.probe = (req, res, body) => (body.model === 'calls' ? valid : silent)(req, res, body);

    assert.ok(native(await ask('calls')));
    assert.ok(textFallback(await ask('silent')));
    assert.ok(native(await ask('calls')));
    assert.ok(textFallback(await ask('silent')));
    assert.deepEqual(
        fake.probes.map((p) => p.model),
        ['calls', 'silent'],
    );
    assert.deepEqual(
        fake.probes[0].tools.map((x) => x.function.name),
        ['ping'],
    );
    assert.equal(env.store.usesTutorToolsOverride(id, 'unused'), null, 'listed but unused');
    const listed = (await (await env.get('/api/models')).json()).models;
    assert.equal(listed.find((m) => m.model === 'calls').usesTutorTools, true);

    fake.probe = valid;
    const retest = await env.post('/api/settings/endpoints/model/retest', { id, model: 'silent' });
    assert.deepEqual(await retest.json(), { id, model: 'silent', usesTutorTools: true });
    assert.ok(native(await ask('silent')));
    fake.probe = silent;
    await env.post('/api/settings/endpoints/model/retest', { id, model: 'calls' });
    assert.ok(textFallback(await ask('calls')));
    assert.equal(fake.probes.length, 4);
});

test('a failed probe saves nothing and retries; a rejected tools request means the text fallback', async (t) => {
    const { fake, env, id, ask } = await launch(t, ['m']);
    fake.probe = (req, res) => json(res, 503, {});
    assert.ok(textFallback(await ask('m')));
    assert.equal(env.store.usesTutorToolsOverride(id, 'm'), null);
    const retest = await env.post('/api/settings/endpoints/model/retest', { id, model: 'm' });
    assert.equal(retest.status, 502);
    assert.match((await retest.json()).error, /unavailable/);

    fake.probe = (req, res) => json(res, 400, { error: { message: 'tools unsupported' } });
    assert.ok(textFallback(await ask('m')));
    assert.equal(env.store.usesTutorToolsOverride(id, 'm'), false);
    await ask('m');
    assert.equal(fake.probes.length, 3);
});

test('a model the endpoint reports tool support for is not probed', async (t) => {
    const { fake, ask } = await launch(t, []);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    assert.ok(native(await ask('tooled')));
    assert.equal(fake.probes.length, 0);
});
