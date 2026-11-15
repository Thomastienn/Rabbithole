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
import { videoPlan, cutSource, pieceNames } from '../../server/media/video-plan.mjs';

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
    [],
    'Manim-only videos get no set pieces',
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
          const row = env.store.tree(chat.id).artifacts[0];
          phaseAtPieces = (
            await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}`)).json()
          ).phase;
          return complete(emit, '```tsx\n' + pieces + '\n```');
        }
        const i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
        calls.push(`cut ${i}`);
        inputs[i] = input;
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
  assert.equal(inputs.pieces.styleBrief.recurringObjects[0].look, look);
  assert.equal(phaseAtPieces, 'pieces');
  assert.match(livePieces, /function Winner/, 'live player receives compiled set pieces');
  assert.deepEqual(staged, { 'cut-0': pieces, 'cut-1': pieces, 'cut-2': null });
  for (const i of [0, 1]) assert.equal(inputs[i].setPieces, pieces);
  assert.ok(!('setPieces' in inputs[2]));
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
