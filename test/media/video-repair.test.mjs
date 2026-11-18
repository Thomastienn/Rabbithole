import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  planFor,
  composition,
  directive,
  complete,
  until,
  open,
  fakeRender,
  fixerTask,
  patchOf,
} from '../support/video-kit.mjs';
import {
  AUDIT_INSTRUCTIONS,
  PIECES_INSTRUCTIONS,
  REPAIR_NOTE,
  REPAIR_PATCH_NOTE,
} from '../../server/media/video-cut.mjs';

const look = 'A rounded box 240x120 px with a crown on top.';
const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x - 120 * scale, top: y - 60 * scale, width: 240 * scale, height: 120 * scale, background: highlight ? colors.winner : palette.raised }}>Winner</div>;
}`;
const broken = "import fs from 'node:fs';\n" + composition;
const repaired = composition.replace('PRIVATE_SOURCE_MARKER', 'REPAIRED');

test('a failed cut gets one repair with the failed code, set pieces and the previous last frame, then no audit; usage stage repair', async (t) => {
  const plan = planFor(composition, 2);
  plan.styleBrief = {
    ...plan.styleBrief,
    recurringObjects: [{ ...plan.styleBrief.recurringObjects[0], look }],
  };
  plan.cuts.forEach((c, i) => (c.narration = `Narration ${i}.`));
  const repairs = [],
    audits = [],
    logs = [];
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions.startsWith(PIECES_INSTRUCTIONS)) return complete(emit, pieces);
        const input = fixerTask(text),
          i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
        if (tree.instructions === AUDIT_INSTRUCTIONS) {
          audits.push({ i, images: tree.images });
          return complete(emit, '{"ok":true}');
        }
        if (tree.instructions.endsWith(REPAIR_PATCH_NOTE)) {
          repairs.push({ i, input, images: tree.images });
          return complete(emit, patchOf(input.failedCode, repaired));
        }
        complete(emit, i === 1 ? broken : composition);
      },
    },
    {
      log: (line) => logs.push(line),
      videoSnapshot: async (dir, list) => {
        for (const { file } of list) writeFileSync(file, 'jpeg');
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const chat = env.store.create('Repair', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.equal(repairs.length, 1);
  const [{ i, input, images }] = repairs;
  assert.equal(i, 1);
  assert.match(input.validationError, /import/i);
  assert.equal(input.failedCode, broken);
  assert.equal(input.setPieces, JSON.parse(row.source).pieces);
  assert.deepEqual(input.styleBrief, plan.styleBrief);
  assert.equal(input.previousEndState, plan.cuts[0].endState);
  assert.equal(input.previousLastFrame, true);
  const first = audits.find((a) => a.i === 0);
  assert.deepEqual(images, [first.images.at(-1)], "the repair sees cut 1's last frame");
  assert.deepEqual(
    audits.map((a) => a.i),
    [0],
    'the repaired cut gets no audit',
  );
  const saved = JSON.parse(row.source);
  assert.equal(saved.cuts[1].code, repaired);
  const stage = (s) =>
    logs.filter((l) => l.includes(' model finished ') && l.includes(`stage="${s}"`)).length;
  assert.equal(stage('repair'), 1);
  assert.equal(stage('audit'), 1);
});

test('adjacent repaired cuts share the repaired last frame; the first cut needs no previous frame', async (t) => {
  const plan = planFor(composition, 2);
  const repairs = [],
    shots = [];
  let audits = 0;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions === AUDIT_INSTRUCTIONS) {
          audits++;
          return complete(emit, '{"ok":true}');
        }
        if (tree.instructions.endsWith(REPAIR_PATCH_NOTE)) {
          repairs.push({ input: fixerTask(text), images: tree.images });
          return complete(emit, patchOf(fixerTask(text).failedCode, repaired));
        }
        complete(emit, broken);
      },
    },
    {
      videoSnapshot: async (dir, list) => {
        shots.push({
          dir: basename(dir),
          code: readFileSync(join(dir, 'Video.tsx'), 'utf8'),
          list,
        });
        for (const { file } of list) writeFileSync(file, 'jpeg');
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const chat = env.store.create('Adjacent repair', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.equal(repairs.length, 2);
  assert.equal(repairs[0].input.previousEndState, null);
  assert.equal(repairs[0].input.previousLastFrame, false);
  assert.equal(repairs[0].images, undefined);
  assert.equal(repairs[1].input.previousLastFrame, true);
  const previous = shots.find((s) => s.dir === 'cut-0');
  assert.equal(previous.code, repaired);
  assert.deepEqual(repairs[1].images, [{ path: previous.list.at(-1).file, type: 'image/jpeg' }]);
  assert.equal(audits, 0);
  assert.ok(JSON.parse(row.source).cuts.every((c) => c.code === repaired && c.audited));
});

test('a render repair sees the stripped diagnostic and failed code and gets no further audit', async (t) => {
  const plan = planFor(composition, 2);
  const events = [],
    repairs = [],
    snapshots = {};
  let renders = 0,
    chat,
    duringRepair;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        if (tree.instructions === AUDIT_INSTRUCTIONS) {
          events.push('audit');
          return complete(emit, '{"ok":true}');
        }
        if (tree.instructions.endsWith(REPAIR_PATCH_NOTE)) {
          events.push('repair');
          repairs.push({ input: fixerTask(text), images: tree.images });
          const id = env.store.tree(chat.id).artifacts[0].id;
          duringRepair = (await (await env.get(`/api/trees/${chat.id}/artifacts/${id}`)).json())
            .cutRows;
          return complete(emit, patchOf(fixerTask(text).failedCode, repaired));
        }
        complete(emit, composition);
      },
    },
    {
      videoSnapshot: async (dir, list) => {
        snapshots[basename(dir)] = list;
        for (const { file } of list) writeFileSync(file, 'jpeg');
      },
      videoRender: async (dir, out) => {
        if (basename(dir) === 'cut-1' && ++renders === 1)
          throw Object.assign(new Error('Video rendering failed.'), {
            diagnostic: `TypeError: shape is not a function at ${dir}/Video.tsx:3:4`,
          });
        return fakeRender(dir, out);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  chat = env.store.create('Render repair', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
  );
  assert.equal(row.status, 'ready', row.error);
  assert.equal(renders, 2);
  assert.equal(repairs.length, 1);
  assert.equal(
    repairs[0].input.validationError,
    'TypeError: shape is not a function at [path]:3:4',
  );
  assert.equal(repairs[0].input.failedCode, composition);
  assert.equal(repairs[0].input.previousEndState, plan.cuts[0].endState);
  assert.deepEqual(repairs[0].images, [
    { path: snapshots['cut-0'].at(-1).file, type: 'image/jpeg' },
  ]);
  assert.deepEqual(events, ['audit', 'audit', 'repair']);
  // A ready cut moves back to repairing while the phase stays at saving.
  assert.deepEqual(
    duringRepair.map((r) => r.state),
    ['ready', 'repairing'],
  );
  assert.equal(JSON.parse(row.source).cuts[1].code, repaired);
});

test('a repair patch that does not apply gets one whole-source call in the same attempt; a patch that still breaks spends the last attempt', async (t) => {
  for (const [answer, outcome] of [
    ['not a diff', 'ready'],
    [patchOf(broken, broken.replace('PRIVATE_SOURCE_MARKER', 'STILL_BROKEN')), 'failed'],
  ]) {
    const calls = [];
    const env = await open(
      {
        generate: async (tree, text, emit) => {
          if (tree.id) return complete(emit, 'Watch.' + directive);
          if (tree.instructions.startsWith('You plan'))
            return complete(emit, JSON.stringify(planFor(composition, 1)));
          if (tree.instructions === AUDIT_INSTRUCTIONS) return complete(emit, '{"ok":true}');
          if (tree.instructions.endsWith(REPAIR_PATCH_NOTE)) {
            calls.push(['patch', fixerTask(text).failedCode]);
            return complete(emit, answer);
          }
          if (tree.instructions.endsWith(REPAIR_NOTE)) {
            calls.push(['whole', JSON.parse(text).failedCode]);
            return complete(emit, repaired);
          }
          calls.push(['write']);
          complete(emit, broken);
        },
      },
      {
        videoSnapshot: async (dir, list) => {
          for (const { file } of list) writeFileSync(file, 'jpeg');
        },
      },
    );
    t.after(() => env.close());
    const chat = env.store.create('Patch repair', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
      env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    await env.app.stop();
    env.store.close();
    assert.equal(row.status, outcome, row.error);
    if (outcome === 'ready') {
      assert.deepEqual(calls, [['write'], ['patch', broken], ['whole', broken]]);
      assert.equal(JSON.parse(row.source).cuts[0].code, repaired);
    } else {
      assert.deepEqual(calls, [['write'], ['patch', broken]], 'no attempt past the limit');
      assert.match(row.error, /^Cut 1 of 1: .*import/i);
    }
  }
  t.diagnostic('fallback and limit checked');
});
