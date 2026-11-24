import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyTurn } from '../../server/http/reply-turn.mjs';

// A clock whose timers run only when the test moves time on.
const fakeClock = () => {
    let now = 0;
    const timers = new Set();
    return {
        now: () => now,
        setTimeout: (run, ms) => {
            const timer = { run, at: now + ms };
            timers.add(timer);
            return timer;
        },
        clearTimeout: (timer) => timers.delete(timer),
        tick(ms) {
            now += ms;
            for (const timer of [...timers])
                if (timer.at <= now) {
                    timers.delete(timer);
                    timer.run();
                }
        },
    };
};

// A turn over a store that records every call; `overrides` answers the calls whose result matters.
const open = ({ saveEvery = 100, overrides = {}, stopping = false } = {}) => {
    const calls = [],
        events = [],
        clock = fakeClock(),
        controller = new AbortController();
    const record =
        (name, answer) =>
        (...args) => {
            calls.push([name, ...args]);
            return answer?.(...args);
        };
    const answers = {
        suggestionSettings: () => ({ enabled: true }),
        stopToolCalls: () => [],
        header: () => ({ model: 'm' }),
        live: () => true,
        ...overrides,
    };
    const store = new Proxy({}, { get: (_, name) => record(name, answers[name]) });
    const job = { controller };
    const ctx = {
        store,
        stopping,
        live: (artifact) => artifact,
        log: () => {},
        jobs: { get: () => null, remove: record('jobs.remove') },
        startVerdicts: record('startVerdicts'),
        noteSuggestions: record('noteSuggestions'),
        embedMessages: record('embedMessages'),
    };
    const turn = replyTurn(ctx, {
        id: 'c',
        tree: { provider: 'claude', model: 'm' },
        user: 'u',
        reply: 'r',
        body: { text: 'Q' },
        job,
        emit: (event) => events.push(event),
        saveEvery,
        clock,
    });
    // What the send route does around the model call.
    const run = async (generate) => {
        try {
            await turn.stream(generate);
        } catch (error) {
            turn.fail(error);
        } finally {
            turn.finish();
        }
    };
    const saves = () => calls.filter(([name]) => name === 'update').map((c) => c.slice(2));
    return { turn, run, calls, events, clock, controller, saves };
};
const delta = (text) => ({ type: 'delta', item: 'a', text });

test('partial text is saved at once, then at most once per interval, and the trailing tokens land when it elapses', async () => {
    const env = open();
    await env.run(async (onEvent) => {
        onEvent(delta('first '));
        env.clock.tick(10);
        onEvent(delta('second '));
        onEvent(delta('third'));
        assert.deepEqual(env.saves(), [['first ', 'streaming']]);
        env.clock.tick(89);
        assert.equal(env.saves().length, 1);
        env.clock.tick(1);
        assert.deepEqual(env.saves().at(-1), ['first second third', 'streaming']);
        onEvent({ type: 'status', status: 'completed' });
    });
    assert.deepEqual(env.saves().at(-1), ['first second third', 'completed', null]);
    assert.deepEqual(env.events.at(-1), { type: 'done', status: 'completed' });
});

test('a failed trailing save fails the reply where a provider error would', async () => {
    const env = open({
        overrides: {
            update: (id, text, status) => {
                if (text === 'first second' && status === 'streaming') throw new Error('disk full');
            },
        },
    });
    await env.run(async (onEvent) => {
        onEvent(delta('first '));
        onEvent(delta('second'));
        env.clock.tick(100);
        onEvent(delta(' third'));
    });
    const error = env.events.find((e) => e.type === 'error');
    assert.match(error.error, /^disk full/);
    assert.deepEqual(env.events.at(-1), { type: 'done', status: 'failed' });
});

test('suggestions, groundwork and next questions reach the learner as each marker closes', async () => {
    const env = open({ saveEvery: 0 });
    const seen = [];
    await env.run(async (onEvent) => {
        for (const piece of [
            '[[groundwork: Threads]]\n',
            'A [[mutex',
            ']] locks.\n',
            '[[next: Why?',
            ']]',
        ]) {
            onEvent(delta(piece));
            seen.push(
                env.events
                    .filter((e) => e.type === 'suggestions' || e.type === 'questions')
                    .map((e) => e.type),
            );
        }
        onEvent({ type: 'status', status: 'completed' });
    });
    assert.deepEqual(seen, [
        ['suggestions'],
        ['suggestions'],
        ['suggestions', 'suggestions'],
        ['suggestions', 'suggestions'],
        ['suggestions', 'suggestions', 'questions'],
    ]);
    const last = env.events.findLast((e) => e.type === 'suggestions').suggestions;
    assert.deepEqual(last.groundwork, ['Threads']);
    assert.deepEqual(
        last.passages.map((p) => p.text),
        ['mutex'],
    );
    assert.deepEqual(env.events.find((e) => e.type === 'questions').questions, ['Why?']);
    assert.ok(
        env.calls.some(
            ([name, , questions]) => name === 'nextQuestions' && questions[0] === 'Why?',
        ),
    );
});

test('a finished reply saves, measures, judges and notes in a fixed order before it is done', async () => {
    const env = open();
    await env.run(async (onEvent) => {
        onEvent(delta('Answer [[next: More?]]'));
        onEvent({ type: 'usage', usage: { input: 1, output: 2, cacheRead: 0 } });
        onEvent({ type: 'status', status: 'completed' });
    });
    const after = [
        'stopToolCalls',
        'update',
        'usage',
        'record',
        'finishModel',
        'observe',
        'startVerdicts',
        'nextQuestions',
        'noteSuggestions',
        'jobs.remove',
    ];
    const names = env.calls.map(([name]) => name).filter((name) => after.includes(name));
    assert.deepEqual(names.slice(names.indexOf('stopToolCalls')), after);
    assert.deepEqual(env.events.at(-1), { type: 'done', status: 'completed' });
});

for (const [who, stopping] of [
    ['learner', false],
    ['shutdown', true],
])
    test(`a reply stopped by the ${who} keeps its partial text`, async () => {
        const env = open({ stopping });
        await env.run(async (onEvent) => {
            onEvent(delta('Half an '));
            onEvent(delta('answer'));
            env.controller.abort();
        });
        assert.deepEqual(env.saves().at(-1), ['Half an answer', 'interrupted', who]);
        assert.deepEqual(env.events.at(-1), { type: 'done', status: 'interrupted' });
        assert.ok(!env.calls.some(([name]) => name === 'finishModel'));
    });
