import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mediaPath } from '../../server/media/videos.mjs';
import { SANDBOX } from '../../server/media/video-sandbox.mjs';
import {
    task,
    directive,
    videoResponse,
    mp4,
    complete,
    until,
    open,
    sandboxed,
} from '../support/video-kit.mjs';

test('inline video exposes its phase and position, keeps inputs private, then serves seekable media once exported', async () => {
    let release;
    const composing = new Promise((r) => {
        release = r;
    });
    const provider = {
        generate: async (tree, text, emit) => {
            if (tree.role === 'video') {
                await composing;
                return complete(emit, videoResponse(tree));
            }
            complete(emit, 'Before.\n' + directive + '\n\nAfter.');
        },
    };
    const env = await open(provider);
    try {
        const tree = env.store.create('Video', 'codex'),
            other = env.store.create('Other', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of this.' })
        ).text();
        const state = async () => (await env.get('/api/state')).json();
        const artifact = async (id) =>
            (await (await env.get(`/api/trees/${id}`)).json()).artifacts[0];
        assert.deepEqual((await state()).videos, [tree.id]);
        assert.deepEqual((await state()).active, []);
        const pending = await artifact(tree.id);
        assert.equal(pending.status, 'pending');
        assert.equal(pending.position, 8);
        assert.equal(pending.phase, 'planning');
        assert.ok(pending.startedAt <= Date.now() && pending.phaseStartedAt >= pending.startedAt);
        for (const key of ['progress', 'input', 'attempt']) assert.equal(pending[key], undefined);
        const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
        assert.equal(saved.messages.at(-1).text, 'Before.\n\n\nAfter.');
        assert.equal(await artifact(other.id), undefined);
        const own = `/api/trees/${tree.id}/artifacts/${pending.id}`;
        assert.equal((await (await env.get(own)).json()).phase, 'planning');
        assert.equal((await env.get(`/api/trees/${other.id}/artifacts/${pending.id}`)).status, 404);
        const previews = await (await env.get(`/api/previews?id=${tree.id}&id=${other.id}`)).json();
        assert.deepEqual(previews[tree.id].at(-1).artifacts, [
            { id: pending.id, kind: 'video', title: task.title, status: 'pending' },
        ]);
        assert.ok(!previews[other.id].some((m) => m.artifacts));
        release();
        await until(() => env.store.artifact(tree.id, pending.id).status === 'ready');
        await env.app.settled();
        assert.deepEqual((await state()).videos, []);
        const ready = await artifact(tree.id);
        assert.equal(ready.status, 'ready');
        assert.equal(ready.phase, undefined);
        assert.equal(ready.progress, undefined);
        assert.equal(ready.position, pending.position);
        assert.equal(ready.exported, false);
        assert.equal(ready.available, undefined);
        // The map preview of a saved, unexported video reports it playable too.
        const [preview] = (await (await env.get(`/api/previews?id=${tree.id}`)).json())[tree.id].at(
            -1,
        ).artifacts;
        assert.deepEqual([preview.exported, preview.available], [false, undefined]);
        // An MP4 at the media path (an export, or a video saved before live saving) is served and counts as exported.
        const media = `/api/trees/${tree.id}/artifacts/${ready.id}/media`;
        assert.equal((await env.get(media)).status, 404);
        mkdirSync(join(env.dir, 'videos'), { recursive: true });
        writeFileSync(mediaPath(env.dir, ready.id), mp4);
        assert.equal((await artifact(tree.id)).exported, true);
        const whole = await env.get(media);
        assert.equal(whole.headers.get('accept-ranges'), 'bytes');
        assert.equal(Buffer.from(await whole.arrayBuffer()).length, mp4.length);
        const part = await fetch(whole.url, { headers: { Range: 'bytes=4-11' } });
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('content-range'), `bytes 4-11/${mp4.length}`);
        assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'ftypisom');
        const tail = await fetch(whole.url, { headers: { Range: 'bytes=-10' } });
        assert.equal(Buffer.from(await tail.arrayBuffer()).length, 10);
        assert.equal(
            (await fetch(whole.url, { headers: { Range: `bytes=${mp4.length}-` } })).status,
            416,
        );
    } finally {
        env.close();
    }
});

const repo = fileURLToPath(new URL('../..', import.meta.url));

test(
    'render sandbox hides home, app data, /run, /media and /mnt, blocks network and sockets, confines writes to the workspace',
    { skip: !sandboxed && 'bwrap or Remotion browser missing' },
    () => {
        const dir = mkdtempSync(join(tmpdir(), 'tt-sandbox-'));
        const workspace = join(dir, 'video-work', 'artifact', 'attempt');
        mkdirSync(workspace, { recursive: true });
        mkdirSync(join(workspace, 'public'));
        writeFileSync(join(workspace, 'public', 'narration.mp3'), 'OWNED AUDIO');
        writeFileSync(join(workspace, 'narration.json'), '{}');
        writeFileSync(join(dir, 'trees.sqlite'), 'LEARNING DATA');
        const probe = `const fs = require('fs'); const r = {};
    const tryIt = (k, f) => { try { f(); r[k] = 'allowed'; } catch { r[k] = 'denied'; } };
    tryIt('appData', () => fs.readFileSync(${JSON.stringify(join(dir, 'trees.sqlite'))}));
    tryIt('home', () => fs.readdirSync(${JSON.stringify(join(homedir(), '.claude'))}));
    tryIt('repo', () => fs.readFileSync(${JSON.stringify(join(repo, 'package.json'))}));
    tryIt('writeOutside', () => fs.writeFileSync('/usr/x', ''));
    r.hostFolders = ['/run', '/media', '/mnt'].filter((d) => fs.existsSync(d));
    tryIt('writeWorkspace', () => fs.writeFileSync('ok', ''));
    r.audio = fs.readFileSync('public/narration.mp3', 'utf8');
    tryIt('mutateAudio', () => fs.writeFileSync('public/narration.mp3', 'changed'));
    tryIt('mutateTiming', () => fs.writeFileSync('narration.json', 'changed'));
    r.env = Object.keys(process.env).sort().join(',');
    require('net').connect('/run/docker.sock').on('connect', () => { r.docker = 'allowed'; net(); }).on('error', () => { r.docker = 'denied'; net(); });
    const net = () => require('net').connect(443, '1.1.1.1').on('connect', () => { r.network = 'allowed'; done(); }).on('error', () => { r.network = 'denied'; done(); });
    function done() { console.log(JSON.stringify(r)); process.exit(0); }`;
        const run = spawnSync('bwrap', [...SANDBOX(workspace), process.execPath, '-e', probe], {
            encoding: 'utf8',
            env: {},
        });
        assert.deepEqual(JSON.parse(run.stdout), {
            appData: 'denied',
            home: 'denied',
            repo: 'denied',
            writeOutside: 'denied',
            hostFolders: [],
            writeWorkspace: 'allowed',
            audio: 'OWNED AUDIO',
            mutateAudio: 'denied',
            mutateTiming: 'denied',
            env: 'HOME,PATH,PWD,TEXMFVAR,TMPDIR',
            docker: 'denied',
            network: 'denied',
        });
    },
);
