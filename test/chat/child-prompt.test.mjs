import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAI } from '../../server/providers/openai.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { fakeOpenAI } from '../support/fake-openai.mjs';
import { compacted } from '../support/branch-first.mjs';
import { TEST_PROVIDER } from '../support/test-provider.mjs';
import { inlineArgs } from '../support/tool-protocol.mjs';

const ANCHOR =
    /first message asks about the selected passage; "this", "it" and "that" refer to the passage unless the learner says otherwise\. Explain the passage even if the inherited context says it was skipped/;

for (const name of [TEST_PROVIDER, 'openai'])
    test(`${name}: a child's first turn is anchored to its passage; the root is not`, async (t) => {
        const dir = mkdtempSync(join(tmpdir(), 'tt-child-prompt-')),
            store = new Store(join(dir, 'trees.sqlite')),
            calls = [];
        const launch = (command, args, options) => {
            const call = { args: inlineArgs(args), input: [] };
            calls.push(call);
            const child = spawn(
                process.execPath,
                [
                    fileURLToPath(new URL('../support/protocol-fixture.mjs', import.meta.url)),
                    ...(command === 'claude' ? args : []),
                ],
                options,
            );
            if (command !== 'claude') {
                const send = child.stdin.write.bind(child.stdin);
                child.stdin.write = (data) => {
                    call.input.push(JSON.parse(data));
                    return send(data);
                };
            }
            return child;
        };
        const providers =
            name === 'claude'
                ? {
                      claude: new Claude(dir, launch, (cmd, args, opts, cb) =>
                          cb(null, '{"loggedIn":true}'),
                      ),
                  }
                : name === 'codex'
                  ? { codex: new Codex({ token: async () => 'fixture-token' }, dir, launch) }
                  : {};
        const fake = name === 'openai' && (await fakeOpenAI(t));
        const app = createApp({
            store,
            dir,
            endpoint: new OpenAI(dir),
            providers,
            defaultProvider: 'claude',
            auth: { status: () => ({ connected: false }) },
        });
        await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
        t.after(async () => {
            await app.stop();
            store.close();
        });
        const origin = `http://127.0.0.1:${app.server.address().port}`;
        const { csrf } = await (await fetch(`${origin}/api/state`)).json();
        const post = (path, body) =>
            fetch(origin + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
                body: JSON.stringify(body),
            });
        const provider = fake
            ? (
                  await (
                      await post('/api/settings/endpoints', {
                          name: 'Custom endpoint',
                          baseUrl: fake.baseUrl,
                          apiKey: 'fixture-key',
                      })
                  ).json()
              )[0].id
            : name;
        // The tutor system prompt each provider received, newest last; compaction and suggestion calls carry other instructions.
        const prompts = () =>
            name === 'openai'
                ? fake.calls.filter((c) => c.body?.messages).map((c) => c.body.messages[0].content)
                : name === 'claude'
                  ? calls.map((c) => c.args[c.args.indexOf('--system-prompt') + 1])
                  : calls
                        .flatMap((c) => c.input)
                        .filter((r) => r.method === 'thread/start' || r.method === 'thread/resume')
                        .map((r) => r.params.baseInstructions);
        const tutor = () => prompts().filter((p) => p.includes('You are Rabbithole'));

        const root = store.create('Root', provider);
        store.model(
            root.id,
            { claude: 'sonnet', codex: 'fixture-model', openai: 'local-tutor' }[name],
        );
        await (await post(`/api/trees/${root.id}/messages`, { text: 'Root fact' })).text();
        assert.equal(tutor().length, 1);
        assert.doesNotMatch(tutor()[0], ANCHOR, 'root conversations get no passage instruction');
        const reply = store.tree(root.id).messages.at(-1),
            passage = reply.text.slice(0, 8);
        const created = await post(`/api/trees/${root.id}/branches`, {
            messageId: reply.id,
            start: 0,
            end: 8,
            text: passage,
            question: 'what is this',
        });
        assert.equal(created.status, 201);
        const child = await compacted(app, origin, (await created.json()).id);
        assert.ok(child.branch.snapshot, 'compaction settled');
        assert.match(
            await (await post(`/api/trees/${child.id}/messages`, { text: 'what is this' })).text(),
            /"status":"completed"/,
        );
        const first = tutor().at(-1);
        assert.match(first, ANCHOR);
        assert.ok(
            first.includes(
                JSON.stringify({ snapshot: child.branch.snapshot, selectedPassage: passage }),
            ),
            'first turn carries the passage',
        );
    });
