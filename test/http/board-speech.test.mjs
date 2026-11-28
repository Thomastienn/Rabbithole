import { test } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../support/diagram-kit.mjs';
import { notify } from '../support/events.mjs';
import { boardProvider, messages, opened, setup } from '../support/board-kit.mjs';

test('board: the first sentence is spoken alone, then sentences join until a pause, 4 sentences or the reply end, one group ahead of playback', async (t) => {
    const provider = boardProvider([
        [
            '> One.\n> Two.\n> Three.\npause 1\n> Four.\n> Five.\n> Six.\n> Seven.\n> Eight.\n> Nine.\n',
        ],
    ]);
    const speech = { warmed: 0, spoken: [], closed: 0 };
    const client = {
        warm: () => speech.warmed++,
        async speak(text, chunk) {
            speech.spoken.push(text);
            notify();
            chunk(Buffer.from(`${text} a`));
            chunk(Buffer.from(`${text} b`));
            // The last group's words cannot be matched, so it falls back to character shares.
            if (text.startsWith('Eight')) return [{ text: 'Ate', at: 0 }];
            return text.split(' ').map((word, i) => ({ text: word, at: i * 1000 + 100 }));
        },
        close: () => (speech.closed++, notify()),
    };
    const { connect } = await setup(t, provider, { app: { speech: () => client } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const of = (type, id) => board.events.filter((e) => e.type === type && (!id || e.id === id));
    await until(() => of('sentence').length === 9);
    const sentences = of('sentence');
    assert.equal(speech.warmed, 1, 'the socket opens as the turn starts');
    assert.ok(sentences.every((s) => s.voiced));
    const ids = sentences.map((s) => s.id);
    const heard = async (i) => {
        await until(() => of('audio-end', ids[i]).length);
        return of('audio', ids[i]).map((e) => e.audio);
    };
    assert.deepEqual(await heard(0), ['One. a', 'One. b']);
    assert.deepEqual(speech.spoken, ['One.'], 'the next group waits for this one to play');
    board.send({ type: 'progress', sentence: ids[0], phase: 'start' });
    assert.deepEqual(
        await heard(1),
        ['Two. Three. a', 'Two. Three. b'],
        'one clip under its first id',
    );
    assert.deepEqual(of('offsets', ids[1]), [
        { type: 'offsets', id: ids[1], ids: ids.slice(1, 3), at: [0, 1100] },
    ]);
    assert.deepEqual(speech.spoken, ['One.', 'Two. Three.'], 'a pause closes its group');
    board.send({ type: 'progress', sentence: ids[1], phase: 'start' });
    await heard(3);
    assert.equal(speech.spoken.at(-1), 'Four. Five. Six. Seven.', 'a group stops at 4');
    assert.deepEqual(of('offsets', ids[3])[0].at, [0, 1100, 2100, 3100]);
    board.send({ type: 'progress', sentence: ids[3], phase: 'start' });
    await heard(7);
    assert.equal(speech.spoken.at(-1), 'Eight. Nine.', 'the reply end closes the last');
    assert.deepEqual(of('offsets', ids[7])[0].share, [0, 6 / 11]);
    assert.equal(of('audio-end', ids[8]).length, 0, 'a joined sentence has no audio of its own');
    for (const id of ids) board.send({ type: 'progress', sentence: id, phase: 'start' });
    for (const id of ids) board.send({ type: 'progress', sentence: id, phase: 'end' });
    await board.next('state', (e) => e.state === 'idle');
    board.ws.close();
    await until(() => speech.closed);
});

test('board: cutting in during a joined group stops its speech and saves only the sentences shown', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n> Three.\n'], ['> Next.\n']]);
    const stopped = [];
    const client = {
        warm() {},
        async speak(text, chunk, signal) {
            notify();
            chunk(Buffer.from(text));
            if (text === 'One.') return [];
            await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
            );
            stopped.push(text);
            throw signal.reason;
        },
        close() {},
    };
    const { connect, env, id } = await setup(t, provider, { app: { speech: () => client } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const of = (type, id) => board.events.filter((e) => e.type === type && (!id || e.id === id));
    await until(() => of('sentence').length === 3);
    const [one, two] = of('sentence').map((s) => s.id);
    board.send({ type: 'progress', sentence: one, phase: 'start' });
    await until(() => of('audio', two).length);
    board.send({ type: 'progress', sentence: two, phase: 'start' });
    board.send({ type: 'ask', text: 'Wait, why?' });
    await until(() => stopped.length);
    assert.deepEqual(stopped, ['Two. Three.']);
    const reply = () => messages(env, id).find((m) => m.role === 'assistant');
    await until(() => reply().status === 'interrupted');
    assert.equal(reply().text, 'One.\nTwo.', 'one line per sentence heard');
});

test('board: a key sentence is said at -15%, one drawing math or an equation at -10%, one that is both at -15%, the rest at +0%, and a change of rate ends a joined group', async (t) => {
    const provider = boardProvider([
        [
            '> Plain.\n!> Key.\n> Math.\nm1 math "x^2" at 400,450\n!> Both.\nm2 math "y^2" at 1200,450\n' +
                '> Formula.\np1 page\nx1 equation "E = m c^2" at 800,450\n> Symbol.\ny1 symbol "E" means="energy" in x1\n',
        ],
    ]);
    const rates = [];
    const client = {
        warm() {},
        async speak(text, chunk, signal, rate) {
            rates.push([text, rate]);
            notify();
            chunk(Buffer.from(text));
        },
        close() {},
    };
    const { connect } = await setup(t, provider, { app: { speech: () => client } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const sentences = [];
    // The groups voiced by each sentence's start: Formula and Symbol share a rate, so they join.
    const groups = [1, 2, 3, 4, 5, 5];
    for (let i = 0; i < 6; i++) {
        const sentence = await board.next('sentence');
        sentences.push(sentence);
        await until(() => rates.length >= groups[i]);
        for (const phase of ['start', 'end'])
            board.send({ type: 'progress', sentence: sentence.id, phase });
    }
    await board.next('state', (e) => e.state === 'idle');
    assert.deepEqual(rates, [
        ['Plain.', 0],
        ['Key.', -15],
        ['Math.', -10],
        ['Both.', -15],
        ['Formula. Symbol.', -10],
    ]);
    assert.deepEqual(
        sentences.map((s) => [s.key, s.rate]),
        [
            [undefined, 0],
            [true, -15],
            [undefined, -10],
            [true, -15],
            [undefined, -10],
            [undefined, -10],
        ],
        'the board gets the key mark and rate for its pause and caption estimate',
    );
});

test('board: failed speech is retried once, then the turn carries on in captions with a notice', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n> Three.\npause 1\n> Four.\n']]);
    const spoken = [];
    // One fails once then speaks; the group of Two and Three fails both tries.
    const failures = { 'One.': 1, 'Two. Three.': 2 };
    const client = {
        warm() {},
        async speak(text, chunk) {
            spoken.push(text);
            notify();
            if (failures[text]-- > 0) throw new Error('edge-tts sent no audio within 2500 ms');
            chunk(Buffer.from(`${text} a`));
        },
        close() {},
    };
    const { connect } = await setup(t, provider, { app: { speech: () => client } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const of = (type, id) => board.events.filter((e) => e.type === type && (!id || e.id === id));
    await until(() => of('sentence').length === 4);
    const [one, two, three, four] = of('sentence').map((s) => s.id);
    await until(() => of('audio-end', one).length);
    assert.deepEqual(
        of('audio', one).map((e) => e.audio),
        ['One. a'],
        'the retry speaks',
    );
    assert.equal(of('notice').length, 0);
    board.send({ type: 'progress', sentence: one, phase: 'start' });
    await until(() => of('audio-end', three).length);
    assert.equal(of('audio', two).length, 0, 'it shows as captions only');
    assert.equal(of('audio-end', two).length, 1, 'each of its sentences plays by its estimate');
    assert.deepEqual(
        of('notice').map((e) => e.notice),
        ['The voice is unavailable, so the tutor carries on in captions.'],
    );
    board.send({ type: 'progress', sentence: two, phase: 'start' });
    await until(() => of('audio-end', four).length);
    assert.deepEqual(
        spoken,
        ['One.', 'One.', 'Two. Three.', 'Two. Three.'],
        'the rest of the turn stays silent',
    );
    for (const id of [one, two, three, four]) {
        board.send({ type: 'progress', sentence: id, phase: 'start' });
        board.send({ type: 'progress', sentence: id, phase: 'end' });
    }
    await until(() => of('state').at(-1)?.state === 'idle');
    assert.equal(of('notice').length, 1, 'one notice per turn');
});

test('board: a filler plays only when a turn’s first audio is over 1 s late, never the same twice, and is not saved', async (t) => {
    const provider = boardProvider([['> One.\n'], ['> Two.\n'], ['> Three.\n']]);
    let release = Promise.withResolvers();
    const client = {
        warm() {},
        async speak(text, chunk) {
            if (text !== 'Three.') await release.promise;
            chunk(Buffer.from(text));
        },
        close() {},
    };
    // A fake clock: the test says when 1 s has passed.
    const timers = [];
    const boardClock = {
        setTimeout: (run) => (timers.push(run), run),
        clearTimeout: (run) => timers.includes(run) && timers.splice(timers.indexOf(run), 1),
    };
    const fillers = Promise.resolve([Buffer.from('hmm'), Buffer.from('okay'), Buffer.from('ah')]);
    // A fixed pick: without the no-repeat rule both slow turns would play 'hmm'.
    t.mock.method(Math, 'random', () => 0);
    const { env, id, connect } = await setup(t, provider, {
        app: { speech: () => client, fillers: () => fillers, boardClock },
    });
    const board = connect();
    await opened(board.ws);
    // Every filler frame the board receives, which board.next would otherwise splice away.
    const played = [];
    board.ws.on('message', (data, binary) => {
        if (binary && data.subarray(1, 1 + data[0]).toString() === 'filler')
            played.push(data.subarray(1 + data[0]).toString());
    });
    const turn = async (question, slow) => {
        board.send({ type: 'ask', text: question });
        await board.next('state', (e) => e.state === 'thinking');
        const sentence = await board.next('sentence');
        if (!slow) await board.next('audio-end', (e) => e.id === sentence.id);
        timers.splice(0).forEach((run) => run());
        if (slow) {
            await board.next('audio-end', (e) => e.id === 'filler');
            release.resolve();
            release = Promise.withResolvers();
            await board.next('audio-end', (e) => e.id === sentence.id);
        }
        board.send({ type: 'progress', sentence: sentence.id, phase: 'start' });
        board.send({ type: 'progress', sentence: sentence.id, phase: 'end' });
        await board.next('state', (e) => e.state === 'idle');
    };
    await turn('Why?', true);
    await turn('And then?', true);
    await turn('Last?', false);
    assert.deepEqual(
        played,
        ['hmm', 'okay'],
        'one filler per slow turn, never the same twice in a row, none once audio has started',
    );
    assert.deepEqual(
        messages(env, id)
            .filter((m) => m.role === 'assistant')
            .map((m) => m.text),
        ['One.', 'Two.', 'Three.'],
        'fillers are not saved in the reply',
    );
});

test('board: a Voice language other than English speaks, prompts and recognizes in it, without English fillers', async (t) => {
    const provider = boardProvider([]);
    const asked = { speech: [], fillers: [], hearing: [], downloaded: [] };
    const hearing = (progress, lang) => {
        asked.hearing.push(lang);
        return Promise.resolve({ detector: () => async () => 0, recognize: async () => '' });
    };
    hearing.downloaded = async (lang) => (asked.downloaded.push(lang), false);
    const client = { warm() {}, async speak() {}, close() {} };
    const { env, connect } = await setup(t, provider, {
        app: {
            speech: (lang) => (asked.speech.push(lang), client),
            fillers: (lang) => (asked.fillers.push(lang), null),
            hearing,
        },
    });
    const { csrf } = await (await env.get('/api/state')).json();
    const board = connect(`?csrf=${csrf}&lang=de`);
    await opened(board.ws);
    await until(() => provider.boards[0]);
    assert.match(
        provider.boards[0].options.system,
        /VOICE LANGUAGE: the learner speaks German\. Say every sentence and write every board label in German\./,
    );
    board.send({ type: 'mic', on: true });
    assert.equal((await board.next('mic')).status, 'on');
    assert.deepEqual(asked, { speech: ['de'], fillers: ['de'], hearing: ['de'], downloaded: [] });

    // A language outside the voice table is English, with no language line in the prompt.
    const other = connect(`?csrf=${csrf}&lang=xx`);
    await opened(other.ws);
    await until(() => provider.boards[1]);
    assert.deepEqual(asked.speech, ['de', 'en']);
    assert.doesNotMatch(provider.boards[1].options.system, /VOICE LANGUAGE/);

    // Settings asks whether the language's speech models are on this computer.
    const status = await (await env.get('/api/settings/voice-models?lang=de')).json();
    assert.deepEqual([status, asked.downloaded], [{ downloaded: false }, ['de']]);
});
