// Board release check (Rabbithole-brd.18): one scripted board in real Chromium with a fake model and fake speech.
// A typed question, a reply that draws shapes, math and a component while it speaks, a typed cut-in, and the
// saved replies in normal chat.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
    session = `board-${process.pid}`,
    dir = mkdtempSync(join(tmpdir(), 'board-'));
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression);

// Fake speech: real WebM Opus tones, the format edge-tts sends the board. Sentences last 1.2 s, and the
// third 20 s, so the cut-in lands while it plays.
const tone = async (seconds) => {
    const file = join(dir, `tone-${seconds}.webm`);
    await run('ffmpeg', [
        ...['-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`],
        ...['-c:a', 'libopus', '-f', 'webm', file],
    ]);
    return readFileSync(file);
};
const short = await tone(1.2),
    long = await tone(20),
    spoken = [];
const speech = () => ({
    warm() {},
    async speak(text, chunk) {
        spoken.push(text);
        const clip = text.startsWith('On a graph') ? long : short;
        for (let at = 0; at < clip.length; at += 2048) chunk(clip.subarray(at, at + 2048));
    },
    close() {},
});

// The fake model: each board question streams the next script, line by line.
const scripts = [
    [
        '> A ball leaves your hand.\n',
        'ball circle "ball" at 300,450 r=60\n',
        '> Its height follows one formula.\n',
        'h math "h = v t - \\frac{g t^2}{2}" at 1000,160 size=m\n',
        '> On a graph it makes an arch.\n',
        'a1 axes at 1000,560 w=900 h=500 x=0..4 y=0..10\n',
        'arc plot on a1 y=8*x-2*x^2\n',
        '> Then it lands.\n',
        'land dot at 1400,800\n',
        '> And it rolls to a stop.\n',
    ],
    ['> Gravity pulls it down the whole time.\n', 'g arrow 300,300 -> 300,420 look=focus\n'],
];
const asked = [];
const fake = {
    models: async () => [{ model: 'sonnet', label: 'Sonnet', isDefault: true, efforts: [] }],
    model: async (tree) => tree.model ?? 'sonnet',
    board: () => ({
        thread: 'board-session',
        open() {},
        close() {},
        async ask(text, emit, signal) {
            asked.push(text);
            for (const line of scripts.shift() ?? []) {
                if (signal.aborted) return { status: 'interrupted' };
                emit({ type: 'delta', text: line });
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            return {
                status: 'completed',
                usage: { input: 10, output: 20, cacheRead: 0, thinking: 0 },
            };
        },
    }),
};

const store = new Store(join(dir, 'trees.sqlite'));
const tree = store.create('Thrown ball', 'claude', 'sonnet');
store.message(tree.id, 'user', 'What happens to a thrown ball?', 'completed');
store.message(tree.id, 'assistant', 'It rises, slows, and falls back.', 'completed');
const app = createApp({
    store,
    auth: { status: () => ({ connected: true }) },
    provider: fake,
    providers: { claude: fake },
    defaultProvider: 'claude',
    dir,
    speech,
    log: () => {},
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const composer = '.board-composer [aria-label="Your question"]';
const caption = `document.querySelector('.board-rail-list')?.textContent ?? ''`;
const type = async (text) => {
    await b('click', composer);
    await b('keyboard', 'type', text);
    await b('press', 'Enter');
};
try {
    await b('set', 'viewport', '1440', '900');
    await b('open', `http://127.0.0.1:${app.server.address().port}`);
    await b('set', 'media', 'light');
    await b('wait', '[aria-label="Open Thrown ball"]');
    await b('click', '[aria-label="Open Thrown ball"]');
    await b('wait', '.focused-chat');
    // Counts every tutor sentence the browser actually starts playing aloud.
    await ev(
        `window.voiced = 0; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.addEventListener('playing', () => window.voiced++, { once: true }); return play.call(this); }; true`,
    );
    await b('find', 'role', 'switch', 'click', '--name', 'Board');
    await b('wait', composer);

    // A typed question: the tutor speaks and draws a shape, math and a graph in step with its words.
    await type('How does a thrown ball fly?');
    await wait(`(${caption}).includes('On a graph it makes an arch.')`);
    await wait(
        `!!document.querySelector('.board .board-math .katex') && document.querySelectorAll('.board .board-axis').length > 0 && [...document.querySelectorAll('.board .board-text')].some(t => t.textContent === 'ball')`,
    );
    assert.ok((await ev('window.voiced')) >= 2, 'the first sentences play aloud');
    assert.equal(await ev(`!!document.querySelector('.board-notice')`), false, 'no notice');

    // A typed cut-in while the third sentence plays: the tutor stops and answers on the same board.
    await type('Why does it curve?');
    await wait(`(${caption}).includes('Gravity pulls it down the whole time.')`);
    await wait(`!document.querySelector('.board-state')`);
    assert.equal(asked.length, 2);
    assert.match(
        asked[1],
        /cut off.*On a graph it makes an arch\./s,
        'the model hears where it was cut',
    );
    assert.ok(!(await ev(caption)).includes('Then it lands.'), 'unheard sentences are dropped');
    assert.ok(
        await ev(
            `!!document.querySelector('.board .board-item.focus') && !!document.querySelector('.board .board-math .katex')`,
        ),
        'the answer draws its arrow on the same board',
    );

    // Saved: the cut reply keeps the sentences heard, the answer is whole, both as board replies.
    const [, , q1, r1, q2, r2] = store.tree(tree.id).messages;
    assert.deepEqual(
        [q1, r1, q2, r2].map((m) => [m.role, m.status]),
        [
            ['user', 'completed'],
            ['assistant', 'interrupted'],
            ['user', 'completed'],
            ['assistant', 'completed'],
        ],
    );
    assert.equal(
        r1.text,
        'A ball leaves your hand.\nIts height follows one formula.\nOn a graph it makes an arch.',
    );
    assert.equal(r2.text, 'Gravity pulls it down the whole time.');
    assert.ok(
        spoken.includes('On a graph it makes an arch.') &&
            !spoken.includes('And it rolls to a stop.'),
    );

    // Normal chat shows the saved board replies with their text and a snapshot.
    await b('find', 'role', 'switch', 'click', '--name', 'Board');
    await wait(`!document.querySelector('.board-composer')`);
    await b('wait', '--text', 'Gravity pulls it down the whole time.');
    assert.ok(await ev(`document.querySelectorAll('.focused-chat .board-snapshot').length === 2`));
    console.log(
        'PASS: a scripted board plays in Chromium: it speaks aloud, draws a shape, math and a graph, takes a typed cut-in that drops the unheard sentences and tells the model where it was cut, answers on the same board, and saves both replies, shown in normal chat with snapshots.',
    );
} finally {
    await b('close').catch(() => {});
    app.stop();
    store.close();
}
