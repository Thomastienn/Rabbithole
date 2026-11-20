import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { detectManim, projectRoot } from './manim.mjs';
import { detectPython } from '../tools/python.mjs';
import { ensureManim } from '../../scripts/manim-setup.mjs';
import { ensureClips } from '../../scripts/clips-setup.mjs';
import { ensurePython } from '../../scripts/python-setup.mjs';
import { ensureLatex, ensureUv, latexReady, uvReady } from '../../scripts/tools-setup.mjs';

// The existing terminal setups, run by the download manager; stopping the app kills the running step.
const runner = (signal) => (command, args) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], signal });
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
    });

const browser = (args, onLine = () => {}, signal) =>
    new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [join(projectRoot, 'scripts/browser-setup.mjs'), ...args],
            {
                cwd: projectRoot,
                stdio: ['ignore', 'pipe', 'inherit'],
                signal,
            },
        );
        createInterface({ input: child.stdout }).on('line', onLine);
        child.once('error', reject);
        child.once('exit', (code) => resolve(code));
    });

export function videoTools({ root = projectRoot } = {}) {
    return [
        {
            id: 'uv',
            name: 'uv',
            video: true,
            ready: async () => uvReady(),
            run: ({ report, signal }) => ensureUv({ run: runner(signal), root, report, signal }),
        },
        {
            id: 'latex',
            name: 'LaTeX',
            video: true,
            ready: async () => latexReady(),
            run: ({ report, signal }) => ensureLatex({ run: runner(signal), root, report, signal }),
        },
        {
            id: 'manim',
            name: 'Manim',
            video: true,
            ready: async () => detectManim({ root }).ready,
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
            ready: async () => (await browser(['--check'])) === 0,
            run: async ({ report, signal }) => {
                const code = await browser(
                    [],
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
            ready: async () => (await detectPython({ root })).ready,
            run: async ({ signal }) => {
                const python = await ensurePython({ run: runner(signal), root });
                if (!python.ready) throw new Error(python.error);
            },
        },
    ];
}
