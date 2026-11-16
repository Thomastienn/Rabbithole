import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { launch } from '../support/startup-kit.mjs';

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
    assert.match(running.output(), /Claude Code: not installed/);
    assert.match(running.output(), /claude.ai\/install.sh/);
    assert.match(running.output(), /Codex: not installed/);
    assert.match(running.output(), /npm install -g @openai\/codex/);
    assert.match(running.output(), /Continue with ChatGPT/);
    assert.ok(running.output().includes(dir));
    const state = await (await fetch(origin + '/api/state')).json();
    const search = await (await fetch(origin + '/api/settings/searxng')).json();
    assert.equal(search.ready, false);
    assert.equal(search.url, null);
    assert.match(search.error, /Install uv/);
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

test('preflight distinguishes installed sign-out from saved connections without exposing account details', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rabbithole-preflight-'));
  writeFileSync(join(dir, 'codex'), '#!/bin/sh\nprintf "codex-cli fixture\\n"\n', { mode: 0o700 });
  for (const connected of [false, true]) {
    writeFileSync(
      join(dir, 'claude'),
      `#!/bin/sh\nif [ "$1" = "--version" ]; then printf 'Claude fixture'; else printf '{"loggedIn":${connected},"email":"private@example.com"}'; fi\n`,
      { mode: 0o700 },
    );
    if (connected)
      writeFileSync(join(dir, 'chatgpt.json'), '{"email":"private@example.com"}', { mode: 0o600 });
    const running = launch(dir);
    try {
      await running.waitFor(/Saved trees remain available/);
      assert.match(
        running.output(),
        connected ? /Claude Code: installed and signed in/ : /Claude Code: installed; signed out/,
      );
      assert.match(
        running.output(),
        connected
          ? /Codex: installed; ChatGPT connection saved/
          : /Codex: installed; ChatGPT not connected/,
      );
      if (!connected) assert.match(running.output(), /reload Rabbithole/);
      assert.doesNotMatch(running.output(), /private@example.com/);
    } finally {
      await running.stop();
    }
  }
});
