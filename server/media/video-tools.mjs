import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { detectManim, projectRoot, toolRoot, videoBrowser } from './manim.mjs';
import { detectPython } from '../tools/python.mjs';
import { ensureManim } from '../../scripts/manim-setup.mjs';
import { ensureClips } from '../../scripts/clips-setup.mjs';
import { ensurePython } from '../../scripts/python-setup.mjs';
import { ensureLatex, ensureUv, latexReady, uvReady } from '../../scripts/tools-setup.mjs';

// The existing terminal setups, run by the download manager; stopping the app kills the running step.
const runner = (signal) => (command, args, env) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'inherit', 'inherit'],
            signal,
            env,
        });
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
    });

// Remotion downloads into the node_modules beside the nearest package.json from its working folder.
const browser = (root, onLine, signal) =>
    new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(projectRoot, 'scripts/browser-setup.mjs')], {
            cwd: root,
            stdio: ['ignore', 'pipe', 'inherit'],
            signal,
        });
        createInterface({ input: child.stdout }).on('line', onLine);
        child.once('error', reject);
        child.once('exit', (code) => resolve(code));
    });

// Every check reads the tool root, so a tool root holding every video tool queues none.
export function videoTools({
    root = toolRoot,
    platform = process.platform,
    probe = spawnSync,
    check,
    exists = existsSync,
} = {}) {
    return [
        {
            id: 'uv',
            name: 'uv',
            video: true,
            ready: async () => uvReady({ probe }),
            run: ({ report, signal }) => ensureUv({ run: runner(signal), root, report, signal }),
        },
        {
            id: 'latex',
            name: 'LaTeX',
            video: true,
            ready: async () => latexReady({ probe }),
            run: ({ report, signal }) => ensureLatex({ run: runner(signal), root, report, signal }),
        },
        {
            id: 'manim',
            name: 'Manim',
            video: true,
            ready: async () => detectManim({ root, probe, platform }).ready,
            run: async ({ signal }) => {
                await ensureManim({ run: runner(signal), root });
                // Clip exhibits stay optional, as under npm start: a failure only warns.
                await ensureClips({ run: runner(signal), root });
            },
        },
        {
            id: 'browser',
            name: 'Video browser',
            video: true,
            ready: async () => exists(videoBrowser(root, platform)),
            run: async ({ report, signal }) => {
                const code = await browser(
                    root,
                    (line) => {
                        try {
                            report(JSON.parse(line));
                        } catch {}
                    },
                    signal,
                );
                if (code)
                    throw new Error(
                        'Video browser download failed. Check your connection and Retry.',
                    );
            },
        },
        {
            id: 'python',
            name: 'Offline Python',
            ready: async () => (await detectPython({ root, check, platform })).ready,
            run: async ({ signal }) => {
                const python = await ensurePython({ run: runner(signal), root });
                if (!python.ready) throw new Error(python.error);
            },
        },
    ];
}
