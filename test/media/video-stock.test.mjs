import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeSetPieces } from '../../server/media/video-pieces.mjs';
import {
  pieceChoices,
  cutSource,
  stockSource,
  stockPieces,
  assemblePieces,
  libraryPieces,
} from '../../server/media/video-plan.mjs';
import { planFor } from '../support/video-kit.mjs';

const horse = { id: 'fluent-emoji:horse', title: 'Horse', type: 'emoji', dimension: '2D' };
const model = { id: 'horse-123456', title: 'Horse', type: 'animal', dimension: '3D' };
const svg = '<svg viewBox="0 0 32 32"><path fill="#8B5E3C" d="M0 0h32v32H0z"/></svg>';
const source = `import { colors } from './kit';
export function Horse({x, y}) { return <div style={{left:x, top:y, color:colors.winner}}>Horse</div>; }`;
const library = { id: 'drawn-horse', name: 'Horse', look: 'A horse', roles: ['winner'], source };
const answer = (use, id, code = '') =>
  JSON.stringify({ pieces: [{ name: 'Horse', use, ...(id && { id }) }], code });
const plan = () => {
  const p = planFor();
  p.styleBrief = {
    ...p.styleBrief,
    recurringObjects: [{ name: 'horse', look: 'A horse', colorRole: 'winner', position: 'centre' }],
  };
  return p;
};
const options = () => ({
  plan: plan(),
  names: ['Horse'],
  matches: async () => [[library]],
  signal: new AbortController().signal,
});

test('the writer sees stock beside library matches and accepts stock without model-written code', async () => {
  let input, instructions;
  const result = await writeSetPieces({
    ...options(),
    stock: {
      match: async (names) => {
        assert.deepEqual(names, ['horse']);
        return [{ object: 'horse', pieces: [horse, model] }];
      },
      piece: async (id) => (assert.equal(id, horse.id), svg),
    },
    write: async (rules, text) => {
      instructions = rules;
      input = JSON.parse(text);
      return answer('stock', horse.id);
    },
  });
  assert.match(instructions, /prefer stock whenever one fits/);
  assert.deepEqual(input.library[0].matches[0], library);
  assert.deepEqual(input.stock, [{ name: 'Horse', pieces: [horse, model] }]);
  assert.deepEqual(stockPieces(result.source), [{ name: 'Horse', id: horse.id }]);
  assert.match(result.source, /<StockPiece id=\{"fluent-emoji:horse"\}/);
  assert.deepEqual(libraryPieces(result.source, plan().styleBrief, ['Horse']), []);
});

test('a plan with a 3D cut also gets a <Name>3D mesh group per object, kept out of the library', async () => {
  const solid = `import { colors } from './kit';
export function Horse3D({position = [0, 0, 0]}) { return <group position={position}><mesh><boxGeometry args={[3, 2, 1]} /><meshStandardMaterial color={colors.winner} /></mesh></group>; }`;
  const p = plan();
  p.cuts[0].dimension = '3d';
  const inputs = [];
  let instructions;
  const result = await writeSetPieces({
    ...options(),
    plan: p,
    stock: {
      match: async () => [{ object: 'horse', pieces: [horse] }],
      piece: async () => svg,
    },
    write: async (rules, text) => {
      instructions = rules;
      inputs.push(JSON.parse(text));
      return answer('stock', horse.id, inputs.length === 1 ? '' : solid);
    },
  });
  assert.match(instructions, /export function <Name>3D\(props\)[\s\S]*even when its 2D piece is stock/);
  assert.deepEqual(inputs[0].solidNames, ['Horse3D']);
  assert.match(inputs[1].validationError, /missing export Horse3D/);
  assert.match(result.source, /export function Horse3D/);
  assert.deepEqual(stockPieces(result.source), [{ name: 'Horse', id: horse.id }]);
  assert.deepEqual(libraryPieces(result.source, p.styleBrief, ['Horse']), []);
});

test('stock choices must name offered IDs, never derive stock variants or write stock code', () => {
  const choose = (raw) => pieceChoices(raw, ['Horse'], [[library]], plan().styleBrief, [[horse]]);
  assert.throws(() => choose(answer('stock', 'unoffered')), /not offered/);
  assert.throws(() => choose(answer('variant', horse.id, source)), /variant of stock/);
  assert.throws(() => choose(answer('stock', horse.id, source)), /must not be written/);
  assert.throws(
    () => choose(answer('stock', horse.id, stockSource('Other', horse.id))),
    /never written/,
  );
  for (const use of ['reuse', 'variant', 'new'])
    assert.equal(
      choose(answer(use, library.id, use === 'reuse' ? '' : source)).choices[0].use,
      use,
    );
  const brief = plan().styleBrief;
  for (const code of [
    `import { StockPiece as P } from './kit'; export default () => <P id="${horse.id}" />;`,
    `import { GLTFLoader } from 'three'; export default () => null;`,
    `import { staticFile } from 'remotion'; export default () => staticFile('horse.svg');`,
  ])
    assert.throws(() => cutSource(code, brief), /disallowed|set pieces/);
  assert.throws(
    () =>
      cutSource(
        "import { Horse } from './pieces'; export default () => <Horse tint='red' />;",
        brief,
      ),
    /style brief/,
  );
});

test('a failed fetch retries once, then the writer can reuse or draw with stock withdrawn', async () => {
  for (const fallback of ['reuse', 'new']) {
    let fetches = 0;
    const inputs = [];
    const result = await writeSetPieces({
      ...options(),
      stock: {
        match: async () => [{ object: 'horse', pieces: [horse, model] }],
        piece: async () => {
          fetches++;
          throw new Error('offline');
        },
      },
      write: async (_, text) => {
        inputs.push(JSON.parse(text));
        return inputs.length === 1
          ? answer('stock', horse.id)
          : answer(fallback, library.id, fallback === 'new' ? source : '');
      },
    });
    assert.equal(fetches, 2);
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[1].stock[0].pieces, []);
    assert.deepEqual(inputs[1].library[0].matches, [library]);
    assert.match(inputs[1].validationError, /could not be fetched.*choose reuse or new/);
    assert.equal(result.choices[0].use, fallback);
    assert.deepEqual(stockPieces(result.source), []);
  }
});

test('a transient fetch failure keeps stock; unavailable catalogs leave the writer usable', async () => {
  let fetches = 0,
    writes = 0;
  await writeSetPieces({
    ...options(),
    stock: {
      match: async () => [{ object: 'horse', pieces: [horse] }],
      piece: async () => {
        if (++fetches === 1) throw new Error('temporary');
        return svg;
      },
    },
    write: async () => {
      writes++;
      return answer('stock', horse.id);
    },
  });
  assert.equal(fetches, 2);
  assert.equal(writes, 1);
  const result = await writeSetPieces({
    ...options(),
    matches: async () => [],
    stock: {
      match: async () => {
        throw new Error('catalog unavailable');
      },
    },
    write: async () => source,
  });
  assert.match(result.source, /function Horse/);
});

test('Manim-only stock offers are 2D, while other cuts may choose 3D', async () => {
  const p = plan();
  p.cuts[0].engine = 'manim';
  await writeSetPieces({
    ...options(),
    plan: p,
    stock: {
      match: async (_names, dimension) => {
        assert.equal(dimension, '2D');
        return [{ object: 'horse', pieces: [model, horse] }];
      },
      piece: async () => svg,
    },
    write: async (_, text) => {
      assert.deepEqual(JSON.parse(text).stock[0].pieces, [horse]);
      return answer('stock', horse.id);
    },
  });
});

test('mixed modules save only standalone drawn pieces, keeping their own looks and no stock imports', () => {
  const brief = plan().styleBrief;
  brief.recurringObjects.push({ name: 'note', look: 'A note' });
  const mixed = assemblePieces(
    `import { colors } from './kit';
export function Note() { return <div style={{color:colors.winner}}>Note</div>; }`,
    [],
    [stockSource('Horse', horse.id, 'winner')],
  );
  const entries = libraryPieces(mixed, brief, ['Horse', 'Note']);
  assert.deepEqual(
    entries.map((e) => [e.name, e.look]),
    [['Note', 'A note']],
  );
  assert.doesNotMatch(entries[0].source, /StockPiece|fluent-emoji/);
  assert.ok(cutSource(entries[0].source, brief, ['Note']));
  const dependent = mixed.replace('>Note<', '><Horse /><');
  assert.deepEqual(libraryPieces(dependent, brief, ['Horse', 'Note']), []);
  const helper = mixed.replace(
    'export function Note()',
    'const helper = () => <Horse />;\nexport function Note()',
  );
  assert.deepEqual(libraryPieces(helper, brief, ['Horse', 'Note']), []);
});

test('a shared failed stock ID is fetched only twice and withdrawn from every object', async () => {
  const p = plan();
  p.styleBrief.recurringObjects.push({ ...p.styleBrief.recurringObjects[0], name: 'second horse' });
  let fetches = 0,
    writes = 0;
  const result = await writeSetPieces({
    ...options(),
    plan: p,
    names: ['Horse', 'SecondHorse'],
    matches: async () => [],
    stock: {
      match: async () => [0, 1].map(() => ({ pieces: [horse] })),
      piece: async () => {
        fetches++;
        return null;
      },
    },
    write: async (_, text) => {
      const input = JSON.parse(text);
      if (++writes === 1)
        return JSON.stringify({
          pieces: input.names.map((name) => ({ name, use: 'stock', id: horse.id })),
          code: '',
        });
      assert.ok(input.stock.every((s) => s.pieces.length === 0));
      return JSON.stringify({
        pieces: input.names.map((name) => ({ name, use: 'new' })),
        code: source + '\nexport function SecondHorse() { return <div />; }',
      });
    },
  });
  assert.equal(fetches, 2);
  assert.equal(writes, 2);
  assert.deepEqual(stockPieces(result.source), []);
});
