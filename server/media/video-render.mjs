// Runs inside the bubblewrap sandbox from videos.mjs; argv: workspace, output file, dependency directory,
// the video browser, and for snapshots a JSON list of {frame, file, sheet?} stills instead of a video.
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, RenderInternals } from '@remotion/renderer';

const [workspace, output, modules, browserExecutable, stills] = process.argv.slice(2);
if (existsSync(join(workspace, 'cuts.json'))) {
    const cuts = JSON.parse(readFileSync(join(workspace, 'cuts.json'), 'utf8'));
    const durationInFrames = cuts.reduce((n, c) => n + c.durationInFrames, 0);
    const list = join(workspace, 'cuts.txt');
    writeFileSync(
        list,
        cuts
            .map(
                (c) =>
                    `file '${c.file.replaceAll("'", "'\\''")}'\nduration ${c.durationInFrames / 30}`,
            )
            .join('\n'),
    );
    const binary = RenderInternals.getExecutablePath({
        type: 'ffmpeg',
        indent: false,
        logLevel: 'error',
        binariesDirectory: null,
    });
    // Cuts already contain their transition and silent pause; remux video without rendering it again.
    execFileSync(
        binary,
        [
            '-v',
            'error',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            list,
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-t',
            String(durationInFrames / 30),
            '-movflags',
            '+faststart',
            output,
        ],
        { stdio: 'pipe' },
    );
    console.log(JSON.stringify({ durationInFrames, fps: 30 }));
    process.exit(0);
}
const serveUrl = await bundle({
    entryPoint: join(workspace, 'index.tsx'),
    publicDir: join(workspace, 'public'),
    outDir: join(workspace, 'bundle'),
    enableCaching: false,
    webpackOverride: (config) => ({
        ...config,
        resolve: { ...config.resolve, modules: [modules] },
    }),
});
const composition = await selectComposition({
    serveUrl,
    id: 'Video',
    browserExecutable,
    logLevel: 'error',
});
if (stills) {
    // Audit frames go at 960x540 to keep image tokens modest.
    // A sheet entry renders the cut entry's contact sheet composition instead of one frame.
    const list = JSON.parse(stills);
    const sheet =
        list.some((s) => s.sheet) &&
        (await selectComposition({ serveUrl, id: 'Sheet', browserExecutable, logLevel: 'error' }));
    for (const { frame, file, sheet: tiled } of list)
        await renderStill({
            serveUrl,
            composition: tiled ? sheet : composition,
            browserExecutable,
            output: file,
            frame,
            imageFormat: 'jpeg',
            scale: 0.5,
            logLevel: 'error',
        });
    console.log(JSON.stringify({ stills: list.length }));
    process.exit(0);
}
let reported = 0;
await renderMedia({
    serveUrl,
    composition,
    browserExecutable,
    codec: 'h264',
    outputLocation: output,
    concurrency: 2,
    logLevel: 'error',
    onProgress: ({ progress }) => {
        const step = Math.floor(progress * 100) / 100;
        if (step > reported) console.log(JSON.stringify({ progress: (reported = step) }));
    },
});
console.log(
    JSON.stringify({ durationInFrames: composition.durationInFrames, fps: composition.fps }),
);
