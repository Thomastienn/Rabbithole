import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeSetPieces } from '../../server/media/video-pieces.mjs';
import { pieceChoices, cutSource, libraryPieces } from '../../server/media/video-plan.mjs';
import { planFor } from '../support/video-kit.mjs';

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

test('the set-piece writer is offered only library matches: reuse, variant or new', async () => {
  let input, instructions;
  const result = await writeSetPieces({
    ...options(),
    write: async (rules, text) => {
      instructions = rules;
      input = JSON.parse(text);
      return answer('reuse', library.id);
    },
  });
  assert.doesNotMatch(instructions, /stock/i);
  assert.match(instructions, /"use":"reuse\|variant\|new"/);
  assert.equal(input.stock, undefined);
  assert.deepEqual(input.library[0].matches[0], library);
  assert.match(result.source, /export const Horse/);
  assert.equal(result.choices[0].use, 'reuse');
});

test('a plan with a 3D cut also gets a <Name>3D mesh group per object, kept out of the library', async () => {
  const solid = `import { colors } from './kit';
export function Horse3D({position = [0, 0, 0]}) { return <group position={position}><mesh><boxGeometry args={[3, 2, 1]} /><meshStandardMaterial color={colors.winner} /></mesh></group>; }`;
  const p = plan();
  p.cuts[0].dimension = '3d';
  const inputs = [];
  const result = await writeSetPieces({
    ...options(),
    plan: p,
    write: async (_rules, text) => {
      inputs.push(JSON.parse(text));
      return answer('reuse', library.id, inputs.length === 1 ? '' : solid);
    },
  });
  assert.deepEqual(inputs[0].solidNames, ['Horse3D']);
  assert.match(inputs[1].validationError, /missing export Horse3D/);
  assert.match(result.source, /export function Horse3D/);
  assert.deepEqual(
    libraryPieces(result.source, p.styleBrief, ['Horse']).map((e) => e.name),
    ['Horse'],
  );
});

test('a stock choice is no longer accepted', () => {
  const choose = (raw) => pieceChoices(raw, ['Horse'], [[library]], plan().styleBrief);
  assert.throws(() => choose(answer('stock', 'fluent-emoji:horse')), /no reuse, variant or new/);
  for (const use of ['reuse', 'variant', 'new'])
    assert.equal(
      choose(answer(use, library.id, use === 'reuse' ? '' : source)).choices[0].use,
      use,
    );
});

test('cut and set-piece validation rejects stock pieces and stock IDs with a clear problem', () => {
  const brief = plan().styleBrief;
  for (const code of [
    `import { StockPiece } from './kit'; export default () => <StockPiece id="fluent-emoji:horse" x={0} y={0} />;`,
    `import { setStock } from './kit'; setStock({}); export default () => null;`,
    `export default () => <div data-id="fluent-emoji:horse" />;`,
  ])
    assert.throws(() => cutSource(code, brief), /stock pieces are retired/);
  assert.throws(
    () =>
      cutSource(
        `import { StockPiece } from './kit';\nexport function Horse(props) {\n  return <StockPiece id={"horse-123"} {...props} />;\n}`,
        brief,
        ['Horse'],
      ),
    /stock pieces are retired/,
  );
});
