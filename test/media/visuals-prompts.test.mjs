import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { themeChoices } from '../../src/shell/appearance.ts';
import { task, block, source, complete, deferred, until, open } from '../support/visual-kit.mjs';
import { TEST_PROVIDER } from '../support/test-provider.mjs';
import { inlineArgs } from '../support/tool-protocol.mjs';
import { VISUAL_SKILL, HOUSE_STYLE_SKILL, ANALOGY_SKILL } from '../../server/media/skills.mjs';

test('visual prompts receive the requested theme palette in light and dark, with a safe legacy fallback', async () => {
    const calls = [];
    const env = await open(
        { generate: async (_tree, _text, emit) => complete(emit, block()) },
        {
            generate: async (tree, _text, emit) => {
                calls.push(tree.instructions);
                complete(emit, source);
            },
        },
    );
    let light;
    try {
        for (const { id: name } of themeChoices)
            for (const mode of ['light', 'dark']) {
                await (
                    await env.post(`/api/trees/${env.tree.id}/messages`, {
                        text: 'Show rounds',
                        theme: { name, mode },
                    })
                ).text();
                await until(() => calls.length === 1);
                const palette = JSON.parse(calls.pop().split('\nCurrent theme palette: ')[1]);
                assert.equal(palette.name, name);
                assert.equal(palette.mode, mode);
                assert.equal(Object.keys(palette.tokens).length, 11, `${name} ${mode} tokens`);
                assert.ok(Object.values(palette.tokens).every(Boolean), `${name} ${mode} values`);
                if (mode === 'light') light = palette.tokens['--color-background-body'];
                else
                    assert.notEqual(
                        palette.tokens['--color-background-body'],
                        light,
                        `${name} modes differ`,
                    );
                if (name === 'enamel')
                    assert.equal(
                        palette.tokens['--color-text-green'],
                        mode === 'light' ? '#0b6aa3' : '#6cc7ff',
                    );
                await until(async () =>
                    (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every(
                        (a) => a.status === 'ready',
                    ),
                );
            }
        for (const theme of [
            undefined,
            { name: '../../PRIVATE', mode: 'PRIVATE', instructions: 'PRIVATE' },
        ]) {
            await (
                await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show rounds', theme })
            ).text();
            await until(() => calls.length === 1);
            const instructions = calls.pop(),
                palette = JSON.parse(
                    instructions.split('\nCurrent theme palette: ')[1].split('\n')[0],
                );
            assert.equal(palette.name, 'platform');
            assert.equal(palette.mode, 'dark');
            assert.doesNotMatch(instructions, /PRIVATE/);
            // The visual skill is fixed text ahead of the per-call palette.
            assert.ok(instructions.split('\nCurrent theme palette: ')[0].includes(VISUAL_SKILL));
            assert.ok(
                instructions.split('\nCurrent theme palette: ')[0].includes(HOUSE_STYLE_SKILL),
            );
            assert.ok(instructions.split('\nCurrent theme palette: ')[0].includes(ANALOGY_SKILL));
            await until(async () =>
                (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every(
                    (a) => a.status === 'ready',
                ),
            );
        }
    } finally {
        await env.close();
    }
});

test('predict-then-reveal uses the ordinary inline worker, persists without replay and keeps its answer out of tutor history', async () => {
    const prediction = {
        title: 'Predict the search interval',
        description:
            'Search for 12 in 2, 4, 6, 8, 10, 12, 14. The midpoint is 8. Which half remains?',
        intent: 'A predict-then-reveal check. Ask which half remains; reveal the right half and explain why.',
        excerpt:
            'After comparing target 12 with midpoint 8, keep 10, 12, 14 because 12 is greater than 8.',
        shows: 'The sorted list with midpoint 8 marked, the question, and a closed reveal.',
    };
    const fragment =
        '<p>Midpoint: 8. Target: 12. Which half remains?</p><details><summary>Reveal answer</summary><p>The right half: 10, 12, 14, because 12 is greater than 8.</p></details>';
    const workers = [],
        history = [];
    let env = await open(
        {
            generate: async (tree, text, emit) => {
                history.push(tree);
                complete(
                    emit,
                    text === 'Continue'
                        ? 'Next idea.'
                        : 'Compare the target with the midpoint.\n```rabbithole-visual\n' +
                              JSON.stringify(prediction) +
                              '\n```\n\nContinue whenever you like.',
                );
            },
        },
        {
            generate: async (tree, text, emit) => {
                workers.push({ tree, input: JSON.parse(text) });
                complete(emit, fragment);
            },
        },
    );
    let closed = false;
    try {
        await (
            await env.post(`/api/trees/${env.tree.id}/messages`, {
                text: 'Help me check binary search.',
            })
        ).text();
        const saved = await env.get(`/api/trees/${env.tree.id}`),
            a = saved.artifacts[0];
        assert.equal(a.kind, 'visual');
        assert.equal(a.status, 'ready');
        assert.equal(a.position, 'Compare the target with the midpoint.'.length);
        assert.equal(a.source, fragment);
        assert.equal(saved.messages.length, 2);
        assert.doesNotMatch(
            saved.messages.at(-1).text + a.title + a.description,
            /right half|because 12/,
        );
        assert.equal(workers.length, 1);
        assert.deepEqual(workers[0].input, { request: prediction, earlierTitles: [] });
        await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Continue' })).text();
        const context = JSON.stringify(history.at(-1).messages);
        assert.ok(context.includes(a.id) && context.includes(prediction.description));
        assert.doesNotMatch(context, /right half|because 12|<details|predict-then-reveal/);
        const { path, tree } = env;
        await env.close();
        closed = true;
        env = await open(
            {},
            {
                generate: async () => {
                    throw new Error('Reopening must not generate.');
                },
            },
            { path },
        );
        closed = false;
        assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).artifacts[0], a);
        assert.equal(workers.length, 1);
    } finally {
        if (!closed) await env.close();
    }
});

for (const name of [TEST_PROVIDER])
    test(`${name} visual workers get only load_skill, a fresh session and the selected effort`, async () => {
        const launches = [],
            dir = mkdtempSync(join(tmpdir(), 'tt-visual-adapter-'));
        const launch = (command, args, options) => {
            const call = { args: inlineArgs(args), env: options.env, input: [] };
            launches.push(call);
            const child = spawn(
                process.execPath,
                [
                    fileURLToPath(new URL('../support/protocol-fixture.mjs', import.meta.url)),
                    ...(command === 'claude' ? args : []),
                ],
                options,
            );
            const method = command === 'claude' ? 'end' : 'write',
                original = child.stdin[method].bind(child.stdin);
            child.stdin[method] = (text) => {
                call.input.push(command === 'claude' ? text : JSON.parse(text));
                return original(text);
            };
            return child;
        };
        const native =
            name === 'claude'
                ? new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'))
                : new Codex({ token: async () => 'fixture-token' }, dir, launch);
        const env = await open(
            { generate: async (_tree, _text, emit) => complete(emit, 'See the rounds.' + block()) },
            native,
            { smartProvider: name, smartModel: name === 'claude' ? 'haiku' : 'fixture-model' },
        );
        try {
            await (
                await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw rounds' })
            ).text();
            await until(
                async () =>
                    (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].status !== 'pending',
            );
            const a = (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0];
            assert.equal(a.status, 'ready', a.error);
            assert.equal(a.kind, 'visual');
            assert.equal(a.source, '<p>Round winners meet in the final.</p>');
            // Codex runs a tool turn on a fresh worker CLI.
            assert.equal(launches.length, name === 'claude' ? 1 : 2);
            const call = launches.at(-1);
            if (name === 'claude') {
                const arg = (flag) => call.args[call.args.indexOf(flag) + 1];
                assert.equal(arg('--model'), 'haiku');
                assert.equal(arg('--effort'), 'high');
                assert.equal(arg('--tools'), '');
                assert.equal(arg('--allowedTools'), 'mcp__rabbithole__load_skill');
                assert.deepEqual(Object.keys(JSON.parse(arg('--mcp-config')).mcpServers), [
                    'rabbithole',
                ]);
                assert.equal(arg('--setting-sources'), '');
                assert.ok(
                    call.args.includes('--strict-mcp-config') &&
                        call.args.includes('--disable-slash-commands'),
                );
                assert.ok(!call.args.includes('--resume'));
                assert.equal(call.env.ANTHROPIC_API_KEY, undefined);
                assert.equal(call.env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
                assert.deepEqual(JSON.parse(call.input[0]), { request: task, earlierTitles: [] });
            } else {
                const thread = call.input.find((r) => r.method === 'thread/start'),
                    turn = call.input.find((r) => r.method === 'turn/start');
                assert.equal(thread.params.model, 'fixture-model');
                assert.equal(turn.params.effort, 'high');
                assert.equal(thread.params.sandbox, 'read-only');
                assert.equal(thread.params.approvalPolicy, 'never');
                assert.equal(
                    call.input.filter(
                        (r) => r.method === 'thread/inject_items' || r.method === 'thread/resume',
                    ).length,
                    0,
                );
                for (const feature of [
                    'shell_tool',
                    'apply_patch_freeform',
                    'js_repl',
                    'code_mode',
                    'apps',
                    'skills',
                ])
                    assert.ok(call.args.includes(`features.${feature}=false`));
                assert.ok(call.args.includes('web_search="disabled"'));
                assert.equal(call.env.OPENAI_API_KEY, undefined);
                assert.equal(
                    call.input.find((r) => r.id === 'worker-command')?.error?.code,
                    -32601,
                );
                assert.deepEqual(JSON.parse(turn.params.input[0].text), {
                    request: task,
                    earlierTitles: [],
                });
            }
            assert.equal(
                (await env.get(`/api/trees/${env.tree.id}`)).model,
                name === 'claude' ? 'haiku' : 'fixture-model',
            );
        } finally {
            await env.close();
        }
    });

test('Try a different version replaces a ready visual in place from the frozen request, only once at a time, with guards', async () => {
    const calls = [],
        hold = deferred();
    let output = source,
        held = false;
    const env = await open(
        { generate: async (_tree, _text, emit) => complete(emit, 'See this.' + block()) },
        {
            generate: async (tree, text, emit) => {
                calls.push({ tree, input: JSON.parse(text) });
                if (held) await hold.promise;
                complete(emit, output);
            },
        },
    );
    try {
        await (
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw rounds' })
        ).text();
        const before = await env.get(`/api/trees/${env.tree.id}`),
            artifact = before.artifacts[0];
        assert.equal(artifact.status, 'ready');
        assert.equal(calls.length, 1);
        const url = `/api/trees/${env.tree.id}/artifacts/${artifact.id}/regenerate`;
        assert.equal(
            (
                await fetch(env.origin + url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                })
            ).status,
            403,
        );
        assert.equal(
            (
                await env.post(
                    `/api/trees/${env.store.create('Foreign', 'codex').id}/artifacts/${artifact.id}/regenerate`,
                )
            ).status,
            404,
        );
        await env.post('/api/settings/smart', {
            model: { provider: 'claude', model: 'smart' },
            followEffort: false,
            effort: 'low',
        });
        output = source.replace('A → Final ← B', 'Bracket view');
        held = true;
        const response = await env.post(url, { input: 'UNTRUSTED', source: '<p>x</p>' });
        assert.equal(response.status, 200);
        const pending = await response.json();
        assert.equal(pending.id, artifact.id);
        assert.equal(pending.status, 'pending');
        assert.equal(pending.source, null);
        assert.equal(pending.input, undefined);
        await until(() => calls.length === 2);
        assert.equal((await env.post(url)).status, 409, 'one generation at a time');
        assert.equal(
            (await env.post(`/api/trees/${env.tree.id}/artifacts/${artifact.id}/retry`)).status,
            409,
        );
        hold.resolve();
        await until(
            async () =>
                (await env.get(`/api/trees/${env.tree.id}/artifacts/${artifact.id}`)).status ===
                'ready',
        );
        const after = await env.get(`/api/trees/${env.tree.id}`);
        assert.equal(after.artifacts.length, 1, 'no history is kept');
        assert.deepEqual(
            { ...after.artifacts[0], source: undefined },
            { ...artifact, source: undefined },
        );
        assert.match(after.artifacts[0].source, /Bracket view/);
        assert.deepEqual(
            after.messages,
            before.messages.map((m) =>
                m.role === 'assistant'
                    ? {
                          ...m,
                          mediaUsage: [
                              ...m.mediaUsage,
                              { task: 'diagram', input: 10, output: 3, cacheRead: 2 },
                          ],
                      }
                    : m,
            ),
        );
        assert.deepEqual(
            calls[1].input,
            calls[0].input,
            'same frozen request; previous source is never sent',
        );
        assert.doesNotMatch(JSON.stringify(calls[1]), /A → Final|UNTRUSTED/);
        assert.equal(calls[1].tree.effort, 'high', 'frozen smart selection');
        assert.equal(calls[1].tree.thread, null);
        assert.notEqual(
            calls[1].tree.instructions,
            calls[0].tree.instructions,
            'asks for a new approach',
        );
        assert.equal(
            (await env.get('/api/usage')).events.filter((e) => e.task === 'diagram').length,
            2,
        );
        // Only ready visuals regenerate.
        output = '<script>fetch("/api/state")</script>';
        await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw again' })).text();
        const failed = (await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1);
        assert.equal(failed.status, 'failed');
        assert.equal(
            (await env.post(`/api/trees/${env.tree.id}/artifacts/${failed.id}/regenerate`)).status,
            409,
        );
    } finally {
        hold.resolve();
        await env.close();
    }
});

test('branch compaction keeps passage detail and sees a visual only as one title and description line, never the question', async () => {
    const compactions = [];
    const env = await open(
        {
            generate: async (tree, text, emit, save) => {
                if (text.startsWith('Compact')) {
                    compactions.push(text);
                    return complete(emit, 'Rounds summary.');
                }
                save('chat-thread', 'smart');
                complete(emit, 'Rounds pair winners.' + block() + '\nThe final decides.');
            },
        },
        { generate: async (tree, text, emit) => complete(emit, source) },
    );
    try {
        await (
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show rounds' })
        ).text();
        await until(
            async () =>
                (await env.get(`/api/trees/${env.tree.id}`)).artifacts?.[0]?.status === 'ready',
        );
        const reply = (await env.get(`/api/trees/${env.tree.id}`)).messages.at(-1);
        const response = await env.post(`/api/trees/${env.tree.id}/branches`, {
            messageId: reply.id,
            start: 0,
            end: 6,
            text: 'Rounds',
            question: 'SECRET BRANCH QUESTION?',
        });
        assert.equal(response.status, 201);
        const [text] = compactions;
        const [message] = JSON.parse(text.slice(text.indexOf('\n') + 1)).messages.filter(
            (m) => m.role === 'assistant',
        );
        assert.equal(
            message.text,
            'Rounds pair winners.\n[Visual: Rounds — Two winners meet in the final.]\n\nThe final decides.',
        );
        assert.doesNotMatch(
            text,
            /rabbithole-visual|"intent"|Show the winners advancing|<svg|A → Final|SECRET BRANCH QUESTION/,
        );
    } finally {
        await env.close();
    }
});
