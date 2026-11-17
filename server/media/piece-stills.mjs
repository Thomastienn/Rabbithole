import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, readFile, rm, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { FONTS } from './video-cut.mjs';
import { stageCut } from './video-stage.mjs';
import { withParts } from './video-pieces.mjs';

const KIT = readFileSync(new URL('./video-kit.tsx', import.meta.url), 'utf8');
// Pieces colour only through roles; like the library view, each role borrows a house hue in order.
const HUES = ['amber', 'leaf', 'rust', 'lichen'];

// Frame 0 is the 2D form on the ground; frame 1, when present, the 3D form at the turntable's camera, turned 3/4.
const entry = (
  name,
  solid,
) => `import { AbsoluteFill, Composition, Sequence, continueRender, delayRender, registerRoot } from 'remotion';
import * as flat from './pieces';
import { Lights, frame, palette, three } from './kit';
${solid ? "import { ThreeCanvas } from '@remotion/three';\nimport * as solid from './pieces3d';\n" : ''}${FONTS}
const Piece = (flat as any)[${JSON.stringify(name)}];
${solid ? `const Solid = (solid as any)[${JSON.stringify(`${name}3D`)}];` : ''}
const Still = () => <>
  <Sequence durationInFrames={1}><AbsoluteFill style={{ background: palette.ground }}><Piece x={frame.width / 2} y={frame.height / 2} scale={1} /></AbsoluteFill></Sequence>
  ${solid ? '<Sequence from={1}><ThreeCanvas width={frame.width} height={frame.height} camera={{ position: [0, 0, 7], fov: 40 }}><color attach="background" args={[three.background]} /><Lights /><group rotation={[0.25, 0.6, 0]}><Solid /></group></ThreeCanvas></Sequence>' : ''}
</>;
registerRoot(() => <Composition id="Video" component={Still} width={frame.width} height={frame.height} fps={30} durationInFrames={${solid ? 2 : 1}} />);
`;

// JPEG stills of a piece's forms (a store pieceTree, drawn with its parts), rendered in the cut audit's
// sandbox by its snapshot path.
export async function renderPieceStills(piece, { dir, snapshot, signal }) {
  const { source, source3d, roles } = withParts(piece);
  // Three levels below dir, like a video attempt, so the sandbox hides the app's data directory.
  const work = join(dir, 'piece-work', piece.id, randomUUID());
  try {
    for (const sub of ['out', 'tmp', 'public'])
      await mkdir(join(work, sub), { recursive: true, mode: 0o700 });
    await stageCut({
      dir: work,
      cut: { engine: 'remotion', code: '' },
      plan: {
        styleBrief: {
          paletteRoles: Object.fromEntries(roles.map((r, i) => [r, HUES[i % HUES.length]])),
        },
      },
      pieces: source,
      kit: KIT,
      emphasis: [],
    });
    if (source3d) await writeFile(join(work, 'pieces3d.tsx'), source3d);
    await writeFile(join(work, 'index.tsx'), entry(piece.name, !!source3d));
    const stills = (source3d ? [0, 1] : [0]).map((frame) => ({
      frame,
      file: join(work, 'out', `${frame}.jpg`),
    }));
    await snapshot(work, stills, signal);
    const out = await realpath(join(work, 'out'));
    const [still, still3d = null] = await Promise.all(
      stills.map(async ({ frame, file }) => {
        const stat = await lstat(file).catch(() => null);
        if (
          !stat?.isFile() ||
          !stat.size ||
          stat.size > 2 * 1024 * 1024 ||
          (await realpath(file)) !== join(out, `${frame}.jpg`)
        )
          throw new Error('Piece still is unreadable.');
        return readFile(file);
      }),
    );
    return { still, still3d };
  } finally {
    await rm(join(dir, 'piece-work', piece.id), { recursive: true, force: true });
  }
}

// Fills missing stills one piece at a time in the background. A piece whose stills fail is skipped until it is
// improved or the app restarts, so a broken piece is not rendered again on every list request.
export function pieceStills({ store, dir, snapshot, onWarning }) {
  const controller = new AbortController(),
    failed = new Set();
  let running = null,
    again = false;
  const run = async () => {
    do {
      again = false;
      for (const { id, improved } of store.unstilledPieces()) {
        if (controller.signal.aborted) return;
        if (failed.has(`${id}:${improved}`)) continue;
        const piece = store.pieceTree(id);
        try {
          if (piece)
            store.stillPiece(
              id,
              piece.improved,
              await renderPieceStills(piece, { dir, snapshot, signal: controller.signal }),
            );
        } catch (error) {
          if (controller.signal.aborted) return;
          failed.add(`${id}:${piece.improved}`);
          onWarning(error);
        }
      }
    } while (again);
  };
  return {
    fill() {
      if (running) again = true;
      else
        running = run()
          .catch(onWarning)
          .finally(() => (running = null));
      return running;
    },
    stop: () => controller.abort(),
  };
}
