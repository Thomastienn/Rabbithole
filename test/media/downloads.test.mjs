import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadManager } from '../../server/downloads.mjs';
import { videoTools } from '../../server/media/video-tools.mjs';
import { MANIM_VERSION, videoBrowser } from '../../server/media/manim.mjs';
import { open } from '../support/video-kit.mjs';

// A fake tool: ready() answers from `installed`; run() waits for the test to settle it.
function fakeTools(installed = {}, { uv = false } = {}) {
    const runs = [],
        pending = {};
    const tool = (id) => ({
        id,
        name: id.toUpperCase(),
        ready: async () => Boolean(installed[id]),
        run: ({ report }) =>
            new Promise((resolve, reject) => {
                runs.push(id);
                pending[id] = { resolve, reject, report };
            }),
    });
    const search = { ...tool('searxng'), requested: () => Boolean(installed.requested) };
    return {
        tools: [
            ...(uv ? [tool('uv')] : []),
            tool('manim'),
            tool('browser'),
            tool('python'),
            search,
        ],
        runs,
        pending,
    };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const states = (manager) => manager.list().map((d) => `${d.id}:${d.state}`);
const addonStates = (manager) =>
    Object.fromEntries(manager.addons().map((a) => [a.id, `${a.state}:${a.percent}`]));
const addonsFile = () => join(mkdtempSync(join(tmpdir(), 'tt-addons-')), 'addons.json');

test('nothing downloads after setup; video tools queue offline Python first and run one at a time', async () => {
    const { tools, runs, pending } = fakeTools();
    const manager = downloadManager(tools, { file: addonsFile() });
    const events = [];
    manager.subscribe((list) => events.push(list));
    await manager.start();
    assert.deepEqual(runs, [], 'no add-on downloads unless the learner installs it');
    const { name, enables, size, ...video } = manager.addons()[0];
    assert.ok(name && enables && size > 0, 'an add-on says what it is and how big');
    assert.deepEqual(video, {
        id: 'video-tools',
        dependency: 'offline-python',
        state: 'not-installed',
        percent: null,
    });
    assert.equal(manager.videoWaiting(), "Video tools aren't installed (about 500 MB).");
    assert.equal(await manager.install('video-tools'), true);
    await tick();
    assert.deepEqual(states(manager), ['python:running', 'manim:queued', 'browser:queued']);
    assert.deepEqual(runs, ['python'], 'offline Python first, one at a time');
    pending.python.report({ percent: 50 });
    assert.deepEqual(addonStates(manager), {
        'video-tools': 'downloading:0',
        'offline-python': 'downloading:50',
        'web-search': 'not-installed:null',
    });
    pending.python.resolve();
    await tick();
    pending.manim.report({ percent: 40.2 });
    assert.equal(manager.list()[1].percent, 40);
    assert.equal(manager.videoWaiting(), 'Video tools are still downloading (20%).');
    assert.equal(addonStates(manager)['video-tools'], 'downloading:20');
    pending.manim.resolve();
    await tick();
    assert.deepEqual(runs, ['python', 'manim', 'browser']);
    pending.browser.report({ bytes: 5e6, total: 1e8, percent: 5 });
    assert.deepEqual(
        { bytes: manager.list()[2].bytes, total: manager.list()[2].total },
        { bytes: 5e6, total: 1e8 },
    );
    pending.browser.resolve();
    await manager.idle();
    assert.deepEqual(addonStates(manager), {
        'video-tools': 'installed:null',
        'offline-python': 'installed:null',
        'web-search': 'not-installed:null',
    });
    assert.equal(manager.videoWaiting(), null);
    assert.ok(events.length > 3, 'every change streams');
    manager.seen();
    assert.deepEqual(manager.list(), [], 'opening the list once clears ready downloads');
    assert.equal(await manager.install('nothing'), false, 'an unknown add-on is refused');
});

test('a failed download keeps its message until the add-on is installed again', async () => {
    const { tools, runs, pending } = fakeTools({ browser: true, python: true });
    const manager = downloadManager(tools);
    await manager.install('video-tools');
    await tick();
    pending.manim.reject(new Error('Manim setup requires uv.'));
    await manager.idle();
    assert.deepEqual(manager.list(), [
        {
            id: 'manim',
            name: 'MANIM',
            state: 'failed',
            bytes: null,
            total: null,
            percent: null,
            error: 'Manim setup requires uv.',
        },
    ]);
    assert.equal(manager.addons()[0].state, 'failed');
    assert.equal(manager.addons()[0].error, 'Manim setup requires uv.');
    manager.seen();
    assert.equal(manager.list().length, 1, 'a failure is not cleared by opening the list');
    assert.equal(manager.retry('python'), false, 'only a failed download retries');
    await manager.install('video-tools');
    await tick();
    assert.deepEqual(runs, ['manim', 'manim'], 'only the failed tool runs again');
    assert.deepEqual(states(manager), ['manim:running']);
    pending.manim.resolve();
    await manager.idle();
    assert.deepEqual(states(manager), ['manim:ready']);
    assert.equal(manager.addons()[0].state, 'installed');
});

test('installed add-ons are remembered: a stopped or outdated one updates on the next launch, a current one does nothing', async () => {
    const file = addonsFile(),
        installed = { python: true };
    const first = fakeTools(installed);
    const before = downloadManager(first.tools, { file });
    await before.install('video-tools');
    await tick();
    first.pending.manim.report({ percent: 70 });
    before.stop();
    first.pending.manim.reject(new Error('aborted'));
    await tick();
    assert.equal(before.list()[0].state, 'running', 'a stopped download is not reported failed');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), ['offline-python', 'video-tools']);

    // The browser was installed, but an app update now needs a newer one.
    const next = fakeTools(installed);
    const after = downloadManager(next.tools, { file });
    void after.start();
    await tick();
    assert.deepEqual(states(after), ['manim:running', 'browser:queued']);
    assert.equal(after.list()[0].percent, null);
    assert.ok(after.list()[0].update, 'an installed add-on downloading again is an update');
    assert.deepEqual(addonStates(after), {
        'video-tools': 'updating:0',
        'offline-python': 'installed:null',
        'web-search': 'not-installed:null',
    });
    assert.ok(!next.runs.includes('searxng'), 'an add-on never installed is never queued');
    after.stop();

    const current = fakeTools({ manim: true, browser: true, python: true });
    await downloadManager(current.tools, { file }).start();
    assert.deepEqual(current.runs, [], 'an add-on whose versions match does nothing on launch');
});

test('routes stream the list, install and retry add-ons, retry failures and mark seen; a waiting video installs its tools and renders once they are ready', async (t) => {
    const { tools, pending } = fakeTools({ python: true });
    const downloads = downloadManager(tools);
    let planned = 0;
    const env = await open(
        {
            generate: async () => {
                planned++;
                throw new Error('Planning stops here.');
            },
        },
        { downloads },
    );
    t.after(env.close);
    await (await env.post('/api/setup')).json();
    await downloads.idle();
    assert.deepEqual(downloads.list(), [], 'nothing downloads after setup');
    const listed = await (await env.get('/api/downloads/addons')).json();
    assert.deepEqual(
        listed.map((a) => `${a.id}:${a.state}`),
        ['video-tools:not-installed', 'offline-python:installed', 'web-search:not-installed'],
    );
    assert.equal((await env.post('/api/downloads/addons/nothing')).status, 404);

    const tree = env.store.create('Video', 'codex');
    const message = env.store.message(tree.id, 'assistant', 'Reply.', 'completed');
    const artifact = env.store.pendingArtifact(
        tree.id,
        message,
        'Title',
        'Planned.',
        'video',
        '{"request":"Make a video."}',
    );
    const card = `/api/trees/${tree.id}/artifacts/${artifact.id}`;
    const ask = async () => {
        assert.equal((await env.post(`${card}/retry`)).status, 200);
        await env.app.settled(artifact.id);
        return env.store.artifact(tree.id, artifact.id);
    };
    env.store.finishVideo(tree.id, artifact.id, artifact.attempt, {}, 'Earlier failure.');
    const kept = await ask();
    assert.equal(kept.status, 'failed', 'the video is kept');
    assert.equal(kept.error, "Video tools aren't installed (about 500 MB).");
    assert.deepEqual((await (await env.get('/api/state')).json()).videos, []);

    const installing = await (await env.post(`${card}/install`)).json();
    assert.equal(installing.error, 'Video tools are still downloading (0%).');
    assert.equal(downloads.addons()[0].state, 'downloading');
    assert.deepEqual(
        (await (await env.get('/api/state')).json()).videos,
        [tree.id],
        'a waiting card polls while its tools download',
    );
    await tick();
    const stream = await env.get('/api/downloads');
    assert.equal(stream.headers.get('content-type'), 'text/event-stream');
    const reader = stream.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.deepEqual(
        JSON.parse(first.replace(/^data: /, '')).map((d) => d.state),
        ['running', 'queued'],
    );
    await reader.cancel();

    pending.manim.report({ percent: 80 });
    assert.equal(
        (await (await env.get(card)).json()).error,
        'Video tools are still downloading (40%).',
        'the card shows the download as it is now',
    );
    assert.equal((await ask()).error, 'Video tools are still downloading (40%).');

    pending.manim.reject(new Error('Network down.'));
    await tick();
    assert.equal((await env.post('/api/downloads/browser/retry')).status, 409);
    const retried = await (await env.post('/api/downloads/manim/retry')).json();
    assert.deepEqual(
        retried.map((d) => d.state),
        ['queued', 'running'],
    );
    pending.browser.reject(new Error('Network down.'));
    await tick();
    const again = await (await env.post('/api/downloads/addons/video-tools/retry')).json();
    assert.equal(again[0].state, 'downloading');
    pending.manim.resolve();
    await tick();
    assert.equal(planned, 0, 'nothing renders before every tool is ready');
    pending.browser.resolve();
    await downloads.idle();
    await env.app.settled(artifact.id);
    assert.equal(planned, 1, 'the waiting video renders without being asked again');
    assert.doesNotMatch(env.store.artifact(tree.id, artifact.id).error, /^Video tools /);
    assert.deepEqual(await (await env.post('/api/downloads/seen')).json(), []);
});

test('web search installs once on request; a folder from before add-ons queues it on launch', async () => {
    const { tools, runs, pending } = fakeTools({ manim: true, browser: true, python: true });
    const downloads = downloadManager(tools);
    await downloads.start();
    assert.deepEqual(runs, [], 'a fresh install does not download web search');
    await downloads.install('web-search');
    await downloads.install('web-search');
    await tick();
    assert.deepEqual(runs, ['searxng'], 'installing again while listed is a no-op');
    pending.searxng.resolve();
    await downloads.idle();
    assert.deepEqual(states(downloads), ['searxng:ready']);

    const interrupted = fakeTools({ manim: true, browser: true, python: true, requested: true });
    const again = downloadManager(interrupted.tools);
    void again.start();
    await tick();
    assert.deepEqual(states(again), ['searxng:running'], 'a cut-short request re-queues on launch');
    again.stop();
});

test('tools already in the tool root count as installed and never download; web search can still be queued', async () => {
    const root = '/opt/rabbithole/tools',
        browser = videoBrowser(root, 'linux');
    const tools = videoTools({
        root,
        platform: 'linux',
        probe: () => ({ status: 0, stdout: `${MANIM_VERSION}\n` }),
        check: async () => true,
        exists: (file) => file === browser,
    });
    const { tools: fake, runs, pending } = fakeTools();
    const downloads = downloadManager([...tools, fake.find((t) => t.id === 'searxng')]);
    await downloads.start();
    assert.deepEqual(
        downloads.addons().map((a) => a.state),
        ['installed', 'installed', 'not-installed'],
    );
    await downloads.install('video-tools');
    assert.deepEqual(downloads.list(), [], 'no video tool is queued');
    await downloads.install('web-search');
    await tick();
    assert.deepEqual(runs, ['searxng']);
    pending.searxng.resolve();
    await downloads.idle();
    assert.deepEqual(states(downloads), ['searxng:ready']);

    const missing = videoTools({ root, platform: 'win32', exists: (file) => file === browser });
    assert.equal(
        await missing.find((t) => t.id === 'browser').ready(),
        false,
        'the Windows browser is looked up at its own path',
    );
});

test('installs asked for at the same time queue each tool once', async () => {
    const { tools, runs, pending } = fakeTools({ python: true, browser: true });
    const manager = downloadManager(tools);
    void manager.start();
    await Promise.all([manager.install('video-tools'), manager.install('video-tools')]);
    await tick();
    pending.manim.resolve();
    await tick();
    assert.deepEqual(runs, ['manim']);
});

test('offline Python installs uv first, which video tools then share', async () => {
    const { tools, runs, pending } = fakeTools({}, { uv: true });
    const manager = downloadManager(tools);
    await manager.install('offline-python');
    await tick();
    assert.deepEqual(states(manager), ['uv:running', 'python:queued']);
    pending.uv.resolve();
    await tick();
    pending.python.resolve();
    await manager.idle();
    await manager.install('video-tools');
    await tick();
    assert.deepEqual(runs, ['uv', 'python', 'manim'], 'uv is not downloaded twice');
});
