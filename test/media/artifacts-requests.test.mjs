import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../../server/store.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { task, directive, source, complete, open, invalidSyntax } from '../support/diagram-kit.mjs';
import { TEST_PROVIDER } from '../support/test-provider.mjs';

test('diagram request saves an owned artifact and keeps directive, worker prompt and source out of tutor history', async () => {
    const calls = [];
    let env, reply;
    const provider = {
        generate: async (tree, text, emit, save) => {
            calls.push({ tree, text });
            if (!tree.id) {
                const pending = env.store.tree(reply.id).artifacts[0];
                assert.equal(pending.status, 'pending');
                assert.equal(pending.source, null);
                save('worker-thread-secret', 'worker-model');
                complete(emit, source);
            } else {
                save('tutor-thread-secret', 'fixture-model');
                const answer =
                    calls.length === 1
                        ? 'Here is how winners advance.' + directive
                        : 'Continuing the explanation.';
                // Split every character: no prefix of the hidden fence may reach SSE or storage.
                for (const ch of answer) emit({ type: 'delta', item: 'answer', text: ch });
                complete(emit, answer);
            }
        },
    };
    env = await open(provider);
    try {
        reply = env.store.create('Diagrams', 'codex');
        env.store.thread(reply.id, 'tutor-thread-secret', 'fixture-model');
        env.store.message(reply.id, 'user', 'UNRELATED PRIVATE TRANSCRIPT', 'completed');
        const stream = await (
            await env.post(`/api/trees/${reply.id}/messages`, { text: 'Explain winners.' })
        ).text();
        const saved = await (await env.get(`/api/trees/${reply.id}`)).json();
        assert.equal(saved.artifacts?.length, 1);
        const [artifact] = saved.artifacts;
        assert.equal(artifact.status, 'ready');
        assert.equal(artifact.kind, 'mermaid');
        assert.equal(artifact.input, undefined, 'the stored request stays server-side');
        assert.equal(artifact.conversation, reply.id);
        assert.equal(artifact.message, saved.messages.at(-1).id);
        assert.equal(artifact.title, task.title);
        assert.equal(artifact.description, task.description);
        assert.equal(artifact.source, source);
        assert.equal(saved.messages.at(-1).text.trim(), 'Here is how winners advance.');
        const worker = calls[1];
        assert.equal(worker.tree.thread, null);
        assert.equal(worker.tree.model, 'fixture-model');
        assert.equal(worker.tree.messages, undefined);
        assert.equal(worker.tree.branch, undefined);
        assert.deepEqual(Object.keys(worker.tree).sort(), [
            'instructions',
            'model',
            'provider',
            'thread',
        ]);
        assert.doesNotMatch(
            JSON.stringify(worker),
            /tutor-thread-secret|UNRELATED PRIVATE TRANSCRIPT|Explain winners/,
        );
        assert.deepEqual(JSON.parse(worker.text), task);
        assert.equal(saved.thread, null, 'raw native reply must not be resumed');
        assert.deepEqual(
            [saved.model, saved.working_model, saved.working_thread],
            ['fixture-model', 'fixture-model', null],
        );
        assert.doesNotMatch(
            stream,
            /rabbithole-diagram|\"intent\"|\"excerpt\"|worker-thread-secret/,
        );
        for (const frame of stream.trim().split('\n\n')) {
            if (!frame.startsWith('data: ')) continue;
            const event = JSON.parse(frame.slice(6));
            if (event.type === 'text') assert.doesNotMatch(event.text, /`/);
        }
        await (await env.post(`/api/trees/${reply.id}/messages`, { text: 'Continue.' })).text();
        const next = calls.at(-1);
        assert.match(JSON.stringify(next.tree.messages), /Tournament tree|Pairs of winners/);
        assert.ok(JSON.stringify(next.tree.messages).includes(artifact.id));
        assert.doesNotMatch(
            JSON.stringify(next),
            /flowchart|Winner A|worker-thread-secret|rabbithole-diagram|Show two winners|A and B advance/,
        );
        assert.equal(next.tree.artifacts, undefined);
        const reopened = new Store(env.path);
        // HTTP returns the stored rows minus the server-side request (input) and attempt.
        try {
            const saved = reopened.tree(reply.id);
            assert.deepEqual(
                JSON.parse(
                    JSON.stringify({
                        ...saved,
                        artifacts: saved.artifacts.map(({ input, attempt, ...a }) => a),
                    }),
                ),
                await (await env.get(`/api/trees/${reply.id}`)).json(),
            );
        } finally {
            reopened.close();
        }
    } finally {
        env.close();
    }
});

for (const name of [TEST_PROVIDER])
    test(`${name} adapter generates diagrams in a fresh native session and imports only artifact metadata on continuation`, async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tt-media-adapter-'));
        const calls = [];
        const launch = (command, args, options) => {
            const call = { command, args, options, input: [] };
            // The quick thinking runner started ahead of time is not one of the reply's sessions.
            if (!args.includes('--input-format') || args.includes('--session-id')) calls.push(call);
            const fixture = fileURLToPath(
                new URL('../support/protocol-fixture.mjs', import.meta.url),
            );
            const child = spawn(
                process.execPath,
                [fixture, ...(command === 'claude' ? args : [])],
                options,
            );
            if (command === 'claude') {
                assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
                const end = child.stdin.end.bind(child.stdin);
                child.stdin.end = (text) => {
                    call.input.push(text);
                    return end(text);
                };
            } else {
                assert.equal(options.env.OPENAI_API_KEY, undefined);
                const write = child.stdin.write.bind(child.stdin);
                child.stdin.write = (text) => {
                    call.input.push(JSON.parse(text));
                    return write(text);
                };
            }
            return child;
        };
        const provider =
            name === 'claude'
                ? new Claude(dir, launch)
                : new Codex({ token: async () => 'fixture-subscription-token' }, dir, launch);
        const env = await open(null, { providers: { [name]: provider }, defaultProvider: name });
        try {
            const tree = env.store.create('Native adapter fixture', name);
            env.store.model(tree.id, name === 'claude' ? 'sonnet' : 'fixture-model');
            env.store.message(tree.id, 'user', 'UNRELATED ADAPTER TRANSCRIPT', 'completed');
            const stream = await (
                await env.post(`/api/trees/${tree.id}/messages`, {
                    text: 'diagram fixture request',
                })
            ).text();
            let saved = env.store.tree(tree.id);
            assert.equal(saved.artifacts.length, 1);
            const artifact = saved.artifacts[0];
            assert.equal(artifact.status, 'ready', artifact.error);
            assert.equal(artifact.title, 'Rounds');
            assert.equal(artifact.source, 'flowchart TD\n  W1[Round one] --> W2[Final]');
            assert.doesNotMatch(saved.messages.at(-1).text, /rabbithole-diagram/);
            assert.doesNotMatch(stream, /rabbithole-diagram/);
            assert.equal(saved.thread, null);
            if (name === 'claude') {
                assert.equal(calls.length, 2);
                const system = (call) => call.args[call.args.indexOf('--system-prompt') + 1];
                assert.notEqual(
                    system(calls[1]),
                    system(calls[0]),
                    'the worker has its own instructions',
                );
                assert.doesNotMatch(
                    calls[1].input[0] + system(calls[1]),
                    /UNRELATED ADAPTER TRANSCRIPT|Earlier discussion|diagram fixture request/,
                );
                assert.equal(calls[1].args.includes('--resume'), false);
                const sessions = calls.map(
                    (call) => call.args[call.args.indexOf('--session-id') + 1],
                );
                assert.notEqual(sessions[0], sessions[1]);
                assert.equal(JSON.parse(calls[1].input[0]).intent, 'Show each round.');
                // Actual worker permissions, separate from transcript isolation: no tools, MCP, settings, slash commands or API key; one turn.
                const arg = (flag) => calls[1].args[calls[1].args.indexOf(flag) + 1];
                assert.equal(arg('--tools'), '');
                assert.equal(arg('--max-turns'), '1');
                assert.equal(arg('--mcp-config'), '{"mcpServers":{}}');
                assert.equal(arg('--setting-sources'), '');
                assert.ok(
                    calls[1].args.includes('--strict-mcp-config') &&
                        calls[1].args.includes('--disable-slash-commands'),
                );
            } else {
                const requests = calls.flatMap((call) => call.input);
                const starts = requests.filter((r) => r.method === 'thread/start');
                const worker = calls.find((call) => call.input.includes(starts[1]));
                assert.equal(starts.length, 2);
                assert.notEqual(
                    starts[1].params.baseInstructions,
                    starts[0].params.baseInstructions,
                );
                assert.equal(starts[1].params.threadId, undefined);
                const turns = requests.filter((r) => r.method === 'turn/start');
                assert.notEqual(turns[0].params.threadId, turns[1].params.threadId);
                assert.equal(JSON.parse(turns[1].params.input[0].text).intent, 'Show each round.');
                assert.doesNotMatch(
                    JSON.stringify(turns[1]),
                    /UNRELATED ADAPTER TRANSCRIPT|diagram fixture request/,
                );
                assert.ok(
                    requests
                        .filter((r) => r.method === 'thread/inject_items')
                        .every((r) => r.params.threadId !== turns[1].params.threadId),
                );
                // Actual worker permissions: read-only sandbox, no approvals, tools disabled, and the worker's command request is denied.
                assert.equal(starts[1].params.sandbox, 'read-only');
                assert.equal(starts[1].params.approvalPolicy, 'never');
                for (const feature of [
                    'shell_tool',
                    'apply_patch_freeform',
                    'js_repl',
                    'code_mode',
                    'apps',
                    'skills',
                ])
                    assert.ok(worker.args.includes(`features.${feature}=false`), feature);
                assert.ok(worker.args.includes('web_search="disabled"'));
                assert.deepEqual(Object.keys(worker.options.env).sort(), [
                    'ACCESS_TOKEN',
                    'CODEX_HOME',
                    'PATH',
                ]);
                assert.equal(requests.find((r) => r.id === 'worker-command')?.error?.code, -32601);
            }
            await (
                await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue artifact.' })
            ).text();
            saved = env.store.tree(tree.id);
            assert.equal(saved.messages.at(-1).status, 'completed');
            const history =
                name === 'claude'
                    ? calls[2].input[0]
                    : JSON.stringify(
                          calls
                              .flatMap((call) => call.input)
                              .filter((r) => r.method === 'thread/inject_items')
                              .at(-1),
                      );
            assert.match(history, /Rounds|round winners/);
            assert.ok(history.includes(artifact.id));
            assert.doesNotMatch(
                history,
                /flowchart|W1\[|Show each round|Frozen round excerpt|rabbithole-diagram/,
            );
        } finally {
            env.close();
        }
    });

test('invalid, unsafe and oversized worker results save honest failures without retaining source; chat remains usable', async () => {
    let output,
        asked = false;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id)
                    complete(
                        emit,
                        asked ? 'You can continue learning.' : 'A diagram helps.' + directive,
                    );
                else {
                    if (output === 'provider-error')
                        throw new Error('Private provider diagnostic with credential-canary');
                    if (output === 'not-completed') {
                        emit({ type: 'item', item: 'answer', text: source });
                        emit({ type: 'status', status: 'failed' });
                        return;
                    }
                    if (output === 'too-many-items') {
                        for (let i = 0; i < 33; i++)
                            emit({ type: 'item', item: String(i), text: 'A' });
                        return;
                    }
                    if (Array.isArray(output))
                        for (const part of output)
                            emit({ type: 'delta', item: 'answer', text: part });
                    else emit({ type: 'item', item: 'answer', text: output });
                    emit({ type: 'status', status: 'completed' });
                }
            },
        },
        { diagramParse: async (value) => !invalidSyntax.includes(value) },
    );
    const rejected = [
        ...invalidSyntax.map((value) => [value, /Invalid Mermaid syntax/]),
        ['flowchart TD\n A[Ok] --> B[Ok]\n click A callback', /Unsafe diagram source/],
        ['flowchart TD\n A[Ok]\n click A href "https://example.test"', /Unsafe diagram source/],
        ['flowchart TD\n A["<b>HTML</b>"]', /Unsafe diagram source/],
        ['flowchart TD\n A["Line<br/>break"]', /Unsafe diagram source/],
        ['flowchart TD\n A["#60;script#62;alert(1)#60;/script#62;"]', /Unsafe diagram source/],
        ['flowchart TD\n A["&#x3c;img src=x&#x3e;"]', /Unsafe diagram source/],
        ['flowchart TD\n A["&lt;b&gt;HTML&lt;/b&gt;"]', /Unsafe diagram source/],
        ['%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\n A --> B', /Unsafe diagram source/],
        [
            '---\nconfig:\n securityLevel: loose\n---\nflowchart TD\n A --> B',
            /Unsafe diagram source/,
        ],
        ['flowchart TD\n A@{ img: "https://example.test/x.svg" }', /Unsafe diagram source/],
        [
            'flowchart TD\n A --> B; classDef evil fill:url(javascript:alert(1))',
            /Unsafe diagram source/,
        ],
        [
            'flowchart TD\n A --> B\n linkStyle 0 stroke:url(//example.test/x)',
            /Unsafe diagram source/,
        ],
        ['flowchart TD\n A["`[Open](/secret)`"]', /Unsafe diagram source/],
        [
            'sequenceDiagram\n participant A\n participant B\n link A: Site@https://example.test',
            /Unsafe diagram source/,
        ],
        ['flowchart TD\n A["' + 'x'.repeat(16384) + '"]', /exceeds 16 KiB/],
        ['flowchart TD\n A["' + '🌲'.repeat(4100) + '"]', /exceeds 16 KiB/],
        [Array.from({ length: 5 }, () => 'x'.repeat(4000)), /exceeds 16 KiB/],
        ['', /no source/],
        ['provider-error', /Diagram provider failed/],
        ['not-completed', /did not complete/],
        ['too-many-items', /exceeds 32 message items/],
    ];
    try {
        for (const [value, reason] of rejected) {
            output = value;
            const tree = env.store.create('Rejected output', 'codex');
            const stream = await (
                await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw it.' })
            ).text();
            const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
            assert.equal(
                saved.messages.at(-1).status,
                'completed',
                'a diagram failure does not fail the tutor reply',
            );
            assert.equal(saved.artifacts.length, 1);
            assert.equal(saved.artifacts[0].status, 'failed', String(value).slice(0, 50));
            assert.equal(saved.artifacts[0].source, null);
            assert.match(saved.artifacts[0].error, reason);
            assert.doesNotMatch(
                stream + JSON.stringify(saved),
                /credential-canary|Private provider diagnostic/,
            );
            assert.equal(env.app.active.size, 0);
        }
        asked = true;
        const tree = env.store.list()[0];
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue.' })).text();
        assert.equal(env.store.tree(tree.id).messages.at(-1).text, 'You can continue learning.');
    } finally {
        env.close();
    }
});

test('malformed requests are hidden and failed without sending transcript-shaped or oversized tasks to a worker', async () => {
    let request,
        workers = 0;
    const env = await open({
        generate: async (tree, text, emit) => {
            if (!tree.id) {
                workers++;
                complete(emit, source);
            } else complete(emit, 'Visible answer.\n' + request);
        },
    });
    try {
        for (const value of [
            '```rabbithole-diagram\n{broken json}\n```',
            '```rabbithole-diagram\n' +
                JSON.stringify({ ...task, intent: '  ', thread: 'must-not-pass' }) +
                '\n```',
            '```rabbithole-diagram\n' +
                JSON.stringify({ title: 'No intent', description: 'd', excerpt: 'e' }) +
                '\n```',
            '```rabbithole-diagram\n' + JSON.stringify({ ...task, excerpt: null }) + '\n```',
            '```rabbithole-diagram\n' + JSON.stringify(task),
            directive + '\n```rabbithole-video\n' + JSON.stringify(task) + '\n```',
            directive.repeat(7),
            '```rabbithole-diagram extra\n' + JSON.stringify(task) + '\n```',
        ]) {
            request = value;
            const tree = env.store.create('Bad request', 'codex');
            const stream = await (
                await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain.' })
            ).text();
            const saved = env.store.tree(tree.id);
            assert.doesNotMatch(stream, /rabbithole-diagram|broken json|must-not-pass/);
            assert.equal(saved.messages.at(-1).text.trim(), 'Visible answer.');
            assert.equal(
                saved.artifacts.length,
                (value.match(/rabbithole-(diagram|video)/g) ?? []).length,
                'every rejected block gets its own artifact',
            );
            for (const artifact of saved.artifacts) {
                assert.equal(artifact.status, 'failed');
                assert.match(
                    artifact.error,
                    /^(Diagram|Video) request could not be read: the (request|tutor)/,
                );
            }
        }
        assert.equal(workers, 0);
    } finally {
        env.close();
    }
});
