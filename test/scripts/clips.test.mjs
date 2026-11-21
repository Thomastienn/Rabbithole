import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { detectClips } from '../../server/media/clips.mjs';
import { ensureClips } from '../../scripts/clips-setup.mjs';

const root = '/project with spaces';
const python = join(root, '.venv/bin/python');
const probes = (missing) => (command) => ({ status: missing().includes(command) ? 1 : 0 });
const quiet = () => {};

test('first run installs yt-dlp into the Manim .venv with uv; later starts install nothing', async () => {
    let missing = [python];
    const calls = [],
        logs = [];
    const result = await ensureClips({
        root,
        probe: probes(() => missing),
        log: (line) => logs.push(line),
        warn: assert.fail,
        run: async (command, args) => {
            calls.push([command, args]);
            missing = [];
            return 0;
        },
    });
    assert.equal(result.ready, true);
    assert.deepEqual(calls, [['uv', ['pip', 'install', '--python', python, 'yt-dlp']]]);
    assert.match(logs.at(-1), /Clip exhibits ready/);
    assert.equal(
        (await ensureClips({ root, probe: probes(() => []), run: assert.fail, log: quiet })).ready,
        true,
    );
});

test('missing ffmpeg or a failed install warns that videos have no clips, and start-up continues', async () => {
    for (const [platform, command] of [
        ['linux', 'sudo apt install ffmpeg'],
        ['darwin', 'brew install ffmpeg'],
    ]) {
        const warnings = [];
        const result = await ensureClips({
            root,
            platform,
            probe: probes(() => ['ffmpeg']),
            run: assert.fail,
            log: quiet,
            warn: (line) => warnings.push(line),
        });
        assert.equal(result.ready, false);
        assert.match(warnings[0], /Clip exhibits unavailable: ffmpeg is missing/);
        assert.ok(warnings[0].includes(command));
        assert.match(warnings[0], /videos have no clips/);
    }
    for (const run of [
        async () => 1,
        async () => {
            throw new Error('uv ENOENT');
        },
    ]) {
        const warnings = [];
        const result = await ensureClips({
            root,
            probe: probes(() => [python]),
            run,
            log: quiet,
            warn: (line) => warnings.push(line),
        });
        assert.equal(result.ready, false);
        assert.match(warnings[0], /yt-dlp setup failed[\s\S]*videos have no clips[\s\S]*npm start/);
    }
    // Installed but still unusable: the detector's message is reported.
    const warnings = [];
    await ensureClips({
        root,
        probe: probes(() => [python]),
        run: async () => 0,
        log: quiet,
        warn: (line) => warnings.push(line),
    });
    assert.match(warnings[0], /yt-dlp is not installed in \.venv/);
});

test('detection reports the project-local yt-dlp and ffmpeg, never throwing', () => {
    assert.deepEqual(detectClips({ root, probe: probes(() => []) }), {
        ready: true,
        python,
        ffmpeg: 'ffmpeg',
    });
    assert.equal(
        detectClips({ root, probe: () => ({ status: null, error: new Error('ENOENT') }) }).ready,
        false,
    );
});
