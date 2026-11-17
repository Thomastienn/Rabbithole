import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  planFor,
  composition,
  directive,
  complete,
  until,
  open,
  fakeRender,
} from '../support/video-kit.mjs';
import { pieceChoices, assemblePieces, libraryPieces } from '../../server/media/video-plan.mjs';
import { writeSetPieces, withParts } from '../../server/media/video-pieces.mjs';
import { PIECES_PARTS_NOTE } from '../../server/media/video-cut.mjs';

const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x - 120 * scale, top: y - 60 * scale, width: 240 * scale, height: 120 * scale, borderRadius: 16, background: highlight ? colors.winner : palette.raised, color: palette.paper }}>Winner</div>;
}`;

test('the set-piece step reuses, varies or draws new pieces from library matches; reuse takes the new roles; old pieces are backfilled', async (t) => {
  const looks = { champ: 'crowned box', loser: 'slim grey bar', note: 'folded note card' };
  const plan = planFor(composition, 1);
  plan.styleBrief = {
    ...plan.styleBrief,
    paletteRoles: { champ: 'leaf', loser: 'rust', note: 'lichen' },
    recurringObjects: Object.entries(looks).map(([name, look]) => ({
      name,
      position: 'centre',
      colorRole: name,
      look,
    })),
  };
  const vectors = {
    [looks.champ]: [1, 0],
    [looks.loser]: [0, 1],
    [looks.note]: [0.7, 0.7],
    'ghost look': [-1, 0],
  };
  const written = `import { colors } from './kit';
export function Loser({ x, y }) { return <div style={{ left: x, top: y, background: colors.loser }} />; }
export function Note({ x, y }) { return <div style={{ left: x, top: y, background: colors.note }} />; }`;
  let input, kit;
  const logs = [];
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions.startsWith('You write the set pieces')) {
          input = JSON.parse(text);
          const id = (n) => input.library.flatMap((l) => l.matches).find((m) => m.name === n).id;
          return complete(
            emit,
            JSON.stringify({
              pieces: [
                { name: 'Champ', use: 'reuse', id: id('Winner') },
                { name: 'Loser', use: 'variant', id: id('Box') },
                { name: 'Note', use: 'new' },
              ],
              code: written,
            }),
          );
        }
        complete(emit, composition);
      },
    },
    {
      log: (line) => logs.push(line),
      videoEmbed: async (texts) => texts.map((t) => vectors[t]),
      videoRender: async (ws, out) => {
        if (basename(ws) === 'cut-0') kit = readFileSync(join(ws, 'kit.tsx'), 'utf8');
        return fakeRender(ws, out);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const piece = (name, look, source, roles, embedding) =>
    env.store.savePiece({ name, look, props: ['x', 'y'], source, roles, embedding }, 'old-video');
  const winner = piece('Winner', 'boxed crown', pieces, ['winner'], [1, 0.1]);
  const box = piece('Box', 'grey box', pieces.replaceAll('Winner', 'Box'), ['winner'], [0, 1]);
  const ghost = piece('Ghost', 'ghost look', pieces.replaceAll('Winner', 'Ghost'), ['winner']);
  const chat = env.store.create('Reuse', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.deepEqual(
    input.library.map((l) => [l.name, l.matches[0].name]),
    [
      ['Champ', 'Winner'],
      ['Loser', 'Box'],
      ['Note', 'Winner'],
    ],
  );
  assert.equal(
    logs.filter((l) => l.includes(' model finished ') && l.includes('stage="pieces"')).length,
    1,
  );
  assert.equal(input.library[0].matches[0].source, pieces, 'matches carry their source');
  assert.deepEqual(env.store.piece(ghost).embedding, [-1, 0], 'unembedded pieces are backfilled');
  assert.ok(input.library[0].matches.some((m) => m.name === 'Ghost'));

  const module = JSON.parse(row.source).pieces;
  assert.match(module, /export const Champ = \(\(\) => \{[\s\S]*return Winner;\n\}\)\(\);/);
  assert.match(module, /colors\.champ/);
  assert.doesNotMatch(module, /colors\.winner/, 'the reused piece takes the new roles');
  assert.equal((module.match(/from '\.\/kit'/g) ?? []).length, 1, 'imports merge');
  assert.match(kit, /"champ": palette\.leaf/, 'the new role renders in the new ink');

  assert.deepEqual(
    env.store.piece(winner).videos,
    ['old-video', row.id],
    'reuse records the video',
  );
  assert.deepEqual(env.store.piece(box).videos, ['old-video']);
  const fresh = env.store.db
    .prepare('SELECT id FROM pieces WHERE id NOT IN (?,?,?) ORDER BY rowid')
    .all(winner, box, ghost)
    .map((r) => env.store.piece(r.id));
  assert.deepEqual(
    fresh.map((p) => [p.name, p.look, p.roles, p.videos]),
    [
      ['Loser', looks.loser, ['loser'], [row.id]],
      ['Note', looks.note, ['note'], [row.id]],
    ],
    'variant and new pieces are saved; the reused one is not saved again',
  );
  assert.ok(Math.abs(fresh[1].embedding[0] - 0.7) < 1e-6, 'saved with the look embedding');
});

test('library choices must name offered pieces and never rewrite a reused one', () => {
  const brief = { paletteRoles: { champ: 'leaf' } };
  const matches = [[{ id: 'a', name: 'Winner', roles: ['winner'], source: pieces }]];
  const answer = (pieces, code = '') => JSON.stringify({ pieces, code });
  assert.throws(
    () =>
      pieceChoices(answer([{ name: 'Champ', use: 'reuse', id: 'b' }]), ['Champ'], matches, brief),
    /not offered/,
  );
  assert.throws(
    () => pieceChoices(answer([]), ['Champ'], matches, brief),
    /no reuse, variant or new/,
  );
  assert.throws(
    () =>
      pieceChoices(
        answer([{ name: 'Champ', use: 'reuse', id: 'a' }], 'export function Champ() {}'),
        ['Champ'],
        matches,
        brief,
      ),
    /must not be written again/,
  );
  assert.throws(
    () =>
      pieceChoices(
        answer([{ name: 'Champ', use: 'reuse', id: 'a', roles: { winner: 'x' } }]),
        ['Champ'],
        matches,
        brief,
      ),
    /outside the brief/,
  );
  assert.throws(() => pieceChoices(pieces, ['Champ'], matches, brief), /JSON/);
  const module = assemblePieces("import { colors } from './kit';\nconst a = 1;", [
    { name: 'Champ', inner: 'Winner', source: pieces },
  ]);
  assert.match(
    module,
    /^import \{ colors, palette \} from '\.\/kit';\nconst a = 1;\nexport const Champ/,
  );
});

test('a 3D video reuses a piece with both its forms, derives both in a variant and saves both per entry', async () => {
  const solid = (name, role) =>
    `export function ${name}3D({ position = [0, 0, 0] }) { return <group position={position}><mesh><boxGeometry args={[3, 2, 1]} /><meshStandardMaterial color={colors.${role}} /></mesh></group>; }`;
  const saved = {
    id: 'w',
    name: 'Winner',
    look: 'crowned box',
    props: ['x', 'y'],
    roles: ['winner'],
    source: pieces,
    source3d: `import { colors } from './kit';\n${solid('Winner', 'winner')}`,
  };
  const plan = planFor(composition, 1);
  plan.cuts[0].dimension = '3d';
  plan.styleBrief = {
    ...plan.styleBrief,
    paletteRoles: { champ: 'leaf', loser: 'rust' },
    recurringObjects: [
      { name: 'champ', position: 'centre', colorRole: 'champ', look: 'crowned box' },
      { name: 'loser', position: 'left', colorRole: 'loser', look: 'grey box' },
    ],
  };
  const variant = `import { colors } from './kit';
export function Loser({ x, y }) { return <div style={{ left: x, top: y, background: colors.loser }} />; }
${solid('Loser', 'loser')}`;
  const inputs = [];
  const answers = [
    {
      pieces: [
        { name: 'Champ', use: 'reuse', id: 'w' },
        { name: 'Loser', use: 'variant', id: 'w' },
      ],
      code: variant + '\n' + solid('Champ', 'champ'),
    },
    {
      pieces: [
        { name: 'Champ', use: 'reuse', id: 'w' },
        { name: 'Loser', use: 'variant', id: 'w' },
      ],
      code: variant,
    },
  ];
  const { source, choices } = await writeSetPieces({
    plan,
    names: ['Champ', 'Loser'],
    matches: async () => [[saved], [saved]],
    signal: new AbortController().signal,
    write: async (_rules, text) => {
      inputs.push(JSON.parse(text));
      return JSON.stringify(answers[inputs.length - 1]);
    },
  });
  assert.equal(
    inputs[0].library[0].matches[0].source3d,
    saved.source3d,
    'matches offer the 3D form',
  );
  assert.match(
    inputs[1].validationError,
    /reused piece Champ must not be written again/,
    'a reused 3D form is not rewritten',
  );
  assert.match(source, /export const Champ = \(\(\) => \{[\s\S]*return Winner;/);
  assert.match(source, /export const Champ3D = \(\(\) => \{[\s\S]*return Winner3D;/);
  assert.doesNotMatch(source, /colors\.winner/, 'both reused forms take the new roles');
  assert.equal(choices[0].use, 'reuse');
  const [, loser] = libraryPieces(source, plan.styleBrief, ['Champ', 'Loser']);
  assert.match(loser.source, /export function Loser\(/);
  assert.doesNotMatch(loser.source, /Loser3D/);
  assert.match(loser.source3d, /^import \{ colors[^}]*\} from '\.\/kit';\nexport function Loser3D/);
  assert.deepEqual(loser.roles, ['loser']);
});

test('a 2D-only video reusing a piece leaves its 3D form out; a saved 2D-only piece may be reused in a 3D video', () => {
  const brief = { paletteRoles: { champ: 'leaf' } };
  const flat = [[{ id: 'a', name: 'Winner', roles: ['winner'], source: pieces }]];
  const code = 'export function Champ3D() { return <group />; }';
  const answer = JSON.stringify({ pieces: [{ name: 'Champ', use: 'reuse', id: 'a' }], code });
  assert.equal(pieceChoices(answer, ['Champ'], flat, brief, true).choices[0].use, 'reuse');
  const solid = [[{ ...flat[0][0], source3d: 'export function Winner3D() {}' }]];
  assert.throws(() => pieceChoices(answer, ['Champ'], solid, brief, true), /written again/);
  assert.ok(pieceChoices(answer, ['Champ'], solid, brief, false), 'no 3D cut, no 3D reuse');
});

test('the writer asks for parts; the library is searched for them; the own part of the video wins and parts are saved as their own entries', async (t) => {
  const looks = { city: 'small town', stadium: 'round stadium', person: 'stick person' };
  const plan = planFor(composition, 1);
  plan.styleBrief = {
    ...plan.styleBrief,
    paletteRoles: { city: 'leaf', stadium: 'rust' },
    recurringObjects: [
      { name: 'city', position: 'left', colorRole: 'city', look: looks.city },
      { name: 'stadium', position: 'right', colorRole: 'stadium', look: looks.stadium },
    ],
  };
  const vectors = { [looks.city]: [0, 1], [looks.stadium]: [0.6, 0.8], [looks.person]: [1, 0] };
  const person = (width) =>
    `import { palette } from './kit';\nexport function Person({ x, y }) { return <div style={{ left: x, top: y, width: ${width}, background: palette.paper }} />; }`;
  const written = `${person(22)}
export function Stadium({ x, y }) { return <div style={{ left: x, top: y, background: colors.stadium }}><Person x={x} y={y} /><Person x={x + 30} y={y} /></div>; }`.replace(
    'import { palette }',
    'import { colors, palette }',
  );
  const inputs = [],
    rules = [];
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions.startsWith('You write the set pieces')) {
          inputs.push(JSON.parse(text));
          rules.push(tree.instructions);
          if (inputs.length === 1)
            return complete(
              emit,
              JSON.stringify({ parts: [{ name: 'Person', look: looks.person }] }),
            );
          const id = (n) =>
            inputs[1].library.flatMap((l) => l.matches).find((m) => m.name === n).id;
          return complete(
            emit,
            JSON.stringify({
              pieces: [
                { name: 'City', use: 'reuse', id: id('Town') },
                { name: 'Stadium', use: 'new' },
                { name: 'Person', use: 'new' },
              ],
              code: written,
            }),
          );
        }
        complete(emit, composition);
      },
    },
    { videoEmbed: async (texts) => texts.map((t) => vectors[t]), videoRender: fakeRender },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const libraryPerson = env.store.savePiece(
    {
      name: 'Person',
      look: 'stick figure',
      props: ['x', 'y'],
      source: person(11),
      roles: [],
      embedding: [1, 0.1],
    },
    'old-video',
  );
  const town = env.store.savePiece(
    {
      name: 'Town',
      look: 'small town',
      props: ['x', 'y'],
      source: `import { colors } from './kit';\nexport function Town({ x, y }) { return <div style={{ left: x, top: y, background: colors.town }}><Person x={x} y={y} /></div>; }`,
      roles: ['town'],
      parts: [{ name: 'Person', id: libraryPerson }],
      embedding: [0, 1],
    },
    'old-video',
  );
  const chat = env.store.create('Parts', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.ok(rules[0].includes(PIECES_PARTS_NOTE));
  assert.equal(inputs[0].parts, undefined);
  assert.deepEqual(inputs[1].parts, [{ name: 'Person', look: looks.person }]);
  assert.deepEqual(
    inputs[1].library.map((l) => [l.name, l.matches[0].name]),
    [
      ['City', 'Town'],
      ['Stadium', 'Town'],
      ['Person', 'Person'],
    ],
    'the library lookup runs for the candidate part too',
  );
  assert.deepEqual(inputs[1].library[0].matches[0].parts, ['Person'], 'matches name their parts');

  const module = JSON.parse(row.source).pieces;
  assert.equal((module.match(/function Person\(/g) ?? []).length, 1, "the video's own Person wins");
  assert.match(module, /width: 22/);
  assert.doesNotMatch(module, /width: 11/, 'the library part of the same name stays out');
  assert.match(module, /colors\.city/, 'the reused piece takes the new roles');

  const fresh = env.store.db
    .prepare('SELECT id FROM pieces WHERE id NOT IN (?,?) ORDER BY rowid')
    .all(libraryPerson, town)
    .map((r) => env.store.piece(r.id));
  const [savedPerson, stadium] = ['Person', 'Stadium'].map((n) => fresh.find((p) => p.name === n));
  assert.equal(fresh.length, 2, 'the new piece and the new part are saved; the reused one is not');
  assert.equal(savedPerson.look, looks.person, 'a part is a library piece of its own');
  assert.deepEqual(stadium.parts, [{ name: 'Person', id: savedPerson.id }]);
  assert.doesNotMatch(stadium.source, /function Person/, 'a piece refers to its parts');
  assert.deepEqual(env.store.piece(town).videos, ['old-video', row.id]);

  // An improved part reaches later assemblies of the pieces using it; the saved video keeps its module.
  env.store.improvePiece(savedPerson.id, { source: person(33), props: ['x', 'y'], roles: [] });
  assert.equal(
    JSON.parse(env.store.tree(chat.id).artifacts.find((a) => a.id === row.id).source).pieces,
    module,
  );
  const later = withParts(env.store.pieceTree(stadium.id));
  assert.match(later.source, /width: 33/);
  assert.match(later.source, /export const Person = \(\(\) => \{/);
});

test('a reused piece brings its parts in both forms, scoped and role-remapped; a bad parts request is retried', async () => {
  const person = {
    id: 'p',
    name: 'Person',
    look: 'stick person',
    props: ['x', 'y'],
    roles: ['crowd'],
    source: `import { colors } from './kit';\nexport function Person({ x }) { return <div style={{ left: x, background: colors.crowd }} />; }`,
    source3d: `import { colors } from './kit';\nexport function Person3D() { return <group><mesh><meshStandardMaterial color={colors.crowd} /></mesh></group>; }`,
    parts: [],
  };
  const town = {
    id: 't',
    name: 'Town',
    look: 'small town',
    props: ['x', 'y'],
    roles: ['town'],
    source: `import { colors } from './kit';\nexport function Town({ x }) { return <div style={{ left: x, background: colors.town }}><Person x={x} /></div>; }`,
    source3d: `import { colors } from './kit';\nexport function Town3D() { return <group><Person3D /><mesh><meshStandardMaterial color={colors.town} /></mesh></group>; }`,
    parts: [{ name: 'Person', id: 'p', piece: person }],
  };
  const plan = planFor(composition, 1);
  plan.cuts[0].dimension = '3d';
  plan.styleBrief = {
    ...plan.styleBrief,
    paletteRoles: { city: 'leaf' },
    recurringObjects: [{ name: 'city', position: 'centre', colorRole: 'city', look: 'small town' }],
  };
  const answers = [
    { parts: [{ name: 'City', look: 'clash' }] },
    { pieces: [{ name: 'City', use: 'reuse', id: 't' }], code: '' },
  ];
  const inputs = [];
  const { source, parts } = await writeSetPieces({
    plan,
    names: ['City'],
    matches: async () => [[town]],
    signal: new AbortController().signal,
    write: async (_rules, text) => {
      inputs.push(JSON.parse(text));
      return JSON.stringify(answers[inputs.length - 1]);
    },
  });
  assert.match(inputs[1].validationError, /new PascalCase name/);
  assert.deepEqual(parts, []);
  assert.match(
    source,
    /export const City = \(\(\) => \{[\s\S]*const Person = \(\(\) => \{[\s\S]*return Town;/,
  );
  assert.match(
    source,
    /export const City3D = \(\(\) => \{[\s\S]*const Person3D = \(\(\) => \{[\s\S]*return Town3D;/,
  );
  assert.doesNotMatch(source, /colors\.(?:crowd|town)/, 'parts take the new roles too');
  assert.deepEqual(withParts(town).roles, ['town', 'crowd']);
  assert.equal(withParts(person).source, person.source, 'a piece without parts is unchanged');
});

test('a plan with a 3D cut also gets a <Name>3D mesh group per object, written for a 2D-only reused piece', async () => {
  const horse = `import { colors } from './kit';
export function Horse({x, y}) { return <div style={{left:x, top:y, color:colors.winner}}>Horse</div>; }`;
  const solid = `import { colors } from './kit';
export function Horse3D({position = [0, 0, 0]}) { return <group position={position}><mesh><boxGeometry args={[3, 2, 1]} /><meshStandardMaterial color={colors.winner} /></mesh></group>; }`;
  const library = {
    id: 'drawn-horse',
    name: 'Horse',
    look: 'A horse',
    roles: ['winner'],
    source: horse,
  };
  const plan = planFor();
  plan.styleBrief = {
    ...plan.styleBrief,
    recurringObjects: [{ name: 'horse', look: 'A horse', colorRole: 'winner', position: 'centre' }],
  };
  plan.cuts[0].dimension = '3d';
  const inputs = [];
  const result = await writeSetPieces({
    plan,
    names: ['Horse'],
    matches: async () => [[library]],
    signal: new AbortController().signal,
    write: async (_rules, text) => {
      inputs.push(JSON.parse(text));
      const code = inputs.length === 1 ? '' : solid;
      return JSON.stringify({ pieces: [{ name: 'Horse', use: 'reuse', id: library.id }], code });
    },
  });
  assert.deepEqual(inputs[0].solidNames, ['Horse3D']);
  assert.match(inputs[1].validationError, /missing export Horse3D/);
  assert.match(result.source, /export function Horse3D/);
  const [entry] = libraryPieces(result.source, plan.styleBrief, ['Horse']);
  assert.equal(entry.name, 'Horse');
  assert.match(entry.source3d, /export function Horse3D/, 'the 3D form joins its 2D entry');
});
