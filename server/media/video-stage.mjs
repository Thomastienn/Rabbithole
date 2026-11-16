import { CUT_ENTRY } from './video-cut.mjs';
import { MANIM_COMPONENT } from './manim-cut.mjs';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stockPieces, videoPalette } from './video-plan.mjs';
import { pieceJson } from './stock.mjs';

const runtime = readFileSync(new URL('./video-stock.tsx', import.meta.url), 'utf8').replace(
  "from './video-kit'",
  "from './kit'",
);

// Only 2D stock can enter Manim. Remotion places every selected stock piece through ./pieces.
export const cutStock = (source, engine) =>
  stockPieces(source).filter((p) => engine !== 'manim' || p.id.startsWith('fluent-emoji:'));

// Both playback's stock route and background rendering resolve through the catalog's local cache.
export async function resolveVideoStock(source, stock, engine) {
  return Object.fromEntries(
    await Promise.all(
      [...new Set(cutStock(source, engine).map((p) => p.id))].map(async (id) => [
        id,
        pieceJson(await stock?.piece(id)),
      ]),
    ),
  );
}

export async function stageStock(dir, source, stock, engine) {
  const delivered = await resolveVideoStock(source, stock, engine);
  const files = {};
  await writeFile(join(dir, 'video-stock.tsx'), runtime);
  if (engine === 'manim') {
    for (const [i, [id, data]] of Object.entries(delivered).entries())
      if (data?.svg) await writeFile(join(dir, (files[id] = `stock-${i}.svg`)), data.svg);
  } else {
    await writeFile(join(dir, 'stock.json'), JSON.stringify(delivered));
  }
  return files;
}

// Stage the same host runtime and cached stock for audits and the final render.
export async function stageCut({ dir, cut, plan, pieces, stock, kit, manimKit, emphasis }) {
  const files = await stageStock(dir, pieces, stock, cut.engine);
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
        stock: files,
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
