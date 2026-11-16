import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  planFor,
  composition,
  manimCut,
  directive,
  complete,
  until,
  open,
  fakeRender,
} from '../support/video-kit.mjs';
import { videoPlan, cutSource, pieceNames, libraryPieces } from '../../server/media/video-plan.mjs';
import { REMOTION_SKILL, MANIM_SKILL } from '../../server/media/skills.mjs';

const look = 'A rounded box 240x120 px with a crown on top, one third of its height.';
const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x - 120 * scale, top: y - 60 * scale, width: 240 * scale, height: 120 * scale, borderRadius: 16, background: highlight ? colors.winner : palette.raised, color: palette.paper }}>Winner</div>;
}`;
const usesPieces = composition
  .replace('import { AbsoluteFill', "import { Winner } from './pieces';\nimport { AbsoluteFill")
  .replace('A + B → Final', '<Winner x={960} y={400} highlight />');
const videoPlanWithLooks = () => {
  const plan = planFor(composition, 3);
  plan.styleBrief = {
    ...plan.styleBrief,
    recurringObjects: [{ ...plan.styleBrief.recurringObjects[0], look }],
  };
  plan.cuts[2].engine = 'manim';
  return plan;
};
const manim = {
  detect: () => ({ ready: true, python: 'fake-python' }),
  render: fakeRender,
};

test('plan looks are validated; set-piece modules must export every named piece and keep kit colors', () => {
  const plan = videoPlanWithLooks();
  assert.deepEqual(videoPlan(JSON.stringify(plan)), plan);
  assert.deepEqual(pieceNames(plan), ['Winner']);
  assert.deepEqual(
    pieceNames({
      ...plan,
      styleBrief: { ...plan.styleBrief, recurringObjects: [{ name: '2 red routers', look }] },
    }),
    ['Piece2RedRouters'],
  );
  assert.deepEqual(
    pieceNames({ ...plan, cuts: [{ ...plan.cuts[2] }] }),
    ['Winner'],
    'Manim-only videos can select stock pieces',
  );
  assert.deepEqual(
    pieceNames(planFor()),
    [],
    'plans without looks (and older saved plans) get none',
  );
  const bad = structuredClone(plan);
  bad.styleBrief.recurringObjects[0].look = ' ';
  assert.throws(() => videoPlan(JSON.stringify(bad)), /malformed/);
  assert.equal(cutSource(pieces, plan.styleBrief, ['Winner']), pieces);
  assert.throws(
    () => cutSource(pieces, plan.styleBrief, ['Winner', 'Final']),
    /^Error: missing export Final\.$/,
  );
  assert.throws(
    () => cutSource(pieces.replace('palette.raised', "'white'"), plan.styleBrief, ['Winner']),
    /background/,
  );
  assert.throws(
    () => cutSource(`import { Winner } from './pieces';\n` + pieces, plan.styleBrief, ['Winner']),
    /disallowed import/,
  );
  assert.equal(cutSource(usesPieces, plan.styleBrief), usesPieces, 'cuts may import ./pieces');
});

test('one set-piece call runs before any cut; Remotion cuts get the module staged and in their input, Manim cuts get looks; phase and usage stage pieces', async (t) => {
  const plan = videoPlanWithLooks();
  const calls = [],
    inputs = {},
    staged = {},
    logs = [];
  let phaseAtPieces, livePieces, chat;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) {
          calls.push('plan');
          return complete(emit, JSON.stringify(plan));
        }
        const input = JSON.parse(text);
        if (tree.instructions.startsWith('You write the set pieces')) {
          calls.push('pieces');
          inputs.pieces = input;
          inputs.piecesInstructions = tree.instructions;
          const row = env.store.tree(chat.id).artifacts[0];
          phaseAtPieces = (
            await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}`)).json()
          ).phase;
          return complete(emit, '```tsx\n' + pieces + '\n```');
        }
        const i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
        calls.push(`cut ${i}`);
        inputs[i] = input;
        input.instructions = tree.instructions;
        if (i === 0) {
          const row = env.store.tree(chat.id).artifacts[0];
          livePieces = (
            await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}/cuts`)).json()
          ).pieces;
        }
        complete(emit, plan.cuts[i].engine === 'manim' ? manimCut : usesPieces);
      },
    },
    {
      log: (line) => logs.push(line),
      videoManim: manim,
      videoRender: async (ws, out) => {
        if (/^cut-\d$/.test(basename(ws)))
          staged[basename(ws)] = existsSync(join(ws, 'pieces.tsx'))
            ? readFileSync(join(ws, 'pieces.tsx'), 'utf8')
            : null;
        return fakeRender(ws, out);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  chat = env.store.create('Pieces', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.deepEqual(calls.slice(0, 2), ['plan', 'pieces']);
  assert.equal(calls.filter((c) => c === 'pieces').length, 1);
  assert.deepEqual(calls.slice(2).sort(), ['cut 0', 'cut 1', 'cut 2']);
  assert.deepEqual(inputs.pieces.names, ['Winner']);
  assert.ok(!('library' in inputs.pieces), 'without an embedder the step gets no matches');
  assert.equal(inputs.pieces.styleBrief.recurringObjects[0].look, look);
  assert.equal(phaseAtPieces, 'pieces');
  assert.match(livePieces, /function Winner/, 'live player receives compiled set pieces');
  assert.deepEqual(staged, { 'cut-0': pieces, 'cut-1': pieces, 'cut-2': null });
  for (const i of [0, 1]) assert.equal(inputs[i].setPieces, pieces);
  assert.ok(!('setPieces' in inputs[2]));
  // Each writer gets its engine's skill and no other.
  assert.ok(inputs.piecesInstructions.includes(REMOTION_SKILL));
  for (const i of [0, 1]) {
    assert.ok(inputs[i].instructions.includes(REMOTION_SKILL));
    assert.ok(!inputs[i].instructions.includes(MANIM_SKILL));
  }
  assert.ok(inputs[2].instructions.includes(MANIM_SKILL));
  assert.ok(!inputs[2].instructions.includes(REMOTION_SKILL));
  assert.equal(
    inputs[2].styleBrief.recurringObjects[0].look,
    look,
    'Manim cut input carries looks',
  );
  assert.equal(JSON.parse(row.source).pieces, pieces);
  assert.equal(
    logs.filter((l) => l.includes(' model finished ') && l.includes('stage="pieces"')).length,
    1,
  );
  assert.equal(env.store.usageEvents().events.filter((e) => e.task === 'video').length, 5);
  const saved = env.store.db.prepare('SELECT id FROM pieces').all();
  assert.equal(saved.length, 1, 'without an embedder the piece is still saved');
  const piece = env.store.piece(saved[0].id);
  assert.equal(piece.embedding, null);
  assert.deepEqual(
    [piece.name, piece.look, piece.roles, piece.videos],
    ['Winner', look, ['winner'], [row.id]],
  );
  assert.deepEqual(piece.props, ['x', 'y', 'scale', 'highlight', 'state']);
  assert.equal(piece.source, pieces);
});

test('a new video embeds each accepted set piece look and saves it to the piece library', async (t) => {
  const plan = videoPlanWithLooks();
  plan.cuts.pop();
  const embedded = [];
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions.startsWith('You write the set pieces')) return complete(emit, pieces);
        complete(emit, usesPieces);
      },
    },
    {
      videoEmbed: async (texts) => {
        embedded.push(...texts);
        return texts.map(() => [0.6, 0.8]);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const chat = env.store.create('Library', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.deepEqual(embedded, [look]);
  const [match] = env.store.nearestPieces([0.6, 0.8]);
  assert.equal(match.name, 'Winner');
  assert.deepEqual(match.videos, [row.id]);
  assert.ok(Math.abs(match.embedding[0] - 0.6) < 1e-6 && Math.abs(match.score - 1) < 1e-6);
});

test('library pieces split per export with shared helpers; set pieces colour only through roles', () => {
  const brief = {
    paletteRoles: { winner: 'amber', loser: 'rust' },
    recurringObjects: [
      { name: 'winner', look: 'crowned box' },
      { name: 'note', position: 'left' },
      { name: 'loser', look: 'grey box' },
    ],
  };
  const module = `import { colors, palette } from './kit';
const box = 240;
export function Winner({ x, y, glow }) {
  return <div style={{ left: x, top: y, width: box, background: colors.winner }} />;
}
export const Loser = (props) => <div style={{ color: palette.paper }}><Winner x={props.x} y={props.y} /></div>;`;
  const [winner, loser] = libraryPieces(module, brief, ['Winner', 'Loser']);
  assert.deepEqual([winner.name, winner.look, winner.roles], ['Winner', 'crowned box', ['winner']]);
  assert.ok(winner.props.includes('glow') && winner.props.includes('state'));
  assert.match(
    winner.source,
    /^import \{ colors, palette \} from '\.\/kit';\nconst box = 240;\nexport function Winner/,
  );
  assert.doesNotMatch(winner.source, /Loser/);
  assert.match(
    loser.source,
    /export function Winner[\s\S]*export const Loser/,
    'a piece keeps the pieces it draws',
  );
  assert.deepEqual(loser.roles, ['winner']);
  const strict = { ...brief, recurringObjects: [brief.recurringObjects[0]] };
  const piece = (style) =>
    `import { colors, palette${style.includes('series') ? ', series' : ''} } from './kit';\nexport function Winner() { return <div style={{ ${style} }} />; }`;
  assert.throws(() => cutSource(piece("color: '#dfae4e'"), strict, ['Winner']), /#dfae4e/);
  assert.throws(
    () => cutSource(piece('color: palette.amber'), strict, ['Winner']),
    /palette\.amber/,
  );
  assert.throws(() => cutSource(piece('color: series[0]'), strict, ['Winner']), /series/);
  assert.ok(
    cutSource(piece('color: colors.winner, background: palette.raised'), strict, ['Winner']),
  );
  assert.ok(
    cutSource(
      `import { palette } from './kit';\nexport default () => <div style={{ color: palette.amber }} />;`,
      strict,
    ),
    'cuts keep hue access',
  );
});

test('set pieces get two tries and fail by name; Retry keeps the plan, then keeps set pieces that succeeded', async (t) => {
  const plan = videoPlanWithLooks();
  plan.cuts.pop();
  let plans = 0,
    pieceCalls = 0,
    piecesOk = false,
    cutOk = false;
  const cutCalls = [0, 0],
    errors = [];
  const env = await open({
    generate: async (tree, text, emit) => {
      if (tree.id) return complete(emit, 'Watch.' + directive);
      if (tree.instructions.startsWith('You plan')) {
        plans++;
        return complete(emit, JSON.stringify(plan));
      }
      const input = JSON.parse(text);
      if (tree.instructions.startsWith('You write the set pieces')) {
        pieceCalls++;
        errors.push(input.validationError);
        return complete(
          emit,
          piecesOk ? pieces : pieces.replace('function Winner', 'function Champ'),
        );
      }
      const i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
      cutCalls[i]++;
      complete(
        emit,
        i === 1 && !cutOk
          ? usesPieces.replace('fontSize: 40', "fontSize: 40, color: 'blue'")
          : usesPieces,
      );
    },
  });
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const chat = env.store.create('Retry pieces', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const failed = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => a.status === 'failed'),
  );
  assert.equal(failed.error, 'Set pieces: missing export Winner. Retry keeps the plan.');
  assert.equal(pieceCalls, 2);
  assert.deepEqual(errors, [undefined, 'missing export Winner.'], 'the repair sees the error');
  assert.deepEqual(cutCalls, [0, 0]);
  await env.app.settled();

  piecesOk = true;
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
  const cutFailed = await until(() => {
    const r = env.store.artifact(chat.id, failed.id);
    return r.status === 'failed' && r.attempt !== failed.attempt && r;
  });
  assert.match(cutFailed.error, /^Cut 2 of 2: /);
  assert.equal(plans, 1, 'Retry keeps the plan');
  assert.equal(pieceCalls, 3);
  await env.app.settled();

  cutOk = true;
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
  const ready = await until(() => {
    const r = env.store.artifact(chat.id, failed.id);
    return r.status === 'ready' && r;
  });
  assert.equal(plans, 1);
  assert.equal(pieceCalls, 3, 'Retry keeps set pieces that succeeded');
  assert.deepEqual(cutCalls, [1, 3]);
  assert.equal(JSON.parse(ready.source).pieces, pieces);
});

test('instructions ask for looks, require set pieces in Remotion cuts and looks in Manim cuts', async () => {
  const { PLAN_INSTRUCTIONS } = await import('../../server/media/video-plan.mjs');
  const { CUT_INSTRUCTIONS } = await import('../../server/media/video-cut.mjs');
  const { MANIM_INSTRUCTIONS } = await import('../../server/media/manim-cut.mjs');
  assert.match(PLAN_INSTRUCTIONS, /"look":"shape, parts, proportions and size in frame pixels"/);
  assert.match(
    CUT_INSTRUCTIONS,
    /import them from "\.\/pieces" and use them for every recurring object/,
  );
  assert.match(
    MANIM_INSTRUCTIONS,
    /Draw each recurring object exactly as its styleBrief look describes/,
  );
});

test('cut and Manim instructions state the validator rule block', async () => {
  const { CUT_INSTRUCTIONS } = await import('../../server/media/video-cut.mjs');
  const { MANIM_INSTRUCTIONS } = await import('../../server/media/manim-cut.mjs');
  for (const [text, color, font, imports] of [
    [
      CUT_INSTRUCTIONS,
      /colors\.<role>.*palette\.<neutral>.*or series/,
      /fonts\.heading or fonts\.reading/,
      /Imports come only from "react", "remotion", "\.\/kit"/,
    ],
    [
      MANIM_INSTRUCTIONS,
      /colors\['<role>'\].*palette\['<neutral>'\]/,
      /fonts\['heading'\] or fonts\['reading'\]/,
      /Imports come only as named objects from kit/,
    ],
  ]) {
    assert.match(
      text,
      /Validator rules, checked before rendering: colour and font literals are checked/,
    );
    assert.match(text, color);
    assert.match(text, font);
    assert.match(text, imports);
  }
});
