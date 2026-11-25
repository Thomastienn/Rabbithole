import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { launch } from '../support/startup-kit.mjs';
import { findCli } from '../../server/providers/findCli.mjs';

const schemas = JSON.parse(
    readFileSync(new URL('../fixtures/store-schemas.json', import.meta.url)),
);

test('main starts an old database without providers; busy port explains how to choose another', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-start-')),
        path = join(dir, 'trees.sqlite');
    const old = new DatabaseSync(path);
    old.exec(schemas[0].sql.join(';'));
    old.exec(
        "INSERT INTO trees VALUES('saved','Saved before upgrade',NULL,1); INSERT INTO trees VALUES('empty','New chat',NULL,2); INSERT INTO messages(id,tree,role,text,status) VALUES('m1','saved','user','Question','completed')",
    );
    old.close();
    const occupied = createServer();
    await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const port = occupied.address().port;
    const busy = launch(dir, port);
    try {
        assert.equal(await busy.exited, 1);
        assert.match(busy.output(), new RegExp(`Port ${port}.*already in use`));
        assert.match(busy.output(), /npm start -- --port/);
        assert.doesNotMatch(busy.output(), /Unhandled|at Server\./);
    } finally {
        await busy.stop();
        await new Promise((resolve) => occupied.close(resolve));
    }
    const running = launch(dir);
    try {
        const [, origin] = await running.waitFor(/Rabbithole: (http:\/\/127\.0\.0\.1:\d+)/);
        await running.waitFor(/Saved trees remain available/);
        assert.match(running.output(), /Node.*24/);
        // Fixed install folders such as Homebrew's cannot be hidden, so a CLI there counts as installed.
        const absent = (name) =>
            !findCli(name, { env: { PATH: dir, NPM_CONFIG_PREFIX: dir }, home: dir });
        if (absent('claude')) assert.match(running.output(), /claude\.ai\/install\.sh/);
        if (absent('codex')) assert.match(running.output(), /chatgpt\.com\/codex\/install\.sh/);
        assert.ok(running.output().includes(dir));
        const state = await (await fetch(origin + '/api/state')).json();
        const search = await (await fetch(origin + '/api/settings/searxng')).json();
        assert.equal(search.ready, false);
        assert.equal(search.url, null);
        assert.match(search.error, /Web search is not downloaded/);
        assert.equal(state.auth.connected, false);
        assert.deepEqual(
            state.trees.map((t) => t.title),
            ['Saved before upgrade'],
            'startup removes the tree with no messages and keeps the one with a message',
        );
        assert.equal((await (await fetch(origin + '/api/trees/saved')).json()).id, 'saved');
        const duplicate = launch(dir);
        try {
            assert.equal(await duplicate.exited, 1);
            assert.match(duplicate.output(), /already using data directory/);
            assert.equal((await fetch(origin + '/api/state')).status, 200);
        } finally {
            await duplicate.stop();
        }
    } finally {
        await running.stop();
    }
    assert.equal(readdirSync(dir).filter((f) => /backup-.*\.sqlite$/.test(f)).length, 1);
    const restarted = launch(dir);
    try {
        await restarted.waitFor(/Rabbithole: http:/);
    } finally {
        await restarted.stop();
    }
});

test('preflight finds CLIs outside PATH and distinguishes sign-out from saved connections without exposing account details', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-preflight-'));
    // Chat's lookup also searches ~/.local/bin and npm's global bin; PATH holds neither CLI.
    const localBin = join(dir, '.local', 'bin'),
        npmPrefix = join(dir, 'npm');
    mkdirSync(localBin, { recursive: true });
    mkdirSync(join(npmPrefix, 'bin'), { recursive: true });
    writeFileSync(join(localBin, 'codex'), '#!/bin/sh\nprintf "codex-cli fixture\\n"\n', {
        mode: 0o700,
    });
    for (const connected of [false, true]) {
        writeFileSync(
            join(npmPrefix, 'bin', 'claude'),
            `#!/bin/sh\nif [ "$1" = "--version" ]; then printf 'Claude fixture'; else printf '{"loggedIn":${connected},"email":"private@example.com"}'; fi\n`,
            { mode: 0o700 },
        );
        if (connected)
            writeFileSync(join(dir, 'chatgpt.json'), '{"email":"private@example.com"}', {
                mode: 0o600,
            });
        const running = launch(dir, 0, { PATH: join(dir, 'empty'), NPM_CONFIG_PREFIX: npmPrefix });
        try {
            await running.waitFor(/Saved trees remain available/);
            assert.match(
                running.output(),
                connected
                    ? /Claude Code: installed and signed in/
                    : /Claude Code: installed; signed out/,
            );
            assert.match(
                running.output(),
                connected
                    ? /Codex: installed; ChatGPT connection saved/
                    : /Codex: installed; ChatGPT not connected/,
            );
            assert.doesNotMatch(running.output(), /private@example.com/);
        } finally {
            await running.stop();
        }
    }
});
