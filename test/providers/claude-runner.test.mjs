import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { fixtureLaunch } from '../support/fixture-launch.mjs';

// Real Claude adapter over the protocol fixture; every launch records its args and the lines written to it.
function setup(t) {
    const launches = [];
    const claude = new Claude(mkdtempSync(join(tmpdir(), 'tt-runner-')), (cmd, args) => {
        const child = fixtureLaunch(cmd, args);
        const launch = { args, child, sent: [] };
        const write = child.stdin.write.bind(child.stdin);
        child.stdin.write = (data, ...rest) => {
            launch.sent.push(JSON.parse(data));
            return write(data, ...rest);
        };
        launches.push(launch);
        return child;
    });
    t.after(() => claude.close());
    const runners = () => launches.filter((l) => !l.args.includes('--session-id'));
    const call = async (text, tree = {}, signal = new AbortController().signal) => {
        const events = [];
        await claude.generate(
            {
                model: 'haiku',
                effort: null,
                thread: null,
                quick: true,
                instructions: 'You explain terms briefly.',
                ...tree,
            },
            text,
            (e) => events.push(e),
            () => {},
            signal,
        );
        return events;
    };
    const text = (events) =>
        events
            .filter((e) => e.type === 'item')
            .map((e) => e.text)
            .join('');
    return { claude, launches, runners, call, text };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('Claude quick thinking: the runner starts ahead of time and each call sees only its own task', async (t) => {
    const { claude, launches, runners, call, text } = setup(t);
    claude.keepRunner(true);
    assert.equal(launches.length, 1, 'started before any call');
    const first = await call('Explain "a".');
    await settle();
    const second = await call('Explain "b".');
    assert.equal(launches.length, 1, 'both calls reused the ready process');
    assert.equal(text(first), 'Authoritative original');
    assert.equal(text(second), 'Authoritative original', 'the second call never saw the first');
    assert.equal(second.at(-1).status, 'completed');
    // The fixed system prompt cannot change, so the task's instructions travel in the message.
    assert.deepEqual(
        runners()[0]
            .sent.filter((m) => m.type === 'user')
            .map((m) => m.message.content),
        [
            'You explain terms briefly.\n\nExplain "a".',
            '/clear',
            'You explain terms briefly.\n\nExplain "b".',
            '/clear',
        ],
    );
});

test('Claude quick thinking: a changed model or effort applies to the next call without a restart', async (t) => {
    const { claude, launches, runners, call } = setup(t);
    claude.keepRunner(true);
    await call('Explain "a".');
    await settle();
    const events = await call('Explain "b".', { model: 'sonnet', effort: 'high' });
    assert.equal(events.at(-1).status, 'completed');
    assert.equal(launches.length, 1);
    assert.deepEqual(
        runners()[0]
            .sent.filter((m) => m.type === 'control_request')
            .map((m) => m.request),
        [
            { subtype: 'apply_flag_settings', settings: { model: 'haiku', effortLevel: null } },
            { subtype: 'apply_flag_settings', settings: { model: 'sonnet', effortLevel: 'high' } },
        ],
    );
});

test('Claude quick thinking: a brief explanation is not delayed behind background notes', async (t) => {
    const { claude, launches, runners, call, text } = setup(t);
    claude.keepRunner(true);
    let backgroundDone = false;
    // A background call (no learner waiting) takes the free runner and holds it until released.
    const background = call(
        'Mark every term\n' +
            JSON.stringify({ question: 'slow suggestions', answer: 'x', knownConcepts: {} }),
    ).then(() => (backgroundDone = true));
    await settle();
    assert.equal(launches.length, 1, 'the background call took the runner');
    assert.equal(text(await call('Explain "a".')), 'Authoritative original');
    assert.equal(backgroundDone, false, 'the brief finished while the background call ran');
    assert.ok(
        launches.some((l) => l.args.includes('--session-id')),
        'the brief started its own process',
    );
    runners()[0].child.release();
    await background;
});

test('Claude quick thinking: the runner closes after 10 minutes without a quick call, and the next call still works', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { claude, runners, call, text } = setup(t);
    claude.keepRunner(true);
    await call('Explain "a".');
    await settle();
    t.mock.timers.tick(300000);
    // Another thread-less call with instructions, such as a visual writer, is no quick thinking call.
    await call('Draw it.', { quick: undefined });
    t.mock.timers.tick(299999);
    assert.equal(runners()[0].child.exitCode, null, 'a quick call restarts the countdown');
    t.mock.timers.tick(1);
    assert.notEqual(runners()[0].child.exitCode, null, 'no runner process remains');
    assert.equal(text(await call('Explain "b".')), 'Authoritative original');
    assert.equal(runners().length, 2);
});

test('Claude quick thinking: a stopped call frees the runner and a fresh one waits for the next call', async (t) => {
    const { claude, runners, call } = setup(t);
    claude.keepRunner(true);
    const controller = new AbortController(),
        events = [];
    await claude.generate(
        {
            model: 'haiku',
            effort: null,
            thread: null,
            quick: true,
            instructions: 'Brief.',
        },
        'Explain "a".',
        (e) => {
            events.push(e);
            controller.abort();
        },
        () => {},
        controller.signal,
    );
    assert.deepEqual(events.at(-1), { type: 'status', status: 'interrupted' });
    assert.notEqual(runners()[0].child.exitCode, null);
    assert.equal(runners().length, 2, 'started again ahead of the next call');
    assert.equal((await call('Explain "b".')).at(-1).status, 'completed');
    assert.equal(runners().length, 2);
});
