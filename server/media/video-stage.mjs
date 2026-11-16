import { CUT_ENTRY } from './video-cut.mjs';
import { MANIM_COMPONENT } from './manim-cut.mjs';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { videoPalette } from './video-plan.mjs';

const runtime = readFileSync(new URL('./video-stock.tsx', import.meta.url), 'utf8').replace(
  "from './video-kit'",
  "from './kit'",
);

// The host's data path into a Remotion cut: stock.json beside the cut, read by setStock in the kit.
// Stock catalogs are retired (ADR 0005), so it delivers nothing yet; exhibits will reuse it.
async function stageHostData(dir, engine) {
  await writeFile(join(dir, 'video-stock.tsx'), runtime);
  if (engine !== 'manim') await writeFile(join(dir, 'stock.json'), '{}');
}

// Stage the same host runtime and host data for audits and the final render.
export async function stageCut({ dir, cut, plan, pieces, kit, manimKit, emphasis }) {
  await stageHostData(dir, cut.engine);
  if (cut.engine === 'manim') {
    await writeFile(join(dir, 'Cut.py'), cut.code);
    await writeFile(join(dir, 'kit.py'), manimKit);
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
          Object.entries(plan.styleBrief.paletteRoles).map(([role, ink]) => [
            role,
            videoPalette[ink],
          ]),
        ),
      }),
    );
  }
  await writeFile(join(dir, 'Video.tsx'), cut.engine === 'manim' ? MANIM_COMPONENT : cut.code);
  await writeFile(join(dir, 'index.tsx'), CUT_ENTRY);
  if (pieces && cut.engine !== 'manim') await writeFile(join(dir, 'pieces.tsx'), pieces);
  await writeFile(join(dir, 'emphasis.json'), JSON.stringify(emphasis));
  await writeFile(
    join(dir, 'kit.tsx'),
    kit +
      '\nexport const colors = {\n' +
      Object.entries(plan.styleBrief.paletteRoles)
        .map(([role, ink]) => `  ${JSON.stringify(role)}: palette.${ink},`)
        .join('\n') +
      '\n};\n' +
      (cut.engine !== 'manim'
        ? "import { setStock } from './video-stock';\nimport stockData from './stock.json';\nsetStock(stockData);\n"
        : ''),
  );
  return dir;
}
