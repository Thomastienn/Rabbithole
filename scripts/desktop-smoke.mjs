// The release workflow's smoke test of one desktop build: node scripts/desktop-smoke.mjs <resources>, where
// <resources> holds node, app and tools (desktop/stage, an extracted AppImage's or the installed Windows app's).
// Fixture data only: no model, no account and no network. Any failed check exits non-zero.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { serverUrl } from '../desktop/shell.mjs';

const resources = resolve(process.argv[2] ?? 'desktop/stage');
const windows = process.platform === 'win32';
const app = join(resources, 'app');
const data = mkdtempSync(join(tmpdir(), 'rabbithole-smoke-'));
// The environment the shell gives the server (desktop/main.mjs), set before the build's modules read it.
Object.assign(process.env, {
    RABBITHOLE_DATA_DIR: data,
    RABBITHOLE_TOOLS_DIR: join(resources, 'tools'),
    ...(windows && { RABBITHOLE_SANDBOX: join(resources, 'rabbithole-sandbox.exe') }),
});
const build = (path) => import(pathToFileURL(join(app, path)).href);
const step = (name) => console.log(`\nsmoke: ${name}`);

// A saved one-cut video, as a finished job leaves it, so the export renders it through the video sandbox.
const line = { text: 'Smoke test.', startMs: 0, endMs: 1000, startFrame: 0, endFrame: 30 };
const timing = {
    fps: 30,
    durationInFrames: 30,
    audioFrames: 24,
    sentences: [line],
    captions: [line],
};
const code = `import { AbsoluteFill } from 'remotion';
export default function Video() {
  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontSize: 96 }}>Smoke test</AbsoluteFill>;
}`;
const { Store } = await build('server/store.mjs');
const store = new Store(join(data, 'trees.sqlite'));
const tree = store.create('Smoke test', 'codex');
const message = store.message(tree.id, 'assistant', 'Here is a video.', 'completed');
const video = store.pendingArtifact(tree.id, message, 'Video', 'One cut.', 'video', '{}');
store.videoData(tree.id, video.id, video.attempt, {
    plan: { styleBrief: { paletteRoles: {} }, cuts: [{}] },
    cuts: [{ engine: 'remotion', code, timing, audited: true }],
});
store.finishVideo(tree.id, video.id, video.attempt, { description: 'One cut.', duration: 1 });
store.close();
const cut = join(data, 'video-work', video.id, video.attempt, 'cut-0');
mkdirSync(join(cut, 'public'), { recursive: true });
copyFileSync(
    new URL('../test/fixtures/narration.mp3', import.meta.url),
    join(cut, 'public', 'narration.mp3'),
);
writeFileSync(join(cut, 'narration.json'), JSON.stringify(timing));

step('start the bundled server on an empty data folder');
const server = spawn(
    join(resources, windows ? 'node.exe' : 'node'),
    [join(app, 'server', 'main.mjs'), '--port', '0'],
    { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);
const closed = new Promise((done) => server.once('close', done));
try {
    const origin = await new Promise((done, fail) => {
        for (const stream of [server.stdout, server.stderr])
            createInterface({ input: stream }).on('line', (text) => {
                console.log(text);
                const url = serverUrl(text);
                if (url) done(url);
            });
        server.once('error', fail);
        closed.then((code) => fail(new Error(`The server exited (${code}) before it listened.`)));
        setTimeout(
            () => fail(new Error('The server did not listen within 5 minutes.')),
            300000,
        ).unref();
    });
    const page = await fetch(origin + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>Rabbithole<\/title>/);
    const { trees, csrf } = await (await fetch(origin + '/api/state')).json();
    assert.deepEqual(
        trees.map((t) => t.title),
        ['Smoke test'],
    );
    // Every POST carries the token the page reads from /api/state (server/app.mjs).
    const post = {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json', 'x-rabbithole-csrf': csrf },
    };

    if (windows) {
        step('run the Windows sandbox setup');
        const setup = await fetch(origin + '/api/setup/sandbox', post);
        assert.deepEqual(await setup.json(), { windows: true, ready: true });
    }

    step('render the fixture cut through the video sandbox');
    const exporting = `${origin}/api/videos/${video.id}/export`;
    let state = await (await fetch(exporting, post)).json();
    for (const deadline = Date.now() + 600000; state.exporting && Date.now() < deadline;) {
        await new Promise((done) => setTimeout(done, 2000));
        state = await (await fetch(exporting)).json();
    }
    // The server accepts only an MP4 of the cut's 30 frames at 30 fps (server/media/video-export.mjs).
    assert.deepEqual(state, { exported: true });
    const mp4 = Buffer.from(
        await (await fetch(`${origin}/api/videos/${video.id}/media`)).arrayBuffer(),
    );
    assert.ok(mp4.length > 1024, 'the MP4 has content');
    assert.equal(mp4.toString('latin1', 4, 8), 'ftyp');

    step('run one run_python call in the sandbox');
    const { pythonTool } = await build('server/tools/python.mjs');
    const output = await pythonTool({ dir: data }).run(
        { code: 'import numpy\nprint(numpy.arange(4).sum())' },
        { conversation: 'smoke', signal: AbortSignal.timeout(120000) },
    );
    console.log(output);
    assert.match(output, /^Exit code: 0\n--- stdout ---\n6\r?\n/);
    console.log('\nsmoke: every check passed');
} finally {
    server.kill();
    await closed;
    rmSync(data, { recursive: true, force: true, maxRetries: 5 });
}
