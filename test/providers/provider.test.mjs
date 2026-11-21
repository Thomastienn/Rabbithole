import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { inlineArgs } from '../support/tool-protocol.mjs';

// Fake CLI child that replays stream-json lines once stdin closes.
function fakeLaunch(lines, calls) {
    return (cmd, args, options) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        let input = '';
        child.stdin = {
            end: (text) => {
                input = text;
                setImmediate(() => {
                    for (const l of lines) child.stdout.write(JSON.stringify(l) + '\n');
                    child.stdout.end();
                    child.stdout.on('end', () => child.emit('close', 0));
                });
            },
        };
        child.kill = () => {
            child.killed = true;
        };
        calls.push({
            cmd,
            args: inlineArgs(args),
            options,
            get input() {
                return input;
            },
        });
        return child;
    };
}
const ok = (session = 's-1') => [
    { type: 'system', subtype: 'init', session_id: session, model: 'claude-sonnet' },
    { type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } },
    {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
    },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Hello' }] } },
    { type: 'result', is_error: false, result: 'Hello' },
];

test('Claude CLI: fresh session receives saved history once, resume does not, no API key leaks', async () => {
    process.env.ANTHROPIC_API_KEY = 'must-not-pass';
    const calls = [],
        events = [],
        saved = [];
    const claude = new Claude(mkdtempSync(join(tmpdir(), 'tt-claude-')), fakeLaunch(ok(), calls));
    const tree = {
        thread: null,
        model: 'sonnet',
        branch: { snapshot: 'Inherited fact', text: 'passage' },
        messages: [
            { role: 'user', text: 'Codex question', status: 'completed' },
            { role: 'assistant', text: 'Codex answer', status: 'completed' },
        ],
    };
    try {
        await claude.generate(
            tree,
            'Next?',
            (e) => events.push(e),
            (...a) => saved.push(a),
            new AbortController().signal,
        );
        const [first] = calls;
        assert.equal(first.cmd, 'claude');
        assert.ok(first.args.includes('--session-id') && !first.args.includes('--resume'));
        assert.equal(first.args[first.args.indexOf('--tools') + 1], '');
        assert.match(first.args[first.args.indexOf('--system-prompt') + 1], /Inherited fact/);
        assert.match(first.input, /Codex answer/);
        assert.match(first.input, /Next\?$/);
        assert.equal(first.options.env.ANTHROPIC_API_KEY, undefined);
        assert.deepEqual(saved, [['s-1', 'sonnet']]);
        assert.deepEqual(events, [
            { type: 'response' },
            { type: 'delta', item: 'm1', text: 'Hel' },
            { type: 'item', item: 'm1', text: 'Hello' },
            { type: 'status', status: 'completed' },
        ]);
        await claude.generate(
            { ...tree, thread: 's-1' },
            'Again',
            () => {},
            () => {},
            new AbortController().signal,
        );
        assert.deepEqual(
            calls[1].args.slice(
                calls[1].args.indexOf('--resume'),
                calls[1].args.indexOf('--resume') + 2,
            ),
            ['--resume', 's-1'],
        );
        assert.equal(calls[1].input, 'Again');
    } finally {
        delete process.env.ANTHROPIC_API_KEY;
    }
});

test('Claude CLI: the time limit counts silence, so steady output past 5 minutes still finishes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const children = [];
    const claude = new Claude(mkdtempSync(join(tmpdir(), 'tt-claude-')), () => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = { end: () => {} };
        child.kill = () => setImmediate(() => child.emit('close', null));
        children.push(child);
        return child;
    });
    const turn = () =>
        claude.generate(
            { thread: null, messages: [] },
            'Q',
            () => {},
            () => {},
            new AbortController().signal,
        );
    const settle = async () => {
        for (let i = 0; i < 5; i++) await new Promise(setImmediate);
    };
    const long = turn();
    await settle();
    // A tool call every 200 s: 600 s in total, never 300 s of silence.
    for (const line of ok()) {
        children[0].stdout.write(JSON.stringify(line) + '\n');
        await settle();
        t.mock.timers.tick(200000);
    }
    children[0].stdout.end();
    children[0].emit('close', 0);
    await long;
    const silent = turn();
    await settle();
    t.mock.timers.tick(300000);
    await assert.rejects(silent, /stopped responding/);
});

test('Claude CLI: error result fails visibly with the CLI reason', async () => {
    const calls = [],
        events = [];
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-claude-')),
        fakeLaunch([{ type: 'result', is_error: true, result: "You've hit your limit" }], calls),
    );
    await assert.rejects(
        claude.generate(
            { thread: null, messages: [] },
            'Q',
            (e) => events.push(e),
            () => {},
            new AbortController().signal,
        ),
        /Claude: You've hit your limit/,
    );
    assert.deepEqual(events, [{ type: 'status', status: 'failed' }]);
});

test('Claude CLI: signed-out run saves no session or notice; lost resumed session is dropped for a fresh retry', async () => {
    const calls = [],
        events = [],
        saved = [];
    const signedOut = [
        { type: 'system', subtype: 'init', session_id: 'never-created', model: 'claude-sonnet' },
        {
            type: 'assistant',
            message: {
                id: 'x',
                model: '<synthetic>',
                content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
            },
        },
        {
            type: 'result',
            subtype: 'success',
            is_error: true,
            result: 'Not logged in · Please run /login',
        },
    ];
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-claude-')),
        fakeLaunch(signedOut, calls),
    );
    await assert.rejects(
        claude.generate(
            { thread: null, messages: [] },
            'Q',
            (e) => events.push(e),
            (...a) => saved.push(a),
            new AbortController().signal,
        ),
        /signed out\. Run claude in a terminal/,
    );
    assert.deepEqual(
        events,
        [{ type: 'status', status: 'failed' }],
        'synthetic notice is not a tutor reply',
    );
    assert.deepEqual(saved, [], 'retry after sign-in must not --resume a session that never ran');
    const lost = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-claude-')),
        fakeLaunch(
            [{ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0 }],
            calls,
        ),
    );
    await assert.rejects(
        lost.generate(
            { thread: 'gone', model: 'opus', messages: [] },
            'Q',
            () => {},
            (...a) => saved.push(a),
            new AbortController().signal,
        ),
    );
    assert.deepEqual(saved, [[null, 'opus']]);
});

test('switching providers keeps history, starts a fresh session, children inherit, failure rolls back', async () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-switch-')), 'trees.sqlite'));
    const seen = [];
    const fake = (name, fail) => ({
        models: async () => [{ model: `${name}-m`, label: name, isDefault: true }],
        generate: async (tree, text, emit, save) => {
            if (!tree.messages) {
                emit({ type: 'item', item: 'c', text: 'compact' });
                emit({ type: 'status', status: 'completed' });
                return;
            }
            seen.push({ name, thread: tree.thread, messages: tree.messages.length, text });
            save(tree.thread ?? `${name}-thread`, tree.model);
            if (fail()) throw new Error('down');
            emit({ type: 'item', item: 'a', text: `${name} says` });
            emit({ type: 'status', status: 'completed' });
        },
    });
    let claudeDown = false;
    const app = createApp({
        store,
        auth: { status: () => ({ connected: true }) },
        providers: {
            claude: fake('claude', () => claudeDown),
            codex: Object.assign(
                fake('codex', () => false),
                { installed: () => false },
            ),
        },
        defaultProvider: 'claude',
    });
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (path, body) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    try {
        const root = await (await post('/api/trees', {})).json();
        assert.equal(root.provider, 'claude', 'new trees default to Claude');
        await (await post(`/api/trees/${root.id}/messages`, { text: 'One' })).text();
        assert.equal(store.tree(root.id).thread, 'claude-thread');
        const models = await (await fetch(`${origin}/api/models`)).json();
        assert.deepEqual(
            models.models.map((m) => m.provider),
            ['claude', 'codex'],
        );
        assert.equal(
            models.providers.codex.installed,
            false,
            'a missing CLI is reported for setup',
        );
        assert.equal('installed' in models.providers.claude, false);
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'codex', model: 'claude-m' }))
                .status,
            400,
            'model must belong to the target provider',
        );
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'nope', model: 'x' })).status,
            400,
        );
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'codex', model: 'codex-m' }))
                .status,
            200,
        );
        assert.equal(store.tree(root.id).thread, null);
        await (await post(`/api/trees/${root.id}/messages`, { text: 'Two' })).text();
        assert.deepEqual(
            seen.at(-1),
            { name: 'codex', thread: null, messages: 2, text: 'Two' },
            'Codex starts fresh with the Claude discussion',
        );
        assert.equal(store.tree(root.id).messages.length, 4);
        const reply = store.tree(root.id).messages[3];
        const child = await (
            await post(`/api/trees/${root.id}/branches`, {
                messageId: reply.id,
                start: 0,
                end: 5,
                text: 'codex',
                question: 'Why?',
            })
        ).json();
        assert.equal(child.provider, 'codex');
        assert.equal(child.model, 'codex-m');
        // Back to Claude, but Claude fails: provider, model and thread roll back to the working Codex session.
        claudeDown = true;
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'claude', model: 'claude-m' }))
                .status,
            200,
        );
        assert.match(
            await (await post(`/api/trees/${root.id}/messages`, { text: 'Three' })).text(),
            /down/,
        );
        assert.deepEqual(seen.at(-1), { name: 'claude', thread: null, messages: 4, text: 'Three' });
        const after = store.tree(root.id);
        assert.deepEqual(
            [after.provider, after.model, after.thread],
            ['codex', 'codex-m', 'codex-thread'],
            'working Codex session restored',
        );
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'claude', model: 'claude-m' }))
                .status,
            200,
        );
        assert.equal(store.tree(root.id).thread, null, 'switch away still starts fresh');
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'codex', model: 'codex-m' }))
                .status,
            200,
        );
        assert.equal(
            store.tree(root.id).thread,
            'codex-thread',
            'switching straight back resumes the working session',
        );
        claudeDown = false;
        assert.equal(
            (await post(`/api/trees/${root.id}/model`, { provider: 'claude', model: 'claude-m' }))
                .status,
            200,
        );
        await (await post(`/api/trees/${root.id}/messages`, { text: 'Four' })).text();
        assert.deepEqual(seen.at(-1), { name: 'claude', thread: null, messages: 6, text: 'Four' });
        assert.deepEqual(
            [store.tree(root.id).provider, store.tree(child.id).provider],
            ['claude', 'codex'],
            'independent conversations keep their own provider',
        );
    } finally {
        app.stop();
        store.close();
    }
});
