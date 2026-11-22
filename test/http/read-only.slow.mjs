import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    chmodSync,
    cpSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    realpathSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { launch } from '../support/startup-kit.mjs';

// Every path below root with its size and mtime; node_modules stays a link to the clone's own.
function snapshot(root, dir = root, out = {}) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name),
            stat = lstatSync(path);
        out[path.slice(root.length)] = `${stat.size}:${stat.mtimeMs}`;
        if (stat.isDirectory()) snapshot(root, path, out);
    }
    return out;
}

function writable(dir, on) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (lstatSync(path).isDirectory()) writable(path, on);
        else if (!lstatSync(path).isSymbolicLink()) chmodSync(path, on ? 0o600 : 0o400);
    }
    chmodSync(dir, on ? 0o700 : 0o500);
}

test('the server runs from a read-only app folder and writes only to its data folder', async (t) => {
    const app = mkdtempSync(join(tmpdir(), 'rabbithole-app-')),
        data = mkdtempSync(join(tmpdir(), 'rabbithole-data-')),
        temp = mkdtempSync(join(tmpdir(), 'rabbithole-tmp-'));
    for (const name of ['server', 'src', 'scripts', 'package.json'])
        cpSync(name, join(app, name), { recursive: true });
    mkdirSync(join(app, 'dist'));
    writeFileSync(join(app, 'dist', 'index.html'), '<!doctype html><title>Rabbithole</title>');
    symlinkSync(realpathSync('node_modules'), join(app, 'node_modules'));

    // A saved video with one cut and its narration, as a finished job leaves it.
    const store = new Store(join(data, 'trees.sqlite'));
    const tree = store.create('Saved video', 'codex');
    const message = store.message(tree.id, 'assistant', 'Here is a video.', 'completed');
    const video = store.pendingArtifact(tree.id, message, 'Video', 'One cut.', 'video', '{}');
    store.videoData(tree.id, video.id, video.attempt, {
        plan: { styleBrief: { paletteRoles: {} }, cuts: [{}] },
        cuts: [
            {
                engine: 'remotion',
                code: 'export default function Video() { return null; }',
                timing: { durationInFrames: 30 },
                audited: true,
            },
        ],
    });
    store.finishVideo(tree.id, video.id, video.attempt, { description: 'One cut.', duration: 1 });
    store.close();
    const cutDir = join(data, 'video-work', video.id, video.attempt, 'cut-0', 'public');
    mkdirSync(cutDir, { recursive: true });
    writeFileSync(join(cutDir, 'narration.mp3'), 'narration bytes');

    writable(app, false);
    t.after(() => writable(app, true));
    const before = snapshot(app);
    const running = launch(data, 0, { TMPDIR: temp }, app);
    try {
        const [, origin] = await running.waitFor(/Rabbithole: (http:\/\/127\.0\.0\.1:\d+)/);
        const page = await fetch(origin + '/');
        assert.equal(page.status, 200);
        assert.match(await page.text(), /<title>Rabbithole<\/title>/);
        const state = await (await fetch(origin + '/api/state')).json();
        assert.deepEqual(
            state.trees.map((t) => t.title),
            ['Saved video'],
        );
        const cuts = `${origin}/api/trees/${tree.id}/artifacts/${video.id}/cuts`;
        assert.equal((await (await fetch(cuts)).json()).cuts.length, 1);
        const narration = await fetch(cuts + '/0/narration');
        assert.equal(narration.status, 200);
        assert.equal(await narration.text(), 'narration bytes');
    } finally {
        await running.stop();
    }
    assert.doesNotMatch(running.output(), /EACCES|EROFS|could not start/);
    assert.deepEqual(snapshot(app), before, 'nothing under the app folder changed');
    assert.deepEqual(readdirSync(temp), [], 'nothing went to the temporary folder');
});
