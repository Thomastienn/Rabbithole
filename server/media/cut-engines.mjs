import { readFileSync, existsSync } from 'node:fs';
import { writeFile, readFile, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
    CUT_INSTRUCTIONS,
    CUT_3D,
    EXHIBIT_NOTE,
    AUDIT_INSTRUCTIONS,
    AUDIT_3D,
} from './video-cut.mjs';
import { cutSource } from './video-plan.mjs';
import { unfenced } from './audit-answers.mjs';
import { MANIM_INSTRUCTIONS, MANIM_AUDIT_INSTRUCTIONS, MANIM_COMPONENT } from './manim-cut.mjs';
import { REMOTION_SKILL, REMOTION_3D_SKILL, MANIM_SKILL, MOTION_DESIGN_SKILL } from './skills.mjs';
import { videoPalette, roleColor } from './video-colors.mjs';
import { withoutPaths, validateOutput } from './video-sandbox.mjs';

const MANIM_KIT = readFileSync(new URL('./manim-kit.py', import.meta.url), 'utf8');

// The two engines a cut is drawn by (ADR 0001), behind what the cut pipeline asks of one:
// pictures: the cut draws the video's set pieces and may show exhibits.
// playable(cut): the engine's own part of a cut being playable live.
// instructions({ dimension, exhibits }) and audit(dimension): the writer's and the cut audit's instructions.
// source(raw, brief): written code as the cut keeps it; throws when it breaks the source rules.
// stage(dir, { cut, plan, pieces, exhibits }): writes the engine's files of a staged cut; returns kit.tsx's tail.
// A job's engines (cutEngines) also answer ready(), check(staged), play(staged, frames) and stills(dir, stills).
export const ENGINES = {
    remotion: {
        pictures: true,
        playable: () => true,
        instructions: ({ dimension, exhibits }) =>
            CUT_INSTRUCTIONS +
            '\n\n' +
            REMOTION_SKILL +
            '\n\n' +
            MOTION_DESIGN_SKILL +
            (dimension === '3d' ? CUT_3D + '\n\n' + REMOTION_3D_SKILL : '') +
            (exhibits ? EXHIBIT_NOTE : ''),
        audit: (dimension) => AUDIT_INSTRUCTIONS + (dimension === '3d' ? AUDIT_3D : ''),
        source: (raw, brief) => cutSource(raw, brief),
        // The host's data path into the cut: stock.json beside it, read by setStock in the kit. It carries the cut's
        // exhibits by id, images inlined as data URLs read from the cut folder; a missing file drops one. A clip is
        // copied into the public folder for staticFile; before narration staging makes that folder only the
        // write-time check runs, which renders nothing. A clip with sound starts at its narration pause.
        async stage(dir, { cut, pieces, exhibits = [] }) {
            const data = {},
                pause = cut.timing?.pause;
            for (const { id, file, type, url, cut, ...shown } of exhibits) {
                if (shown.kind === 'clip') {
                    if (!existsSync(join(dir, file))) continue;
                    await copyFile(join(dir, file), join(dir, 'public', `${id}.mp4`)).catch(
                        () => {},
                    );
                    data[id] = {
                        ...shown,
                        clip: `${id}.mp4`,
                        ...(pause?.id === id && { from: pause.startFrame }),
                    };
                    continue;
                }
                const bytes = file && (await readFile(join(dir, file)).catch(() => null));
                if (file && !bytes) continue;
                data[id] = {
                    ...shown,
                    ...(bytes && { src: `data:${type};base64,${bytes.toString('base64')}` }),
                };
            }
            await writeFile(join(dir, 'stock.json'), JSON.stringify(data));
            await writeFile(join(dir, 'Video.tsx'), cut.code);
            if (pieces) await writeFile(join(dir, 'pieces.tsx'), pieces);
            return "import { setStock } from './video-stock';\nimport stockData from './stock.json';\nsetStock(stockData);\n";
        },
    },
    manim: {
        pictures: false,
        // A Manim cut plays its rendered clip.
        playable: (cut) => !!cut.clip,
        instructions: () => MANIM_INSTRUCTIONS + '\n\n' + MANIM_SKILL,
        audit: () => MANIM_AUDIT_INSTRUCTIONS,
        source: (raw) => unfenced(raw),
        async stage(dir, { cut, plan }) {
            await writeFile(join(dir, 'Cut.py'), cut.code);
            await writeFile(join(dir, 'kit.py'), MANIM_KIT);
            await writeFile(
                join(dir, 'brief.json'),
                JSON.stringify({
                    palette: Object.fromEntries(
                        Object.entries(videoPalette).filter(
                            ([ink]) =>
                                !['amber', 'leaf', 'rust', 'lichen'].includes(ink) ||
                                Object.values(plan.styleBrief.paletteRoles).includes(ink),
                        ),
                    ),
                    colors: Object.fromEntries(
                        Object.keys(plan.styleBrief.paletteRoles).map((role) => [
                            role,
                            roleColor(plan.styleBrief, role),
                        ]),
                    ),
                }),
            );
            await writeFile(join(dir, 'Video.tsx'), MANIM_COMPONENT);
            return '';
        },
    },
};

// One video job's engines. snapshot renders audit stills of a staged cut; manim is { detect, render, check? }.
// Manim being unavailable is the Manim engine's answer: it warns once and stops the whole video with its message.
export function cutEngines({ snapshot, manim, signal, stop, onWarning }) {
    let runtime;
    const unavailable = (error) => {
        onWarning(`WARN video ${error.message}`);
        stop(error);
        throw error;
    };
    return {
        remotion: {
            ...ENGINES.remotion,
            ready() {},
            async check() {},
            play: async () => null,
            async stills(dir, stills) {
                try {
                    return await snapshot(dir, stills, signal);
                } catch (e) {
                    // Cut code that throws in the page renders no frame, live or final; its writer repairs it.
                    if (/^SymbolicateableError\b/.test(e.diagnostic ?? ''))
                        throw Object.assign(new Error(e.diagnostic), { crashed: true });
                    throw e;
                }
            },
        },
        manim: {
            ...ENGINES.manim,
            ready() {
                runtime ??= manim.detect();
                if (!runtime.ready) unavailable(new Error(runtime.error));
            },
            // The render sandbox and validator, with no render, before narration or render.
            async check(staged) {
                if (!manim.check) return;
                try {
                    await manim.check(await staged(), signal, runtime);
                } catch (e) {
                    signal.throwIfAborted();
                    if (e.manimUnavailable) unavailable(e);
                    throw new Error(
                        withoutPaths(
                            e.message === 'Video rendering failed.'
                                ? (e.diagnostic ?? e.message)
                                : e.message,
                        ),
                    );
                }
            },
            // The clip is rendered into the staged cut's public folder, where its wrapper and snapshots read it.
            async play(staged, durationInFrames) {
                const dir = await staged(),
                    clip = join(dir, 'out', randomUUID() + '.mp4');
                try {
                    const result = await manim.render(dir, clip, signal, () => {}, runtime);
                    signal.throwIfAborted();
                    await validateOutput(dir, clip);
                    if (result?.fps !== 30 || result.durationInFrames !== durationInFrames)
                        throw new Error('Rendered Manim cut is unreadable.');
                } catch (error) {
                    if (error.manimUnavailable) unavailable(error);
                    throw error;
                }
                await copyFile(clip, join(dir, 'public', 'manim.mp4'));
                return 'public/manim.mp4';
            },
            stills: (dir, stills) => snapshot(dir, stills, signal),
        },
    };
}
