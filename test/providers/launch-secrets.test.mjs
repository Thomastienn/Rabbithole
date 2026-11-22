import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { toolMcp } from '../../server/tools/mcp.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';
import { tutorSystem } from '../../server/media/tutor-instructions.mjs';
import { fixtureLaunch } from '../support/fixture-launch.mjs';

const definitions = await toolRunner().tools({ provider: 'codex', capable: true });
const auth = { token: async () => 'synthetic-token', status: () => ({ connected: true }) };
// A large tree: 500 resources and a long memory note push the prompt far past the Windows limit.
const big = (mcp) => ({
    model: 'fixture-model',
    nativeTools: ['read_page'],
    tools: definitions,
    mcp,
    runTool: async () => 'App page says forty-two.',
    memoryNote: 'The learner likes worked examples. '.repeat(1000),
    resources: Array.from({ length: 500 }, (_, i) => ({
        number: i + 1,
        title: `Resource ${i + 1} about heaps and priority queues`,
        site: 'example.org',
    })),
});
const turnFiles = (dir) =>
    readdirSync(join(dir, 'claude-workspace')).filter((f) => f.startsWith('turn-'));

test('Claude reads the prompt and tool token from private turn files that end with the turn', async (t) => {
    const mcp = toolMcp(),
        dir = mkdtempSync(join(tmpdir(), 'tt-launch-claude-'));
    t.after(() => mcp.close());
    const tree = big(mcp);
    let seen;
    const launch = (command, args, options) => {
        const at = (flag) => args[args.indexOf(flag) + 1];
        const files = [at('--system-prompt-file'), at('--mcp-config')];
        seen = {
            args,
            modes: files.map((f) => statSync(f).mode & 0o777),
            folder: statSync(join(files[0], '..')).mode & 0o777,
            system: readFileSync(files[0], 'utf8'),
            token: JSON.parse(readFileSync(files[1], 'utf8')).mcpServers.rabbithole.headers
                .Authorization,
        };
        return fixtureLaunch(command, args, options);
    };
    const events = [];
    await new Claude(dir, launch).generate(
        tree,
        'native tools fixture',
        (e) => events.push(e),
        () => {},
        new AbortController().signal,
    );
    assert.equal(seen.system, tutorSystem(tree));
    assert.ok(seen.system.length > 32767);
    assert.match(seen.token, /^Bearer [\w-]{43}$/);
    assert.deepEqual(seen.modes, [0o600, 0o600]);
    assert.equal(seen.folder, 0o700);
    const line = seen.args.join(' ');
    assert.ok(line.length < 32767, `command line is ${line.length} characters`);
    assert.equal(line.includes(seen.token.slice(7)), false);
    assert.equal(line.includes('The learner likes worked examples'), false);
    assert.equal(seen.args.includes('--system-prompt'), false);
    // The fixture called the app tool with the token from the file.
    assert.ok(events.some((e) => e.type === 'item' && e.text === 'App page says forty-two.'));
    assert.deepEqual(turnFiles(dir), []);
});

test('Claude removes its turn files after a launch error and after a stop', async (t) => {
    const mcp = toolMcp(),
        dir = mkdtempSync(join(tmpdir(), 'tt-launch-claude-end-'));
    t.after(() => mcp.close());
    const failing = new Claude(dir, () => {
        throw new Error('CLI startup failed');
    });
    await assert.rejects(
        failing.generate(
            big(mcp),
            'q',
            () => {},
            () => {},
            new AbortController().signal,
        ),
        /CLI startup failed/,
    );
    assert.deepEqual(turnFiles(dir), []);
    const controller = new AbortController(),
        entered = Promise.withResolvers();
    const tree = {
        ...big(mcp),
        runTool: (_name, _input, signal) => {
            entered.resolve();
            return new Promise((_, reject) =>
                signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
            );
        },
    };
    const running = new Claude(dir, fixtureLaunch).generate(
        tree,
        'native tools fixture',
        () => {},
        () => {},
        controller.signal,
    );
    await entered.promise;
    assert.equal(turnFiles(dir).length, 1);
    controller.abort();
    await running;
    assert.deepEqual(turnFiles(dir), []);
});

test('Codex receives the tool token in its environment, not its arguments', async (t) => {
    const mcp = toolMcp(),
        dir = mkdtempSync(join(tmpdir(), 'tt-launch-codex-'));
    t.after(() => mcp.close());
    const workers = [];
    const launch = (command, args, options) => {
        workers.push({ args, env: options.env });
        return fixtureLaunch(command, args, options);
    };
    const codex = new Codex(auth, dir, launch);
    t.after(() => codex.close());
    const events = [];
    await codex.generate(
        big(mcp),
        'native tools fixture',
        (e) => events.push(e),
        () => {},
        new AbortController().signal,
    );
    const { args, env } = workers.at(-1);
    const token = env.RABBITHOLE_MCP_AUTHORIZATION;
    assert.match(token, /^Bearer [\w-]{43}$/);
    assert.equal(args.join(' ').includes(token.slice(7)), false);
    assert.match(
        args.find((a) => a.startsWith('mcp_servers.rabbithole=')),
        /env_http_headers=\{Authorization="RABBITHOLE_MCP_AUTHORIZATION"\}/,
    );
    assert.ok(events.some((e) => e.type === 'item' && e.text === 'App page says forty-two.'));
});
