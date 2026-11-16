import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  stockCatalog,
  FLUENT,
  POLYFORK,
  fluentIndex,
  polyforkIndex,
} from '../../server/media/stock.mjs';
import { stockSource, assemblePieces } from '../../server/media/video-plan.mjs';
import { resolveVideoStock } from '../../server/media/video-stage.mjs';
import {
  planFor,
  composition,
  directive,
  complete,
  until,
  open,
  fakeRender,
} from '../support/video-kit.mjs';

const horse = { id: 'fluent-emoji:horse', title: 'Horse', type: 'emoji', dimension: '2D' };
const cube = { id: 'cube-123456', title: 'Cube', type: 'shape', dimension: '3D' };
const svg = '<svg viewBox="0 0 32 32"><path fill="#8B5E3C" d="M0 0h32v32H0z"/></svg>';
const glb = Buffer.from('glTF-fixture');

test('videos deliver selected stock live and to both render engines, without library saves or audit replacements', async (t) => {
  const plan = planFor(composition, 2);
  plan.cuts[1].engine = 'manim';
  plan.styleBrief = {
    ...plan.styleBrief,
    recurringObjects: [horse, cube].map((p) => ({
      name: p.title,
      look: `A ${p.title}`,
      colorRole: 'winner',
      position: 'centre',
    })),
  };
  const rendered = Promise.withResolvers(),
    release = Promise.withResolvers();
  const inputs = [],
    audits = [];
  const uses = `import { Horse, Cube } from './pieces';
export default () => <><Horse x={600} y={400} /><Cube x={1200} y={400} /></>;`;
  const math = `from kit import HouseScene, stockPiece, point
class Cut(HouseScene):
    def construct(self):
        self.add(stockPiece("fluent-emoji:horse").move_to(point(960, 400)))
`;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        const task = JSON.parse(text);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions.startsWith('You write the set pieces'))
          return complete(
            emit,
            JSON.stringify({
              pieces: [horse, cube].map((p) => ({ name: p.title, use: 'stock', id: p.id })),
              code: '',
            }),
          );
        if (tree.instructions.startsWith('You audit')) {
          audits.push(task);
          return complete(
            emit,
            JSON.stringify({ ok: true, pieces: [{ name: 'Horse', why: 'replace it' }] }),
          );
        }
        assert.ok(!tree.instructions.startsWith('You improve'), 'stock must never be rewritten');
        inputs.push(task);
        complete(emit, task.cut.engine === 'manim' ? math : uses);
      },
    },
    {
      stock: {
        match: async () => [
          { object: 'Horse', pieces: [horse] },
          { object: 'Cube', pieces: [cube] },
        ],
        piece: async (id) => (id === horse.id ? svg : id === cube.id ? glb : null),
      },
      videoSnapshot: async (_dir, stills) => {
        for (const { file } of stills) writeFileSync(file, 'jpeg');
      },
      videoManim: {
        detect: () => ({ ready: true, python: 'fake-python' }),
        check: async (dir) => {
          const brief = JSON.parse(readFileSync(join(dir, 'brief.json')));
          assert.deepEqual(Object.keys(brief.stock), [horse.id]);
          assert.equal(readFileSync(join(dir, brief.stock[horse.id]), 'utf8'), svg);
        },
        render: fakeRender,
      },
      videoRender: async (dir, out) => {
        if (basename(dir) === 'cut-0') {
          assert.deepEqual(JSON.parse(readFileSync(join(dir, 'stock.json'))), {
            [horse.id]: { svg },
            [cube.id]: { glb: glb.toString('base64') },
          });
          assert.match(readFileSync(join(dir, 'kit.tsx'), 'utf8'), /setStock\(stockData\)/);
          rendered.resolve();
          await release.promise;
        }
        return fakeRender(dir, out);
      },
    },
  );
  t.after(async () => {
    release.resolve();
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Stock video', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  await rendered.promise;
  const pending = env.store.tree(tree.id).artifacts[0];
  const live = await (await env.get(`/api/trees/${tree.id}/artifacts/${pending.id}/cuts`)).json();
  assert.deepEqual(live.stock, [horse.id, cube.id]);
  assert.match(live.pieces, /StockPiece/);
  assert.deepEqual(await (await env.get(`/api/stock/${encodeURIComponent(horse.id)}`)).json(), {
    svg,
  });
  assert.deepEqual(await (await env.get(`/api/stock/${cube.id}`)).json(), {
    glb: glb.toString('base64'),
  });
  const manim = inputs.find((task) => task.cut.engine === 'manim');
  assert.deepEqual(manim.stockPieces, [{ name: 'Horse', id: horse.id }]);
  assert.equal(audits.length, 2);
  assert.ok(audits.every((task) => !task.libraryPieces));
  release.resolve();
  const ready = await until(() => {
    const row = env.store.artifact(tree.id, pending.id);
    return ['ready', 'failed'].includes(row.status) && row;
  });
  assert.equal(ready.status, 'ready', ready.error);
  assert.deepEqual(env.store.pieceList(), []);
});

test('background stock resolution reads the same cached SVG/GLB offline; Manim resolves only SVG', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-stock-'));
  const listing = { tree: [{ path: 'assets/Horse/Flat/horse_flat.svg' }] };
  const models = {
    assets: [
      { id: cube.id, title: 'Cube', type: 'shape', glb: `https://polyfork.dev/cdn/${cube.id}.glb` },
    ],
  };
  const hash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const catalogs = [
    { ...FLUENT, hash: hash(fluentIndex(listing)) },
    { ...POLYFORK, hash: hash(polyforkIndex(models)) },
  ];
  let downloads = 0;
  const original = stockCatalog(
    dir,
    async (url) => (url.includes('git/trees') ? listing : models),
    async (url) => {
      downloads++;
      return url.endsWith('.glb') ? glb : svg;
    },
    catalogs,
  );
  await original.piece(horse.id);
  await original.piece(cube.id);
  assert.equal(downloads, 2);
  const offline = stockCatalog(
    dir,
    async () => {
      throw new Error('no network');
    },
    async () => {
      throw new Error('no network');
    },
    catalogs,
  );
  const pieces = assemblePieces(
    '',
    [],
    [stockSource('Horse', horse.id), stockSource('Cube', cube.id)],
  );
  assert.deepEqual(await resolveVideoStock(pieces, offline, 'remotion'), {
    [horse.id]: { svg },
    [cube.id]: { glb: glb.toString('base64') },
  });
  assert.deepEqual(await resolveVideoStock(pieces, offline, 'manim'), { [horse.id]: { svg } });
  assert.ok((await offline.match(['horse'], '2D'))[0].pieces.every((p) => p.dimension === '2D'));
});
