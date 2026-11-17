import { CUT_ENTRY } from './video-cut.mjs';
import { MANIM_COMPONENT } from './manim-cut.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { writeFile, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { videoPalette, roleColor } from './video-colors.mjs';

const runtime = readFileSync(new URL('./video-stock.tsx', import.meta.url), 'utf8').replace(
  "from './video-kit'",
  "from './kit'",
);

// The host's data path into a Remotion cut: stock.json beside the cut, read by setStock in the kit. It carries
// the cut's exhibits by id, images inlined as data URLs read from the cut folder; a missing file drops one.
// A clip is copied into the public folder for staticFile; before narration staging makes that folder only the
// write-time check runs, which renders nothing. A clip with sound starts at its narration pause.
async function stageHostData(dir, engine, exhibits = [], pause) {
  await writeFile(join(dir, 'video-stock.tsx'), runtime);
  if (engine === 'manim') return;
  const data = {};
  for (const { id, file, type, url, cut, ...shown } of exhibits) {
    if (shown.kind === 'clip') {
      if (!existsSync(join(dir, file))) continue;
      await copyFile(join(dir, file), join(dir, 'public', `${id}.mp4`)).catch(() => {});
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
}

// Stage the same host runtime and host data for audits and the final render.
export async function stageCut({ dir, cut, plan, pieces, kit, manimKit, emphasis, exhibits }) {
  await stageHostData(dir, cut.engine, exhibits, cut.timing?.pause);
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
          Object.keys(plan.styleBrief.paletteRoles).map((role) => [
            role,
            roleColor(plan.styleBrief, role),
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
        .map(
          ([role, ink]) =>
            `  ${JSON.stringify(role)}: ${Object.hasOwn(videoPalette, ink) ? `palette.${ink}` : JSON.stringify(roleColor(plan.styleBrief, role))},`,
        )
        .join('\n') +
      '\n};\n' +
      (cut.engine !== 'manim'
        ? "import { setStock } from './video-stock';\nimport stockData from './stock.json';\nsetStock(stockData);\n"
        : ''),
  );
  return dir;
}
