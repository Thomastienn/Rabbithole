import { CUT_ENTRY } from './video-cut.mjs';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inks, briefPalette, roleColor } from './video-colors.mjs';
import { ENGINES } from './cut-engines.mjs';

const runtime = readFileSync(new URL('./video-stock.tsx', import.meta.url), 'utf8').replace(
    "from './video-kit'",
    "from './kit'",
);

const finishes = readFileSync(new URL('./video-finish.tsx', import.meta.url), 'utf8');

// Stage the same host runtime and host data for audits and the final render; the cut's engine adds its own files.
export async function stageCut({
    dir,
    cut,
    plan,
    pieces,
    kit,
    emphasis,
    exhibits,
    engine = ENGINES[cut.engine],
}) {
    await writeFile(join(dir, 'video-stock.tsx'), runtime);
    await writeFile(join(dir, 'video-finish.tsx'), finishes);
    const kitTail = await engine.stage(dir, { cut, plan, pieces, exhibits });
    await writeFile(join(dir, 'index.tsx'), CUT_ENTRY);
    await writeFile(join(dir, 'emphasis.json'), JSON.stringify(emphasis));
    await writeFile(
        join(dir, 'kit.tsx'),
        kit +
            // The kit paints this video's theme before any cut or piece reads it.
            `\nsetPalette(${JSON.stringify(briefPalette(plan.styleBrief))});\n` +
            '\nexport const colors = {\n' +
            Object.entries(plan.styleBrief.paletteRoles)
                .map(
                    ([role, ink]) =>
                        `  ${JSON.stringify(role)}: ${inks.includes(ink) ? `palette.${ink}` : JSON.stringify(roleColor(plan.styleBrief, role))},`,
                )
                .join('\n') +
            '\n};\n' +
            kitTail,
    );
    return dir;
}
