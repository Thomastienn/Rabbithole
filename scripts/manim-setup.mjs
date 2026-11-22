import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
    checkManimDependencies,
    detectManim,
    MANIM_VERSION,
    toolRoot,
} from '../server/media/manim.mjs';

// PyPI has no Linux wheels of pycairo and manimpango; the linux-wheels release (.github/workflows/linux-wheels.yml) has them, hashes from its SHA256SUMS.
// The file names carry the versions uv resolves for manim==MANIM_VERSION on Python 3.12: to move one, edit its
// version here and the Desktop build run rebuilds the wheels and re-pins names and hashes (scripts/linux-wheels-pin.mjs).
export const LINUX_WHEELS = {
    'pycairo-1.29.2-cp312-cp312-manylinux_2_28_x86_64.whl':
        'aa87b09008a2bcba92fc755deef2c37c7ac17a8151591fa860f2f2a5a8e9690f',
    'manimpango-0.7.1-cp312-cp312-manylinux_2_28_x86_64.whl':
        '1365462f03857bcbcf9a200875aa8f623b473ba081daededfaee4a4107dd0c50',
};
const WHEELS_URL = 'https://github.com/Thomastienn/Rabbithole/releases/download/linux-wheels/';

// Only a wheel matching its pinned hash is kept, so a corrupt or replaced one downloads again.
async function fetchWheels(dir, wheels) {
    mkdirSync(dir, { recursive: true });
    for (const [name, sha256] of Object.entries(wheels)) {
        const file = join(dir, name);
        const pinned = (bytes) => createHash('sha256').update(bytes).digest('hex') === sha256;
        if (existsSync(file) && pinned(readFileSync(file))) continue;
        let bytes;
        try {
            const response = await fetch(WHEELS_URL + name);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
        } catch (error) {
            throw new Error(
                `Manim setup could not download ${name} (${error.message}). Check your connection, then run npm start again.`,
            );
        }
        if (!pinned(bytes))
            throw new Error(
                `${name} does not match its pinned SHA-256, so it was not installed. Run npm start again.`,
            );
        writeFileSync(file, bytes);
    }
}

export async function ensureManim({
    run,
    root = toolRoot,
    probe = spawnSync,
    platform = process.platform,
    arch = process.arch,
    log = console.log,
    wheels = LINUX_WHEELS,
}) {
    let manim = detectManim({ root, probe, platform });
    if (!manim.ready) {
        checkManimDependencies({ platform, probe });
        if (probe('uv', ['--version'], { timeout: 10000 }).status !== 0)
            throw new Error('Manim setup requires uv, which downloads first. Run npm start again.');
        async function uv(args) {
            let code;
            try {
                code = await run('uv', args);
            } catch (error) {
                throw new Error(
                    `Could not start uv: ${error.message}. Run npm start again after repairing uv.`,
                );
            }
            if (code)
                throw new Error(
                    `Manim setup failed: uv ${args.join(' ')}. Fix the error above, then run npm start again.`,
                );
        }
        log(
            `Installing Manim ${MANIM_VERSION} in .venv with uv. Internet access may be needed on first run.`,
        );
        // shortcut: the project wheels are x86_64 only, so other Linux machines still build pycairo and manimpango from PyPI; add their arch to the wheels workflow if needed.
        const source = [];
        if (platform === 'linux' && arch === 'x64') {
            const dir = join(root, '.tools', 'wheels');
            await fetchWheels(dir, wheels);
            source.push(
                '--find-links',
                dir,
                '--only-binary',
                'pycairo',
                '--only-binary',
                'manimpango',
            );
        }
        if (!existsSync(manim.python)) await uv(['venv', '--python', '3.12', join(root, '.venv')]);
        await uv([
            'pip',
            'install',
            '--python',
            manim.python,
            ...source,
            `manim==${MANIM_VERSION}`,
        ]);
        manim = detectManim({ root, probe, platform });
        if (!manim.ready) throw new Error(manim.error);
    }
    log(`Manim ready: ${manim.version} (${manim.python}).`);
    return manim;
}
