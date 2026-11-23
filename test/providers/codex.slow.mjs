import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Codex } from '../../server/providers/codex.mjs';

const fixture = (inspect = () => {}) =>
    new Codex(
        { token: async () => 'synthetic-token' },
        mkdtempSync(join(tmpdir(), 'rabbithole-codex-')),
        (_command, args, options) => {
            assert.ok(args.includes('model_provider="openai_chatgpt_plan"'));
            assert.equal(options.env.OPENAI_API_KEY, undefined);
            assert.equal(options.env.ACCESS_TOKEN, 'synthetic-token');
            assert.ok(options.env.CODEX_HOME.endsWith('/codex'));
            const child = spawn(process.execPath, ['test/support/protocol-fixture.mjs'], {
                ...options,
                cwd: process.cwd(),
            });
            const write = child.stdin.write.bind(child.stdin);
            child.stdin.write = (data) => {
                inspect(JSON.parse(data));
                return write(data);
            };
            return child;
        },
    );
test('model catalog follows pagination, excludes hidden and non-text entries; changed model resumes same history', async () => {
    const requests = [];
    const client = fixture((r) => requests.push(r));
    try {
        assert.deepEqual(
            (await client.models()).map((m) => m.model),
            ['fixture-model', 'fixture-alternate', 'fixture-luna'],
        );
        assert.deepEqual(
            requests.filter((r) => r.method === 'model/list').map((r) => r.params.cursor),
            [undefined, 'page-two'],
        );
        const tree = {
            thread: 'saved-history',
            model: 'fixture-alternate',
            branch: { snapshot: 'Exactly 47 trees.', text: 'grove' },
        };
        let savedModel;
        await client.generate(
            tree,
            'Recall our discussion',
            () => {},
            (_thread, model) => {
                savedModel = model;
            },
            new AbortController().signal,
        );
        assert.equal(savedModel, tree.model);
        const resume = requests.find((r) => r.method === 'thread/resume');
        assert.equal(resume.params.threadId, tree.thread);
        assert.equal(resume.params.model, tree.model);
        assert.match(resume.params.baseInstructions, /Exactly 47 trees/);
        assert.equal(
            requests.some((r) => r.method === 'thread/start' || r.method === 'thread/inject_items'),
            false,
        );
        assert.equal(requests.find((r) => r.method === 'turn/start').params.model, tree.model);
    } finally {
        client.close();
    }
});
test('child pins inherited model and supplies fixed context on new and resumed threads', async () => {
    const requests = [];
    const client = fixture((request) => requests.push(request));
    const branch = { snapshot: 'Luma has 37 branches.', text: 'same phrase' };
    try {
        for (const thread of [null, 'saved-child'])
            await client.generate(
                { thread, model: 'fixture-model', branch },
                'Explain this',
                () => {},
                () => {},
                new AbortController().signal,
            );
        const threads = requests.filter(
            (r) => r.method === 'thread/start' || r.method === 'thread/resume',
        );
        assert.equal(threads.length, 2);
        for (const { params } of threads) {
            assert.equal(params.model, 'fixture-model');
            assert.match(params.baseInstructions, /Luma has 37 branches/);
            assert.match(params.baseInstructions, /same phrase/);
        }
        assert.deepEqual(
            requests.filter((r) => r.method === 'turn/start').map((r) => r.params.input[0].text),
            ['Explain this', 'Explain this'],
        );
    } finally {
        client.close();
    }
});
test('stdio stream routes by thread, final item replaces partial, saved thread resumes', async () => {
    const client = fixture();
    const events = [];
    try {
        let saved;
        await client.generate(
            { thread: 'saved-thread' },
            'question',
            (e) => events.push(e),
            (id) => {
                saved = id;
            },
            new AbortController().signal,
        );
        assert.equal(saved, 'saved-thread');
        assert.deepEqual(events, [
            { type: 'delta', item: 'answer', text: 'Partial' },
            { type: 'item', item: 'answer', text: 'Authoritative original' },
            { type: 'usage', usage: { input: 30, output: 9, cacheRead: 20, reasoning: 4 } },
            { type: 'status', status: 'completed' },
        ]);
    } finally {
        client.close();
    }
});
test('failed terminal turn and process exit reject rather than report success', async () => {
    for (const prompt of ['fail', 'disconnect']) {
        const client = fixture();
        try {
            await assert.rejects(
                client.generate(
                    {},
                    prompt,
                    () => {},
                    () => {},
                    new AbortController().signal,
                ),
                /Partial reply saved|disconnected/,
            );
        } finally {
            client.close();
        }
    }
    const client = fixture();
    try {
        await assert.rejects(
            client.generate(
                {},
                'fail',
                () => {},
                () => {},
                new AbortController().signal,
            ),
            { message: 'Codex: Fixture usage limit reached. Partial reply saved; try again.' },
        );
    } finally {
        client.close();
    }
});

test('fresh threads import completed role history once before current question', async () => {
    const requests = [];
    const client = fixture((request) => requests.push(request));
    const messages = [
        { role: 'user', text: 'Name our fictional tree.', status: 'completed' },
        { role: 'assistant', text: 'Its name is Aster.', status: 'completed' },
        { role: 'assistant', text: 'Unfinished guess', status: 'interrupted' },
        { role: 'assistant', text: 'Failed guess', status: 'failed' },
    ];
    try {
        for (const thread of [null, 'saved-thread'])
            await client.generate(
                { thread, messages },
                'Recall its name.',
                () => {},
                () => {},
                new AbortController().signal,
            );
        const imports = requests.filter((r) => r.method === 'thread/inject_items');
        assert.equal(imports.length, 1);
        assert.deepEqual(imports[0].params.items, [
            {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: messages[0].text }],
            },
            {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: messages[1].text }],
            },
        ]);
        assert.ok(
            requests.indexOf(imports[0]) < requests.findIndex((r) => r.method === 'turn/start'),
        );
        assert.deepEqual(
            requests.filter((r) => r.method === 'turn/start').map((r) => r.params.input[0].text),
            ['Recall its name.', 'Recall its name.'],
        );
    } finally {
        client.close();
    }
});

test('failed history import does not save incomplete thread or start inference', async () => {
    const requests = [];
    const client = fixture((request) => requests.push(request));
    let saved = false;
    try {
        await assert.rejects(
            client.generate(
                { messages: [{ role: 'assistant', text: 'reject import', status: 'completed' }] },
                'question',
                () => {},
                () => {
                    saved = true;
                },
                new AbortController().signal,
            ),
            /Codex request failed/,
        );
        assert.equal(saved, false);
        assert.equal(
            requests.some((r) => r.method === 'turn/start'),
            false,
        );
    } finally {
        client.close();
    }
});

test('aborted generation starts no inference; interrupt releases a stalled turn without waiting for terminal output', async () => {
    const requests = [];
    let started;
    const turn = new Promise((resolve) => {
        started = resolve;
    });
    const client = fixture((request) => {
        requests.push(request);
        if (request.method === 'turn/start') started();
    });
    try {
        const cancelled = new AbortController();
        cancelled.abort();
        const events = [];
        await client.generate(
            {},
            'Never send this',
            (event) => events.push(event),
            () => {},
            cancelled.signal,
        );
        assert.deepEqual(events, [{ type: 'status', status: 'interrupted' }]);
        assert.equal(requests.length, 0);
        const controller = new AbortController();
        const running = client.generate(
            {},
            'hold',
            (event) => events.push(event),
            () => {},
            controller.signal,
        );
        await turn;
        controller.abort();
        let timeout;
        try {
            await Promise.race([
                running,
                new Promise((_, reject) => {
                    timeout = setTimeout(
                        () => reject(new Error('Abort did not release generation.')),
                        1000,
                    );
                }),
            ]);
        } finally {
            clearTimeout(timeout);
        }
        assert.equal(client.listeners.size, 0);
        assert.equal(events.at(-1).status, 'interrupted');
    } finally {
        client.close();
    }
});

// A client whose token the test swaps: records the token of each launch and resolves `turn` when a turn starts.
const refreshable = () => {
    const state = { launched: [], token: 'synthetic-token-one' };
    state.turn = new Promise((resolve) => {
        state.started = resolve;
    });
    state.client = new Codex(
        { token: async () => state.token },
        mkdtempSync(join(tmpdir(), 'rabbithole-codex-')),
        (_command, _args, options) => {
            state.launched.push(options.env.ACCESS_TOKEN);
            const child = spawn(process.execPath, ['test/support/protocol-fixture.mjs'], {
                ...options,
                cwd: process.cwd(),
            });
            const write = child.stdin.write.bind(child.stdin);
            child.stdin.write = (data) => {
                if (JSON.parse(data).method === 'turn/start') state.started();
                return write(data);
            };
            return child;
        },
    );
    return state;
};
const hold = (client, tree) => {
    const controller = new AbortController();
    const events = [];
    const running = client.generate(
        tree,
        'hold',
        (event) => events.push(event),
        () => {},
        controller.signal,
    );
    return { controller, events, running };
};

test('refreshed token restarts the CLI only after running turns finish', async (t) => {
    const state = refreshable();
    const { client, launched } = state;
    try {
        await client.models();
        // The turn starts on a CLI that has run for a while, as a refresh usually finds it.
        const now = Date.now;
        t.mock.method(Date, 'now', () => now() + 40 * 60000);
        const { controller, events, running } = hold(client, {});
        await state.turn;
        state.token = 'synthetic-token-two';
        await client.models();
        assert.deepEqual(launched, ['synthetic-token-one']);
        controller.abort();
        await running;
        assert.equal(events.at(-1).status, 'interrupted');
        while (client.pending.size) await new Promise((resolve) => setTimeout(resolve, 10));
        await client.models();
        assert.deepEqual(launched, ['synthetic-token-one', 'synthetic-token-two']);
    } finally {
        client.close();
    }
});

test('refreshed token restarts an idle CLI without ending tool turns on their own CLI', async () => {
    const state = refreshable();
    const { client, launched } = state;
    try {
        await client.models();
        const { controller, events, running } = hold(client, { nativeTools: ['web_search'] });
        await state.turn;
        state.token = 'synthetic-token-two';
        await client.models();
        assert.deepEqual(launched, [
            'synthetic-token-one',
            'synthetic-token-one',
            'synthetic-token-two',
        ]);
        controller.abort();
        await running;
        assert.equal(events.at(-1).status, 'interrupted');
    } finally {
        client.close();
    }
});
