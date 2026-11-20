import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { detectClips } from '../server/media/clips.mjs';
import { projectRoot } from '../server/media/manim.mjs';

// Clip exhibits are optional: yt-dlp joins Manim's .venv; a failure warns and videos simply have no clips.
export async function ensureClips({
    run,
    root = projectRoot,
    probe = spawnSync,
    platform = process.platform,
    log = console.log,
    warn = console.warn,
}) {
    let clips = detectClips({ root, probe, platform });
    if (clips.ready) return (log('Clip exhibits ready (yt-dlp and ffmpeg).'), clips);
    if (/ffmpeg/.test(clips.error)) return (warn(clips.error), clips);
    log('Installing yt-dlp in .venv with uv for clip exhibits. Internet access may be needed.');
    try {
        if (
            await run('uv', [
                'pip',
                'install',
                '--python',
                join(root, '.venv/bin/python'),
                'yt-dlp',
            ])
        )
            throw new Error('uv pip install yt-dlp failed');
    } catch (error) {
        warn(
            `Clip exhibits unavailable: yt-dlp setup failed (${error.message}); videos have no clips. Run npm start again to retry.`,
        );
        return { ...clips, error: error.message };
    }
    clips = detectClips({ root, probe, platform });
    if (clips.ready) log('Clip exhibits ready (yt-dlp and ffmpeg).');
    else warn(clips.error);
    return clips;
}
