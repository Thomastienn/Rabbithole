import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { toolMcp } from '../../server/tools/mcp.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';
import { fixtureLaunch } from '../support/fixture-launch.mjs';
import { codexMcp } from '../support/tool-protocol.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const definitions = await toolRunner().tools({ provider: 'codex', capable: true });
const auth = { token: async () => 'synthetic-token', status: () => ({ connected: true }) };
function adapters(dir, launches) {
  const launch = (command, args, options) => {
    const child = fixtureLaunch(command, args, options);
    launches.push({ command, args, options, child });
    return child;
  };
  return {
    codex: new Codex(auth, dir, launch),
    claude: new Claude(dir, launch, (_cmd, _args, _options, callback) =>
      callback(null, '{"loggedIn":true}'),
    ),
  };
}
const configFor = (call) =>
  call.command === 'codex'
    ? codexMcp(call.args)
    : JSON.parse(call.args[call.args.indexOf('--mcp-config') + 1]).mcpServers.treetutor;

for (const provider of ['claude', 'codex']) {
  test(`${provider} revokes its token when CLI startup fails`, async (t) => {
    const mcp = toolMcp();
    t.after(() => mcp.close());
    let config;
    const launch = (command, args) => {
      config = configFor({ command, args });
      throw new Error('CLI startup failed');
    };
    const dir = mkdtempSync(join(tmpdir(), 'tt-native-startup-'));
    const client = provider === 'claude' ? new Claude(dir, launch) : new Codex(auth, dir, launch);
    t.after(() => client.close());
    await assert.rejects(
      client.generate(
        {
          model: 'fixture-model',
          nativeTools: ['web_search', 'read_page'],
          tools: definitions,
          mcp,
          runTool: () => assert.fail('No runner call'),
        },
        'Question',
        () => {},
        () => {},
        new AbortController().signal,
      ),
      /CLI startup failed/,
    );
    assert.equal(
      (await fetch(config.url, { method: 'POST', headers: config.headers })).status,
      401,
    );
  });
  test(`${provider} Stop cancels its running app tool and revokes its token`, async (t) => {
    const mcp = toolMcp(),
      launches = [],
      clients = adapters(mkdtempSync(join(tmpdir(), 'tt-native-stop-')), launches);
    t.after(async () => {
      Object.values(clients).forEach((c) => c.close());
      await mcp.close();
    });
    const entered = Promise.withResolvers(),
      aborted = Promise.withResolvers();
    const controller = new AbortController(),
      events = [];
    const running = clients[provider].generate(
      {
        model: 'fixture-model',
        nativeTools: ['web_search', 'read_page'],
        tools: definitions,
        mcp,
        runTool: async (_name, _input, signal) => {
          entered.resolve();
          await new Promise((resolve) =>
            signal.addEventListener(
              'abort',
              () => {
                aborted.resolve();
                resolve();
              },
              { once: true },
            ),
          );
          signal.throwIfAborted();
        },
      },
      'native tools fixture',
      (e) => events.push(e),
      () => {},
      controller.signal,
    );
    await entered.promise;
    controller.abort();
    await running;
    await aborted.promise;
    assert.equal(events.filter((e) => e.type === 'status').at(-1).status, 'interrupted');
    const config = configFor(launches.at(-1));
    assert.equal(
      (await fetch(config.url, { method: 'POST', headers: config.headers })).status,
      401,
    );
    assert.equal(
      events.some(
        (e) => e.type === 'tool' && e.tool.name === 'read_page' && e.tool.status === 'done',
      ),
      false,
    );
  });
}

test('concurrent Codex tool turns get separate subprocesses and runners', async (t) => {
  const mcp = toolMcp(),
    launches = [],
    clients = adapters(mkdtempSync(join(tmpdir(), 'tt-native-parallel-')), launches);
  t.after(async () => {
    Object.values(clients).forEach((c) => c.close());
    await mcp.close();
  });
  const all = await Promise.all(
    ['first', 'second'].map(async (fact) => {
      const events = [];
      await clients.codex.generate(
        {
          model: 'fixture-model',
          nativeTools: ['web_search', 'read_page'],
          tools: definitions,
          mcp,
          runTool: async () => fact,
        },
        'native tools fixture',
        (e) => events.push(e),
        () => {},
        new AbortController().signal,
      );
      return events;
    }),
  );
  assert.equal(launches.length, 2);
  assert.notEqual(
    configFor(launches[0]).headers.Authorization,
    configFor(launches[1]).headers.Authorization,
  );
  for (const [i, fact] of ['first', 'second'].entries())
    assert.deepEqual(
      all[i]
        .filter((e) => e.type === 'tool' && e.tool.name === 'read_page' && e.tool.status === 'done')
        .map((e) => e.tool.output),
      [fact],
    );
});

for (const provider of ['claude', 'codex'])
  test(`${provider} tools: CLI config, native events, runner results, token rotation and tools-off arguments`, async (t) => {
    const launches = [],
      dir = mkdtempSync(join(tmpdir(), 'tt-native-tools-'));
    const mcp = toolMcp(),
      clients = adapters(dir, launches),
      client = clients[provider];
    t.after(async () => {
      Object.values(clients).forEach((c) => c.close());
      await mcp.close();
    });
    let saved;
    const tree = {
      nativeTools: ['web_search', 'read_page'],
      mcp,
      tools: definitions,
      model: provider === 'claude' ? 'sonnet' : 'fixture-model',
      runTool: async (name, input, signal) => {
        assert.equal(name, 'read_page');
        assert.equal(input.url, 'https://example.org');
        assert.equal(signal.aborted, false);
        return 'App page says forty-two.';
      },
    };
    const events = [];
    for (let round = 0; round < 2; round++) {
      await client.generate(
        { ...tree, thread: saved },
        'native tools fixture',
        (e) => events.push(e),
        (id) => {
          saved = id;
        },
        new AbortController().signal,
      );
      assert.ok(saved);
      const call = launches.at(-1),
        config = configFor(call);
      assert.match(config.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      assert.match(config.headers.Authorization, /^Bearer [\w-]{43}$/);
      assert.equal(
        (await fetch(config.url, { method: 'POST', headers: config.headers })).status,
        401,
      );
      if (provider === 'claude') {
        assert.equal(call.args.includes('--max-turns'), false);
        assert.equal(call.args[call.args.indexOf('--tools') + 1], 'WebSearch,WebFetch');
        assert.deepEqual(
          call.args.slice(
            call.args.indexOf('--allowedTools') + 1,
            call.args.indexOf('--strict-mcp-config'),
          ),
          ['WebSearch', 'WebFetch', 'mcp__treetutor__read_page'],
        );
        assert.equal(call.args[call.args.indexOf('--setting-sources') + 1], '');
        assert.ok(call.args.includes('--disable-slash-commands'));
      } else {
        assert.ok(call.args.includes('web_search="live"'));
        assert.ok(call.args.includes('features.standalone_web_search=true'));
        assert.ok(call.args.includes('skills.include_instructions=false'));
        assert.ok(call.args.includes('skills.bundled.enabled=false'));
        assert.match(
          call.args.find((arg) => arg.startsWith('mcp_servers.treetutor=')),
          /default_tools_approval_mode="approve"/,
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
        assert.equal(call.child.exitCode, 0);
        assert.deepEqual(events.filter((e) => e.type === 'usage').at(-1).usage, {
          input: 110,
          output: 31,
          cacheRead: 80,
        });
      }
    }
    assert.notEqual(
      configFor(launches[0]).headers.Authorization,
      configFor(launches[1]).headers.Authorization,
    );
    const tools = events.filter((e) => e.type === 'tool').map((e) => e.tool);
    assert.equal(tools.filter((e) => e.name === 'read_page' && e.status === 'done').length, 2);
    assert.ok(tools.some((e) => e.status === 'done' && /Search|example.org/.test(e.output)));
    if (provider === 'claude')
      assert.ok(tools.some((e) => e.name === 'WebFetch' && e.status === 'failed'));
    assert.ok(events.some((e) => e.type === 'item' && e.text === 'App page says forty-two.'));
    const off = [];
    await client.generate(
      { model: tree.model, thread: saved },
      'no tools',
      (e) => off.push(e),
      () => {},
      new AbortController().signal,
    );
    const last = launches.at(-1);
    if (provider === 'claude') {
      assert.equal(last.args[last.args.indexOf('--tools') + 1], '');
      assert.equal(last.args[last.args.indexOf('--max-turns') + 1], '1');
      assert.equal(last.args[last.args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
    } else {
      assert.ok(last.args.includes('web_search="disabled"'));
      assert.equal(
        last.args.some((s) => s.startsWith('mcp_servers.')),
        false,
      );
      assert.deepEqual(off.find((e) => e.type === 'usage').usage, {
        input: 30,
        output: 9,
        cacheRead: 20,
      });
    }
    assert.equal(
      off.some((e) => e.type === 'tool'),
      false,
    );
  });

for (const provider of ['claude', 'codex'])
  test(`${provider} tool events reach the reply stream and persisted activity`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-native-reply-')),
      launches = [],
      clients = adapters(dir, launches);
    const store = new Store(join(dir, 'trees.sqlite'));
    const app = createApp({
      store,
      dir,
      auth,
      providers: clients,
      defaultProvider: provider,
      log: () => {},
      tools: {
        tools: async () => definitions,
        run: async (name, input, turn) => {
          assert.equal(turn.conversation, root.id);
          assert.ok(turn.reply);
          assert.equal(name, 'read_page');
          assert.equal(input.url, 'https://example.org');
          return 'Reply page fact.';
        },
      },
    });
    t.after(async () => {
      await app.stop();
      store.close();
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(origin + '/api/state')).json();
    const root = store.create(
      'Native tools',
      provider,
      provider === 'claude' ? 'sonnet' : 'fixture-model',
    );
    const response = await fetch(`${origin}/api/trees/${root.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify({ text: 'native tools fixture' }),
    });
    const events = (await response.text())
      .split('\n\n')
      .filter((s) => s.startsWith('data: '))
      .map((s) => JSON.parse(s.slice(6)));
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
    assert.ok(
      events.some(
        (e) =>
          e.type === 'tool' && e.tool.name === 'read_page' && e.tool.output === 'Reply page fact.',
      ),
    );
    const reply = store.tree(root.id).messages.at(-1);
    assert.match(reply.text, /Reply page fact/);
    assert.ok(reply.tools.some((tool) => tool.name === 'read_page' && tool.status === 'done'));
    if (provider === 'claude')
      assert.deepEqual(reply.tools.find((tool) => tool.name === 'WebSearch').input, {
        query: 'fixture fact',
      });
    if (provider === 'codex')
      assert.deepEqual(
        reply.usage && {
          input: reply.usage.input,
          output: reply.usage.output,
          cacheRead: reply.usage.cacheRead,
        },
        { input: 110, output: 31, cacheRead: 80 },
      );
  });
