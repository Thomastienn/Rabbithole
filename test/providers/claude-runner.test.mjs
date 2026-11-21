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
                urgent: true,
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
    claude.ready(true);
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
    claude.ready(true);
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
    claude.ready(true);
    let backgroundDone = false;
    // A background call (no learner waiting) starts its own process; this one holds until released.
    const background = call(
        'Mark every term\n' +
            JSON.stringify({ question: 'slow suggestions', answer: 'x', knownConcepts: {} }),
        { urgent: undefined, quick: true },
    ).then(() => (backgroundDone = true));
    await settle();
    const own = launches.find((l) => l.args.includes('--session-id'));
    assert.ok(own, 'the background call started its own process');
    assert.equal(text(await call('Explain "a".')), 'Authoritative original');
    assert.equal(backgroundDone, false, 'the brief finished while the background call ran');
    assert.equal(runners().length, 1);
    own.child.release();
    await background;
});

test('Claude quick thinking: the runner closes after 10 minutes without a quick call, and the next call still works', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { claude, runners, call, text } = setup(t);
    claude.ready(true);
    await call('Explain "a".');
    await settle();
    t.mock.timers.tick(300000);
    // Another thread-less call with instructions, such as a visual writer, is no quick thinking call.
    await call('Draw it.', { urgent: undefined, quick: undefined });
    t.mock.timers.tick(299999);
    assert.equal(runners()[0].child.exitCode, null, 'a quick call restarts the countdown');
    t.mock.timers.tick(1);
    assert.notEqual(runners()[0].child.exitCode, null, 'no runner process remains');
    assert.equal(text(await call('Explain "b".')), 'Authoritative original');
    assert.equal(runners().length, 2);
});

test('Claude quick thinking: a stopped call frees the runner and a fresh one waits for the next call', async (t) => {
    const { claude, runners, call } = setup(t);
    claude.ready(true);
    const controller = new AbortController(),
        events = [];
    await claude.generate(
        { model: 'haiku', effort: null, thread: null, urgent: true, instructions: 'Brief.' },
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
