// Clip exhibits (ADR 0005): yt-dlp from the project-local Python environment downloads the wanted moment and
// the system ffmpeg trims it to a 1280x720 H.264 clip that Chrome and the Remotion render both play, muted
// unless the plan keeps its sound (then with AAC audio).
import { spawnSync, execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pythonIn, toolRoot } from './manim.mjs';

export const MAX_CLIP_SECONDS = 15;
const MAX_CLIP_BYTES = 40 * 1024 * 1024;

export const ffmpegInstall = (platform = process.platform) =>
    platform === 'darwin' ? 'brew install ffmpeg' : 'sudo apt install ffmpeg';

// A fresh probe per video plan, so a later install or a broken environment shows up without a restart.
export function detectClips({
    root = toolRoot,
    probe = spawnSync,
    platform = process.platform,
} = {}) {
    const python = pythonIn(join(root, '.venv'), platform);
    const ok = (command, args) => probe(command, args, { timeout: 15000 }).status === 0;
    if (!ok('ffmpeg', ['-version']))
        return {
            ready: false,
            python,
            error: `Clip exhibits unavailable: ffmpeg is missing. Run: ${ffmpegInstall(platform)}, then npm start; videos have no clips until then.`,
        };
    if (!ok(python, ['-m', 'yt_dlp', '--version']))
        return {
            ready: false,
            python,
            error: 'Clip exhibits unavailable: yt-dlp is not installed in .venv. Run npm start to install it; videos have no clips until then.',
        };
    return { ready: true, python, ffmpeg: 'ffmpeg' };
}

// Downloads seconds start..end of a video page and returns the trimmed MP4 bytes; any failure throws, including
// a clip with sound whose source has no audio.
export async function downloadClip(
    { url, start, end, sound = false },
    { clips, signal, run = promisify(execFile) },
) {
    const work = await mkdtemp(join(tmpdir(), 'rabbithole-clip-'));
    try {
        const options = { signal, timeout: 300000, maxBuffer: 1024 * 1024 };
        await run(
            clips.python,
            [
                '-m',
                'yt_dlp',
                '--ignore-config',
                '--no-playlist',
                '--quiet',
                '--no-warnings',
                '--socket-timeout',
                '20',
                '--max-filesize',
                '500M',
                '-f',
                sound
                    ? 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b'
                    : 'bv*[height<=720]/b[height<=720]/bv*/b',
                '--download-sections',
                `*${start}-${end}`,
                '-o',
                join(work, 'source.%(ext)s'),
                '--',
                url,
            ],
            options,
        );
        const source = (await readdir(work)).find((f) => f.startsWith('source.'));
        if (!source) throw new Error('the downloader saved no video');
        const out = join(work, 'clip.mp4');
        // The section may start at an earlier keyframe; -t caps the length and the frame stays 16:9.
        await run(
            clips.ffmpeg,
            [
                '-v',
                'error',
                '-y',
                '-i',
                join(work, source),
                '-t',
                String(end - start),
                ...(sound
                    ? ['-map', '0:v:0', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k']
                    : ['-an']),
                '-vf',
                'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30',
                '-c:v',
                'libx264',
                '-pix_fmt',
                'yuv420p',
                '-movflags',
                '+faststart',
                out,
            ],
            options,
        );
        const bytes = await readFile(out);
        if (!bytes.length || bytes.length > MAX_CLIP_BYTES)
            throw new Error('the trimmed clip is empty or too large');
        return bytes;
    } finally {
        await rm(work, { recursive: true, force: true });
    }
}
